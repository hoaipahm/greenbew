'use strict';

// Pinned official browser SDK. Loaded only when a project is configured.
window.HoaiCloud = (() => {
  const config = window.HOAI_FIREBASE || {};
  const sdkRoot = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const state = { enabled: config.enabled === true, owner: false, user: null, error: null, revision: null, hasData: false };
  let authSDK, firestoreSDK, storageSDK, auth, firestore, storage;
  let previous;
  let unsubscribe;

  function announce() { window.dispatchEvent(new CustomEvent('hoai-auth-change')); }
  function assertOwner() {
    if (!state.owner || auth?.currentUser?.uid !== config.ownerUid) {
      throw new Error('Chỉ chủ nhân đã đăng nhập mới được lưu thay đổi.');
    }
  }

  function isImageUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === 'https://firebasestorage.googleapis.com' &&
        url.pathname.startsWith('/v0/b/' + config.firebase.storageBucket + '/o/') &&
        /^public\/images\/[a-f0-9]{64}\.(jpeg|png|webp|gif)$/.test(decodeURIComponent(url.pathname.split('/o/')[1])) &&
        url.searchParams.get('alt') === 'media';
    } catch { return false; }
  }

  const ready = (async () => {
    if (!state.enabled) return;
    try {
      if (!['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'].every(key => config.firebase?.[key])) {
        throw new Error('Cấu hình Firebase chưa đủ. Xem FIREBASE_SETUP.md.');
      }
      const [appSDK, authModule, firestoreModule, storageModule] = await Promise.all([
        import(sdkRoot + 'firebase-app.js'), import(sdkRoot + 'firebase-auth.js'),
        import(sdkRoot + 'firebase-firestore.js'), import(sdkRoot + 'firebase-storage.js')
      ]);
      authSDK = authModule;
      firestoreSDK = firestoreModule;
      storageSDK = storageModule;
      const app = appSDK.initializeApp(config.firebase);
      auth = authSDK.getAuth(app);
      firestore = firestoreSDK.getFirestore(app);
      storage = storageSDK.getStorage(app);
      await new Promise((resolve, reject) => {
        let first = true;
        authSDK.onAuthStateChanged(auth, user => {
          state.user = user;
          state.owner = Boolean(user && config.ownerUid && user.uid === config.ownerUid);
          announce();
          if (first) { first = false; resolve(); }
        }, reject);
      });
    } catch (error) {
      state.error = error;
      announce();
    }
  })();

  async function login() {
    await ready;
    if (state.error) throw state.error;
    if (!state.enabled) throw new Error('Chưa kết nối project Firebase.');
    const result = await authSDK.signInWithPopup(auth, new authSDK.GoogleAuthProvider());
    if (config.ownerUid && result.user.uid !== config.ownerUid) {
      await authSDK.signOut(auth);
      throw new Error('Tài khoản Google này không có quyền quản trị website.');
    }
  }

  async function logout() {
    await ready;
    if (auth) await authSDK.signOut(auth);
  }

  function reference(collection, id) { return firestoreSDK.doc(firestore, collection, id); }
  function clone(value) { return structuredClone(value); }

  async function load() {
    await ready;
    if (state.error) throw state.error;
    if (!state.enabled) return null;
    // The metadata fence detects concurrent commits across these public reads.
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await firestoreSDK.getDocFromServer(reference('site', 'meta'));
      if (!before.exists()) {
        state.hasData = false;
        state.revision = null;
        previous = null;
        return null;
      }
      const [profile, posts, gallery] = await Promise.all([
        firestoreSDK.getDocFromServer(reference('site', 'profile')),
        firestoreSDK.getDocsFromServer(firestoreSDK.collection(firestore, 'posts')),
        firestoreSDK.getDocsFromServer(firestoreSDK.collection(firestore, 'gallery'))
      ]);
      const after = await firestoreSDK.getDocFromServer(reference('site', 'meta'));
      if (!after.exists() || before.data().revision !== after.data().revision) continue;
      if (!profile.exists()) throw new Error('Dữ liệu Firebase thiếu thông tin cá nhân.');
      const metadata = after.data();
      const byId = snapshot => new Map(snapshot.docs.map(document => [document.id, { ...document.data(), id: document.id }]));
      const ordered = (order, snapshot) => {
        const records = byId(snapshot);
        if (!Array.isArray(order) || order.length !== records.size || order.some(id => !records.has(id))) {
          throw new Error('Danh sách dữ liệu Firebase chưa đầy đủ.');
        }
        return order.map(id => records.get(id));
      };
      const snapshot = {
        ...profile.data(), revision: metadata.revision,
        posts: ordered(metadata.postsOrder, posts), gallery: ordered(metadata.galleryOrder, gallery)
      };
      previous = clone(snapshot);
      state.revision = metadata.revision;
      state.hasData = true;
      return snapshot;
    }
    throw new Error('Dữ liệu đang thay đổi trên máy khác. Hãy tải lại.');
  }

  async function uploadImage(value, uploads) {
    if (!value.startsWith('data:image/')) return value;
    if (uploads.has(value)) return uploads.get(value);
    const blob = await (await fetch(value)).blob();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > 20 * 1024 * 1024) {
      throw new Error('Ảnh phải là JPG, PNG, WebP hoặc GIF và tối đa 20 MiB.');
    }
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const file = storageSDK.ref(storage, `public/images/${hash}.${blob.type.split('/')[1]}`);
    let url;
    try { url = await storageSDK.getDownloadURL(file); }
    catch (error) {
      if (error.code !== 'storage/object-not-found') throw error;
      await storageSDK.uploadBytes(file, blob, { contentType: blob.type, cacheControl: 'public,max-age=31536000,immutable' });
      url = await storageSDK.getDownloadURL(file);
    }
    uploads.set(value, url);
    return url;
  }

  async function prepareImages(snapshot) {
    const next = clone(snapshot);
    const uploads = new Map();
    next.avatar = await uploadImage(next.avatar, uploads);
    for (const post of next.posts) post.image = await uploadImage(post.image, uploads);
    for (const image of next.gallery) image.src = await uploadImage(image.src, uploads);
    return next;
  }

  function changedRecords(collection, next, old = []) {
    const before = new Map(old.map(item => [item.id, item]));
    const after = new Map(next.map(item => [item.id, item]));
    return [
      ...next.filter(item => JSON.stringify(item) !== JSON.stringify(before.get(item.id))).map(item => ({ collection, id: item.id, value: item })),
      ...old.filter(item => !after.has(item.id)).map(item => ({ collection, id: item.id, value: null }))
    ];
  }

  async function save(snapshot) {
    await ready;
    assertOwner();
    if (state.error) throw state.error;
    if (snapshot.bio.length > 10000 || snapshot.posts.some(post => post.title.length > 500 || post.content.length > 300000) ||
        snapshot.gallery.some(image => image.title.length > 500)) {
      throw new Error('Nội dung vượt giới hạn: tiêu đề 500 ký tự, bài 300.000 ký tự, bio 10.000 ký tự.');
    }
    const next = await prepareImages(snapshot);
    const changes = [
      ...changedRecords('posts', next.posts, previous?.posts),
      ...changedRecords('gallery', next.gallery, previous?.gallery)
    ];
    if (changes.length > 400) throw new Error('Mỗi lần chỉ thay tối đa 400 bài/ảnh. Hãy chia bản nhập thành các phần nhỏ.');
    const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
    if (next.posts.some(post => bytes(post) > 700000)) throw new Error('Một bài quá lớn. Hãy chia nội dung thành nhiều bài.');
    const revision = crypto.randomUUID();
    const metadata = { revision, postsOrder: next.posts.map(post => post.id), galleryOrder: next.gallery.map(image => image.id) };
    if (bytes(metadata) > 500000) throw new Error('Danh sách bài/ảnh quá lớn. Cần chia kho lưu thành nhiều trang.');
    const expectedRevision = state.revision;
    await firestoreSDK.runTransaction(firestore, async transaction => {
      const current = await transaction.get(reference('site', 'meta'));
      if ((current.exists() ? current.data().revision : null) !== expectedRevision) {
        throw new Error('Một máy khác đã sửa dữ liệu. Sao lưu bản đang viết rồi tải lại trước khi lưu tiếp.');
      }
      for (const change of changes) {
        const document = reference(change.collection, change.id);
        if (change.value) transaction.set(document, change.value);
        else transaction.delete(document);
      }
      transaction.set(reference('site', 'profile'), { avatar: next.avatar, bio: next.bio, lifeState: next.lifeState });
      transaction.set(reference('site', 'meta'), { ...metadata, updatedAt: firestoreSDK.serverTimestamp() });
    });
    next.revision = revision;
    previous = clone(next);
    state.revision = revision;
    state.hasData = true;
    return next;
  }

  function watch() {
    if (!state.enabled || state.error || unsubscribe) return;
    unsubscribe = firestoreSDK.onSnapshot(reference('site', 'meta'), snapshot => {
      const revision = snapshot.exists() ? snapshot.data().revision : null;
      if (revision && revision !== state.revision && !snapshot.metadata.hasPendingWrites) {
        window.dispatchEvent(new CustomEvent('hoai-cloud-update', { detail: { revision } }));
      }
    }, error => {
      console.warn('Không nhận được cập nhật Firebase:', error);
      window.dispatchEvent(new CustomEvent('hoai-cloud-watch-error'));
    });
  }

  return { state, ready, login, logout, load, save, watch, isImageUrl };
})();
