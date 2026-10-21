'use strict';

window.HoaiCloud = (() => {
  const config = window.HOAI_SUPABASE || {};
  const state = { enabled: config.enabled === true, owner: false, user: null, error: null, revision: null, hasData: false, loading: config.enabled === true };
  let client;
  let pollTimer;
  let checking = false;
  const announce = () => window.dispatchEvent(new CustomEvent('hoai-auth-change'));
  const draftKey = `supabase:${config.url || 'unconfigured'}:${config.ownerId || 'unassigned'}`;

  function setUser(user) {
    state.user = user;
    state.owner = Boolean(user && config.ownerId && user.id === config.ownerId);
    announce();
  }

  function isImageUrl(value) {
    try {
      const url = new URL(value);
      const origin = new URL(config.url).origin;
      return url.origin === origin && new RegExp('^/storage/v1/object/public/' + config.bucket + '/images/[a-f0-9]{64}\\.(jpeg|png|webp|gif)$').test(url.pathname);
    } catch { return false; }
  }

  async function timedFetch(input, options = {}) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    return fetch(input, { ...options, signal });
  }

  const ready = (async () => {
    if (!state.enabled) return;
    let timer;
    try {
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') ||
          !config.publishableKey || !/^[a-z0-9-]+$/.test(config.bucket || '')) {
        throw new Error('Thiếu cấu hình Supabase. Xem SUPABASE_SETUP.md.');
      }
      if (config.publishableKey.startsWith('sb_secret_')) throw new Error('Không dùng secret key trong website. Hãy dùng publishable key.');
      // Legacy anon JWTs are supported, but service_role JWTs must never reach a browser.
      if (config.publishableKey.startsWith('eyJ')) {
        try {
          const claims = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (claims.role !== 'anon') throw new Error('Chỉ dùng anon key hoặc publishable key cho website.');
        } catch { throw new Error('API key không phải anon key hợp lệ.'); }
      }
      const sdk = await Promise.race([
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Không tải được Supabase SDK. Hãy kiểm tra mạng rồi tải lại trang.')), 15000); })
      ]);
      client = sdk.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        global: { fetch: timedFetch }
      });
      client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      setUser(data.session?.user || null);
    } catch (error) { state.error = error; }
    finally { clearTimeout(timer); state.loading = false; announce(); }
  })();

  async function login(credentials) {
    await ready;
    if (state.error) throw state.error;
    if (!client) throw new Error('Chưa kết nối project Supabase.');
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error) throw new Error('Đăng nhập thất bại. Kiểm tra email và mật khẩu của tài khoản chủ nhân.');
    setUser(data.user);
    if (config.ownerId && data.user.id !== config.ownerId) {
      await client.auth.signOut();
      setUser(null);
      throw new Error('Tài khoản này không có quyền quản trị website.');
    }
  }

  async function logout() {
    await ready;
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setUser(null);
  }

  async function load() {
    await ready;
    if (state.error) throw state.error;
    if (!client) return null;
    const { data, error } = await client.from('hoai_site').select('payload,revision').eq('id', 1).maybeSingle();
    if (error) throw new Error('Chưa đọc được kho Supabase. Kiểm tra project và chạy supabase/setup.sql.');
    state.hasData = Boolean(data);
    state.revision = data?.revision || null;
    return data ? { ...data.payload, revision: data.revision } : null;
  }

  async function uploadImage(value, uploads) {
    if (!value.startsWith('data:image/')) return value;
    if (uploads.has(value)) return uploads.get(value);
    const blob = await (await fetch(value)).blob();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > 20 * 1024 * 1024) {
      throw new Error('Ảnh tối đa 20 MiB, định dạng JPG, PNG, WebP hoặc GIF.');
    }
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const path = `images/${hash}.${blob.type.split('/')[1]}`;
    const bucket = client.storage.from(config.bucket);
    const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    // Immutable hashed names can already exist, including uploads from another tab.
    if (error && !(['400', '409'].includes(String(error.statusCode)) && /already exists|duplicate/i.test(error.message))) throw error;
    const { data } = bucket.getPublicUrl(path);
    if (!data?.publicUrl || !isImageUrl(data.publicUrl)) throw new Error('Đường dẫn ảnh Supabase không hợp lệ.');
    uploads.set(value, data.publicUrl);
    return data.publicUrl;
  }

  async function save(snapshot) {
    await ready;
    if (state.error) throw state.error;
    if (!client || !state.owner) throw new Error('Chỉ chủ nhân đã đăng nhập mới được lưu thay đổi.');
    if (snapshot.bio.length > 10000 || snapshot.posts.length > 2000 || snapshot.gallery.length > 5000 ||
        snapshot.posts.some(post => post.title.length > 500 || post.content.length > 300000) ||
        snapshot.gallery.some(image => image.title.length > 500)) throw new Error('Nội dung vượt giới hạn của kho cá nhân.');
    const next = structuredClone(snapshot);
    const uploads = new Map();
    next.avatar = await uploadImage(next.avatar, uploads);
    for (const post of next.posts) post.image = await uploadImage(post.image, uploads);
    for (const image of next.gallery) image.src = await uploadImage(image.src, uploads);
    const payload = { avatar: next.avatar, bio: next.bio, lifeState: next.lifeState, posts: next.posts, gallery: next.gallery };
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 8 * 1024 * 1024) throw new Error('Kho dữ liệu vượt 8 MiB nội dung. Hãy chia nhỏ kho trước khi lưu.');
    const { data: revision, error } = await client.rpc('hoai_save', { p_snapshot: payload, p_expected_revision: state.revision });
    if (error) {
      if (error.code === '40001') throw new Error('Một máy khác đã lưu thay đổi. Sao lưu bản đang viết rồi tải bản mới trước khi lưu tiếp.');
      if (error.code === '42501') throw new Error('Supabase từ chối quyền ghi. Kiểm tra tài khoản và owner ID trong SQL.');
      throw new Error('Chưa lưu được lên Supabase: ' + error.message);
    }
    if (typeof revision !== 'string') throw new Error('Máy chủ chưa xác nhận bản lưu. Hãy tải bản mới để kiểm tra.');
    next.revision = revision;
    state.revision = revision;
    state.hasData = true;
    return next;
  }

  function watch() {
    if (!client || pollTimer || state.error) return;
    const check = async () => {
      if (document.hidden || checking) return;
      checking = true;
      try {
        const { data, error } = await client.from('hoai_site').select('revision').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (data?.revision && data.revision !== state.revision) {
          window.dispatchEvent(new CustomEvent('hoai-cloud-update', { detail: { revision: data.revision } }));
        }
      } catch { window.dispatchEvent(new CustomEvent('hoai-cloud-watch-error')); }
      finally { checking = false; }
    };
    pollTimer = setInterval(() => { void check(); }, 30000);
    document.addEventListener('visibilitychange', () => { void check(); });
  }

  return { state, ready, login, logout, load, save, watch, isImageUrl, draftKey };
})();
