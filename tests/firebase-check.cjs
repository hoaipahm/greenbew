// Adapter contract tests with SDK test doubles; these do not execute Firebase rules.
// Run: node --experimental-vm-modules tests/firebase-check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../firebase-client.js'), 'utf8');
const seedWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/site-data.js'), 'utf8'), { window: seedWindow });
const seed = JSON.parse(JSON.stringify(seedWindow.HOAI_INITIAL_DATA));
let passed = 0;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); passed++; console.log('PASS', name); }

async function environment({ enabled = true, uid = null, importFailure = false } = {}) {
  const records = new Map();
  const files = new Map();
  const auth = { currentUser: uid ? { uid } : null };
  let listener, watcher, rejectCommit = false, writes = 0, imports = 0;
  const snapshot = value => ({ exists: () => value !== undefined, data: () => structuredClone(value), metadata: { hasPendingWrites: false } });
  const config = { enabled, ownerUid: 'owner', firebase: { apiKey: 'test', authDomain: 'test.firebaseapp.com', projectId: 'demo-hoai', storageBucket: 'demo-hoai.firebasestorage.app', appId: 'test' } };
  const window = new EventTarget();
  window.HOAI_FIREBASE = config;
  const sdk = {
    'firebase-app.js': { initializeApp: () => ({}) },
    'firebase-auth.js': {
      getAuth: () => auth,
      GoogleAuthProvider: class {},
      onAuthStateChanged: (_auth, callback) => { listener = callback; queueMicrotask(() => callback(auth.currentUser)); },
      signInWithPopup: async () => ({ user: auth.currentUser }),
      signOut: async () => { auth.currentUser = null; listener(null); }
    },
    'firebase-firestore.js': {
      getFirestore: () => ({}), doc: (_db, collection, id) => collection + '/' + id,
      collection: (_db, collection) => collection,
      getDocFromServer: async reference => snapshot(records.get(reference)),
      getDocsFromServer: async collection => ({ docs: [...records].filter(([key]) => key.startsWith(collection + '/')).map(([key, value]) => ({ id: key.split('/')[1], data: () => structuredClone(value) })) }),
      serverTimestamp: () => 'server-time',
      runTransaction: async (_db, action) => {
        if (rejectCommit) throw new Error('simulated network failure');
        if (auth.currentUser?.uid !== 'owner') throw new Error('permission-denied');
        const pending = [];
        await action({ get: async reference => snapshot(records.get(reference)), set: (reference, value) => pending.push([reference, structuredClone(value)]), delete: reference => pending.push([reference, null]) });
        for (const [key, value] of pending) { if (value) records.set(key, value); else records.delete(key); }
        writes = pending.length;
      },
      onSnapshot: (_reference, callback) => { watcher = callback; return () => {}; }
    },
    'firebase-storage.js': {
      getStorage: () => ({}), ref: (_storage, name) => name,
      getDownloadURL: async name => {
        if (!files.has(name)) { const error = new Error('missing'); error.code = 'storage/object-not-found'; throw error; }
        return 'https://firebasestorage.googleapis.com/v0/b/' + config.firebase.storageBucket + '/o/' + encodeURIComponent(name) + '?alt=media&token=test';
      },
      uploadBytes: async (name, blob, metadata) => { files.set(name, { size: blob.size, metadata }); }
    }
  };
  const context = vm.createContext({ window, console, URL, CustomEvent, structuredClone, crypto: webcrypto, TextEncoder, Uint8Array, fetch });
  const script = new vm.Script(source, {
    importModuleDynamically: async specifier => {
      imports++;
      if (importFailure) throw new Error('SDK unavailable');
      assert.ok(specifier.startsWith('https://www.gstatic.com/firebasejs/12.19.0/'));
      const exports = sdk[specifier.split('/').pop()];
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context });
      await module.link(() => {});
      await module.evaluate();
      return module;
    }
  });
  script.runInContext(context);
  const cloud = window.HoaiCloud;
  await cloud.ready;
  return {
    cloud, records, files, config, window,
    get imports() { return imports; }, get writes() { return writes; },
    as: uid => { auth.currentUser = uid ? { uid } : null; listener(auth.currentUser); },
    failCommits: value => { rejectCommit = value; },
    emitRevision: revision => watcher(snapshot({ revision }))
  };
}

(async () => {
  const disabled = await environment({ enabled: false });
  check('unconfigured Firebase makes no SDK requests', disabled.imports, 0);
  const broken = await environment({ importFailure: true });
  check('SDK failure leaves cloud read-only with explicit error', Boolean(broken.cloud.state.error) && !broken.cloud.state.owner, true);
  const test = await environment();
  const { cloud, records, files } = test;
  check('public access does not grant owner role', cloud.state.owner, false);
  check('empty public store does not auto-publish seed data', await cloud.load(), null);
  check('no documents created before owner action', records.size, 0);
  await assert.rejects(cloud.save(seed), /Chỉ chủ nhân/); passed++; console.log('PASS anonymous save rejected');
  test.as('someone-else');
  await assert.rejects(cloud.save(seed), /Chỉ chủ nhân/); passed++; console.log('PASS another account cannot save');
  await assert.rejects(cloud.login(), /không có quyền/); passed++; console.log('PASS unauthorized Google account signed out');
  test.as('owner');
  check('configured UID enables owner', cloud.state.owner, true);
  const draft = structuredClone(seed);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZkAAAAASUVORK5CYII=';
  draft.avatar = image; draft.posts[0].image = image; draft.gallery[0].src = image;
  const saved = await cloud.save(draft);
  check('same image uploaded once across avatar/post/gallery', files.size, 1);
  check('image bytes stored separately from Firestore', [...records.values()].some(record => JSON.stringify(record).includes('data:image/')), false);
  check('public image URLs replace embedded image data', cloud.isImageUrl(saved.avatar) && saved.avatar === saved.posts[0].image && saved.avatar === saved.gallery[0].src, true);
  check('input state not mutated by cloud upload', draft.avatar, image);
  check('post/gallery documents and profile/meta committed', records.size, seed.posts.length + seed.gallery.length + 2);
  check('all uploads have immutable cache and correct MIME', [...files.values()].every(file => file.metadata.contentType === 'image/png' && file.metadata.cacheControl.includes('immutable')), true);
  const publicData = await cloud.load();
  check('public read preserves post ordering', publicData.posts.map(post => post.id).join(','), seed.posts.map(post => post.id).join(','));
  test.as(null);
  check('anonymous reader can retrieve published posts', (await cloud.load()).posts.length, 4);
  test.as('owner');
  const edited = structuredClone(publicData); edited.posts[0].content = 'Updated text';
  await cloud.save(edited);
  check('editing one post only writes that post/profile/meta', test.writes, 3);
  const committedRevision = cloud.state.revision;
  test.failCommits(true);
  await assert.rejects(cloud.save({ ...edited, bio: 'must not persist' }), /network failure/); passed++; console.log('PASS failed commit reports failure');
  check('failed save preserves acknowledged cloud revision', cloud.state.revision, committedRevision);
  check('failed save leaves stored profile unchanged', records.get('site/profile').bio === 'must not persist', false);
  test.failCommits(false);
  records.get('site/meta').revision = 'another-device';
  await assert.rejects(cloud.save(edited), /máy khác/); passed++; console.log('PASS stale revision rejected atomically');
  cloud.watch();
  let notified;
  test.window.addEventListener('hoai-cloud-update', event => { notified = event.detail.revision; });
  test.emitRevision('remote-revision');
  check('remote changes announce the incoming revision', notified, 'remote-revision');
  check('image URL allowlist rejects other buckets and script URLs', [cloud.isImageUrl('javascript:alert(1)'), cloud.isImageUrl(saved.avatar.replace(test.config.firebase.storageBucket, 'other-bucket')), cloud.isImageUrl('https://example.com/picture.png')], [false, false, false]);
  await assert.rejects(cloud.save({ ...edited, bio: 'x'.repeat(10001) }), /giới hạn/); passed++; console.log('PASS oversized profile rejected before upload');
  records.get('site/meta').postsOrder = ['missing-post'];
  await assert.rejects(cloud.load(), /chưa đầy đủ/); passed++; console.log('PASS incomplete public dataset is not accepted');
  console.log(`Verified ${passed} Firebase adapter contract checks with test doubles. Live service/rules not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
