// SDK contract doubles: these checks never connect to a real project or execute SQL.
// Run: node --experimental-vm-modules tests/supabase-check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../supabase-client.js'), 'utf8');
const seedWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/site-data.js'), 'utf8'), { window: seedWindow });
const seed = JSON.parse(JSON.stringify(seedWindow.HOAI_INITIAL_DATA));
const ownerId = '00000000-0000-4000-8000-000000000001';
let passed = 0;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); passed++; console.log('PASS', name); }

async function environment({ enabled = true, key = 'sb_publishable_test', importFailure = false } = {}) {
  let user = null, authListener, record = null, commitError = null, imports = 0, poll;
  const files = new Map();
  const window = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  window.HOAI_SUPABASE = { enabled, url: 'https://demo-hoai.supabase.co', publishableKey: key, ownerId, bucket: 'hoai-images' };
  const client = {
    auth: {
      onAuthStateChange: callback => { authListener = callback; },
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      signInWithPassword: async credentials => {
        if (credentials.password !== 'correct') return { data: {}, error: new Error('bad password') };
        user = { id: credentials.email === 'owner@example.com' ? ownerId : 'other-user' };
        authListener('SIGNED_IN', { user });
        return { data: { user }, error: null };
      },
      signOut: async () => { user = null; authListener('SIGNED_OUT', null); return { error: null }; }
    },
    from: table => {
      assert.equal(table, 'hoai_site');
      return { select: () => ({ eq: (field, value) => {
        assert.equal(field, 'id'); assert.equal(value, 1);
        return { maybeSingle: async () => ({ data: structuredClone(record), error: null }) };
      } }) };
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'hoai-images');
      return {
        upload: async (name, blob, options) => {
          assert.equal(options.upsert, false);
          if (files.has(name)) return { error: { statusCode: '409', message: 'The resource already exists' } };
          if (user?.id !== ownerId) return { error: new Error('permission denied') };
          files.set(name, { size: blob.size, contentType: options.contentType });
          return { error: null };
        },
        getPublicUrl: name => ({ data: { publicUrl: 'https://demo-hoai.supabase.co/storage/v1/object/public/hoai-images/' + name } })
      };
    } },
    rpc: async (name, args) => {
      assert.equal(name, 'hoai_save');
      if (commitError) return { data: null, error: commitError };
      if (user?.id !== ownerId) return { data: null, error: { code: '42501', message: 'Owner only' } };
      if (args.p_expected_revision !== (record?.revision || null)) return { data: null, error: { code: '40001', message: 'Conflict' } };
      const revision = webcrypto.randomUUID();
      record = { payload: structuredClone(args.p_snapshot), revision };
      return { data: revision, error: null };
    }
  };
  const context = vm.createContext({ window, document, console, URL, CustomEvent, structuredClone, crypto: webcrypto,
    TextEncoder, Uint8Array, fetch, AbortSignal, atob, setTimeout, clearTimeout,
    setInterval: callback => { poll = callback; return 1; } });
  const script = new vm.Script(source, { importModuleDynamically: async specifier => {
    imports++;
    if (importFailure) throw new Error('SDK unavailable');
    assert.equal(specifier, 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
    const module = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', () => client); }, { context });
    await module.link(() => {}); await module.evaluate(); return module;
  } });
  script.runInContext(context);
  const cloud = window.HoaiCloud;
  await cloud.ready;
  return { cloud, files, window, get record() { return record; }, get imports() { return imports; },
    as: id => { user = id ? { id } : null; authListener('SIGNED_IN', user ? { user } : null); },
    failCommit: error => { commitError = error; },
    changeRevision: () => { record.revision = webcrypto.randomUUID(); },
    poll: async () => { poll(); await new Promise(resolve => setImmediate(resolve)); }
  };
}

(async () => {
  const disabled = await environment({ enabled: false });
  check('unconfigured Supabase does not load SDK or contact network', disabled.imports, 0);
  const secret = await environment({ key: 'sb_secret_not-for-browser' });
  check('secret project keys rejected before SDK initialization', secret.imports === 0 && Boolean(secret.cloud.state.error), true);
  const legacySecret = await environment({ key: 'eyJ.' + btoa(JSON.stringify({ role: 'service_role' })) + '.test' });
  check('legacy service role JWT rejected', legacySecret.imports === 0 && Boolean(legacySecret.cloud.state.error), true);
  const broken = await environment({ importFailure: true });
  check('SDK failure is explicit and clears loading state', Boolean(broken.cloud.state.error) && !broken.cloud.state.loading, true);
  const test = await environment();
  const { cloud, files } = test;
  check('anonymous visitor is not owner', cloud.state.owner, false);
  check('empty cloud remains empty until explicit owner migration', await cloud.load(), null);
  await assert.rejects(cloud.save(seed), /Chỉ chủ nhân/); passed++; console.log('PASS anonymous save rejected');
  await assert.rejects(cloud.login({ email: 'owner@example.com', password: 'wrong' }), /Đăng nhập thất bại/); passed++; console.log('PASS wrong password reported');
  await assert.rejects(cloud.login({ email: 'other@example.com', password: 'correct' }), /không có quyền/); passed++; console.log('PASS other user signed out and denied');
  check('unauthorized session cleared', cloud.state.user, null);
  await cloud.login({ email: 'owner@example.com', password: 'correct' });
  check('configured Supabase user recognized as owner', cloud.state.owner, true);
  const draft = structuredClone(seed);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZkAAAAASUVORK5CYII=';
  draft.avatar = image; draft.posts[0].image = image; draft.gallery[0].src = image;
  const saved = await cloud.save(draft);
  check('same image reused across avatar/post/gallery', files.size, 1);
  check('image content lives outside database snapshot', JSON.stringify(test.record).includes('data:image/'), false);
  check('uploaded images use allowed public bucket URL', cloud.isImageUrl(saved.avatar) && saved.avatar === saved.posts[0].image && saved.avatar === saved.gallery[0].src, true);
  check('input draft is preserved', draft.avatar, image);
  await cloud.save(draft);
  check('existing immutable image can be reused without overwrite', files.size, 1);
  check('one atomic snapshot preserves counts and order', [(await cloud.load()).posts.length, (await cloud.load()).gallery.length, (await cloud.load()).posts[0].id].join(','), '4,13,post-1');
  await cloud.logout();
  check('public read works without login', (await cloud.load()).posts.length, 4);
  await assert.rejects(cloud.save(saved), /Chỉ chủ nhân/); passed++; console.log('PASS logout revokes adapter writes');
  await cloud.login({ email: 'owner@example.com', password: 'correct' });
  const revision = cloud.state.revision;
  test.failCommit({ code: 'NETWORK', message: 'network unavailable' });
  await assert.rejects(cloud.save({ ...saved, bio: 'must not persist' }), /Chưa lưu/); passed++; console.log('PASS network failure reported');
  check('failed commit keeps acknowledged revision and stored profile', cloud.state.revision === revision && test.record.payload.bio !== 'must not persist', true);
  test.failCommit(null);
  test.changeRevision();
  await assert.rejects(cloud.save(saved), /máy khác/); passed++; console.log('PASS stale revision rejected');
  let incoming;
  test.window.addEventListener('hoai-cloud-update', event => { incoming = event.detail.revision; });
  cloud.watch(); await test.poll();
  check('polling announces remote revision without overwriting draft', incoming, test.record.revision);
  check('URL allowlist rejects other origins/buckets/script URLs', [cloud.isImageUrl('javascript:alert(1)'), cloud.isImageUrl(saved.avatar.replace('hoai-images', 'other-bucket')), cloud.isImageUrl(saved.avatar.replace('demo-hoai', 'other-project'))], [false, false, false]);
  await assert.rejects(cloud.save({ ...saved, bio: 'x'.repeat(10001) }), /giới hạn/); passed++; console.log('PASS oversized profile rejected');
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/setup.sql'), 'utf8');
  check('SQL includes RLS, explicit owner check and invoker CAS RPC', sql.includes('enable row level security') && sql.includes('auth.uid()') && sql.includes("errcode = '40001'") && sql.includes('security invoker'), true);
  console.log(`Verified ${passed} Supabase adapter contract checks with test doubles. Live project and SQL policies not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
