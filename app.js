'use strict';

const LEGACY_KEY = 'HOAI_SANCTUARY_DATA_V1';
const DB_NAME = 'HOAI_SANCTUARY';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
const $ = id => document.getElementById(id);
let database;
let appState;
let publishedState;
let baseRevision;
let currentFilter = 'ALL';
let pendingUploadB64 = '';
let imageVersion = 0;
let imageLoading = false;
let editingPostId = null;
let busy = false;
let draftDirty = false;
let draftTimer;
let previousFocus;
let storageVersion = 0;
let draftVersion = 0;
let appEventsReady = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function safeImage(value) {
  return typeof value === 'string' && (
    /^assets\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(value) ||
    /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value) ||
    HoaiCloud.isImageUrl(value)
  );
}

function canonicalGalleryTitle(image) {
  // Upgrade the two original captions when loading older cloud/local snapshots.
  // Preserve captions the owner has since customized.
  if (image.id === 'provided-1' && image.title === 'Phòng chờ phát sóng') return 'Buổi Tế Lễ';
  if (image.id === 'provided-5' && image.title === 'Người gác đêm') return 'Tổ chức FEMA';
  return image.title;
}

function validateState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.posts) || !Array.isArray(value.gallery)) {
    throw new Error('Bản sao lưu phải có danh sách bài viết và ảnh.');
  }
  if (typeof value.bio !== 'string' || !safeImage(value.avatar) || !['ALIVE', 'DIE'].includes(value.lifeState)) {
    throw new Error('Thông tin cá nhân trong bản sao lưu không hợp lệ.');
  }
  const validateIds = items => {
    const ids = new Set();
    for (const item of items) {
      if (!item || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id)) {
        throw new Error('Mã bài viết hoặc ảnh không hợp lệ hay bị trùng.');
      }
      ids.add(item.id);
    }
  };
  validateIds(value.posts);
  validateIds(value.gallery);
  for (const post of value.posts) {
    if (!['title', 'category', 'mood', 'date', 'content'].every(key => typeof post[key] === 'string') ||
        !['dark', 'kraft'].includes(post.style) || !safeImage(post.image)) {
      throw new Error('Một bài viết bị thiếu hoặc sai thông tin.');
    }
  }
  for (const image of value.gallery) {
    if (typeof image.title !== 'string' || !safeImage(image.src)) throw new Error('Một ảnh không hợp lệ.');
  }
  return {
    avatar: value.avatar, bio: value.bio, lifeState: value.lifeState,
    posts: value.posts.map(post => ({
      id: post.id, stamp: String(post.stamp ?? ''), title: post.title, category: post.category,
      mood: post.mood, style: post.style, date: post.date, image: post.image, content: post.content
    })),
    gallery: value.gallery.map(image => ({ id: image.id, title: canonicalGalleryTitle(image), src: image.src })),
    revision: typeof value.revision === 'string' ? value.revision : 'legacy'
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Hãy đóng các tab cũ rồi tải lại trang.'));
  });
}

function readRecord(key) {
  if (key === 'draft' && HoaiCloud.state.enabled) key = `draft:${HoaiCloud.draftKey}`;
  return new Promise((resolve, reject) => {
    const request = database.transaction('records', 'readonly').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(key, value) {
  if (key === 'draft' && HoaiCloud.state.enabled) key = `draft:${HoaiCloud.draftKey}`;
  return new Promise((resolve, reject) => {
    if (!database) return reject(new Error('Kho lưu trên máy chưa sẵn sàng. Hãy xuất bản sao lưu.'));
    const transaction = database.transaction('records', 'readwrite');
    transaction.objectStore('records').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Không thể lưu dữ liệu.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

function showToast(message) {
  $('toastBox').textContent = message;
  $('toastBox').style.display = 'block';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { $('toastBox').style.display = 'none'; }, 5000);
}

async function runMutation(action) {
  if (!canEdit()) { showToast('Chỉ chủ nhân đã đăng nhập mới được chỉnh sửa.'); return false; }
  if (busy) return false;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  try {
    await action();
    return true;
  } catch (error) {
    console.error('Không hoàn tất thao tác:', error);
    showToast('Chưa lưu: ' + (error.message || 'Bộ nhớ không khả dụng. Hãy sao lưu dữ liệu.'));
    $('storageStatus').textContent = 'Lưu thất bại. Nội dung hiện tại được giữ để bạn thử lại hoặc xuất sao lưu.';
    return false;
  } finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
  }
}

async function commitState(next, revision = baseRevision) {
  requireEditor();
  if (HoaiCloud.state.enabled) {
    $('storageStatus').textContent = 'Đang lưu bài và ảnh lên Supabase…';
    const saved = await HoaiCloud.save(validateState(next));
    appState = validateState(saved);
    baseRevision = saved.revision;
    $('storageStatus').textContent = 'Đã lưu trên Supabase • ' + new Date().toLocaleTimeString('vi-VN');
    updateStats();
    paintAccess();
    return;
  }
  await commitLocalState(next, revision);
}

async function commitLocalState(next, revision = baseRevision) {
  const nextVersion = storageVersion + 1;
  await new Promise((resolve, reject) => {
    if (!database) return reject(new Error('Kho lưu chưa sẵn sàng. Hãy tải lại trang.'));
    const transaction = database.transaction('records', 'readwrite');
    const store = transaction.objectStore('records');
    const request = store.get('state');
    let conflict = false;
    request.onsuccess = () => {
      if ((request.result?.version || 0) !== storageVersion) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put({ snapshot: next, baseRevision: revision, version: nextVersion }, 'state');
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(conflict
      ? new Error('Dữ liệu đã đổi ở tab khác. Sao lưu nội dung đang viết rồi tải lại trang.')
      : transaction.error || new Error('Không lưu được dữ liệu.'));
    transaction.onerror = () => reject(transaction.error);
  });
  storageVersion = nextVersion;
  appState = next;
  baseRevision = revision;
  $('storageStatus').textContent = 'Đã lưu trên máy • ' + new Date().toLocaleTimeString('vi-VN') + ' • Xuất dữ liệu để giữ trên GitHub.';
  updateStats();
}

function updateStats() {
  $('statPostCount').textContent = appState.posts.length;
  $('statImgCount').textContent = appState.gallery.length;
}

function applyStateToUI() {
  $('hoaiAvatar').src = appState.avatar;
  $('hoaiBio').textContent = appState.bio;
  paintLifeState();
  renderPosts();
  renderGallery();
  updateStats();
  paintAccess();
}

function paintLifeState() {
  const dead = appState.lifeState === 'DIE';
  $('statusDot').classList.toggle('die-mode', dead);
  $('statusBadge').textContent = dead ? 'DIE ? // OFFLINE IN SHADOWS' : 'ALIVE // ISOLATED';
  $('btnAlive').classList.toggle('active-alive', !dead);
  $('btnDie').classList.toggle('active-die', dead);
  $('btnAlive').setAttribute('aria-pressed', String(!dead));
  $('btnDie').setAttribute('aria-pressed', String(dead));
  $('sloganDisplay').style.color = dead ? '#ff4d4d' : '#00ff9d';
}

function setLifeState(mode) {
  return runMutation(async () => {
    await commitState({ ...appState, lifeState: mode });
    paintLifeState();
  });
}

async function compressImageFile(file, maxWidth = 1600, quality = .86) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Hãy chọn ảnh JPG, PNG, WebP hoặc GIF.');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Ảnh tối đa 20 MiB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không thể xử lý ảnh trong trình duyệt này.');
    context.fillStyle = '#030705';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function changeAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  return runMutation(async () => {
    const avatar = await compressImageFile(file, 800);
    await commitState({ ...appState, avatar });
    $('hoaiAvatar').src = avatar;
    event.target.value = '';
      showToast(HoaiCloud.state.enabled ? 'Đã lưu avatar lên Supabase.' : 'Đã lưu avatar trên máy.');
  });
}

async function selectPostImage(file) {
  if (!file) return;
  const version = ++imageVersion;
  imageLoading = true;
  $('draftStatus').textContent = 'Đang xử lý ảnh…';
  try {
    const image = await compressImageFile(file);
    if (version !== imageVersion) return;
    pendingUploadB64 = image;
    showPreview();
    scheduleDraft();
  } catch (error) {
    if (version === imageVersion) showToast(error.message || 'Không đọc được ảnh.');
  } finally {
    if (version === imageVersion) {
      imageLoading = false;
      $('draftStatus').textContent = 'Ảnh đã xử lý xong. Bản nháp tự lưu trên máy.';
    }
  }
}

function previewPostImage(event) { return selectPostImage(event.target.files[0]); }

function showPreview() {
  $('uploadPreviewImg').src = pendingUploadB64;
  $('uploadPreviewImg').style.display = pendingUploadB64 ? 'block' : 'none';
  $('uploadPromptText').style.display = pendingUploadB64 ? 'none' : 'block';
}

function clearPreviewImage() {
  ++imageVersion;
  imageLoading = false;
  pendingUploadB64 = '';
  $('postImageInput').value = '';
  showPreview();
  scheduleDraft();
}

function toggleComposer() {
  if (!canEdit()) return showToast('Hãy đăng nhập chủ nhân để viết bài.');
  const open = $('composerPanel').classList.toggle('open');
  if (open) {
    scrollToSec('composerPanel');
    $('postTitleInput').focus({ preventScroll: true });
  }
}

function getDraft() {
  return {
    title: $('postTitleInput').value, content: $('postContentInput').value,
    category: $('postCatInput').value, mood: $('postMoodInput').value,
    style: $('postStyleInput').value, image: pendingUploadB64, editingPostId
  };
}

function scheduleDraft() {
  if (!canEdit()) return;
  draftDirty = true;
  const version = ++draftVersion;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    writeRecord('draft', getDraft()).then(() => {
      if (version === draftVersion) {
        draftDirty = false;
        $('draftStatus').textContent = 'Đã lưu bản nháp trên máy.';
      }
    }).catch(() => {
      $('draftStatus').textContent = 'Chưa lưu được bản nháp. Hãy giữ trang này mở.';
    });
  }, 400);
}

function restoreDraft(draft) {
  if (!canEdit()) return;
  if (!draft || typeof draft.title !== 'string' || typeof draft.content !== 'string') return;
  $('postTitleInput').value = draft.title;
  $('postContentInput').value = draft.content;
  for (const [id, key] of [['postCatInput', 'category'], ['postMoodInput', 'mood'], ['postStyleInput', 'style']]) {
    if ([...$(id).options].some(option => option.value === draft[key])) $(id).value = draft[key];
  }
  pendingUploadB64 = safeImage(draft.image) ? draft.image : '';
  editingPostId = appState.posts.some(post => post.id === draft.editingPostId) ? draft.editingPostId : null;
  showPreview();
  if (draft.title || draft.content || pendingUploadB64) {
    $('composerPanel').classList.add('open');
    $('draftStatus').textContent = 'Đã khôi phục bản nháp lần trước.';
  }
}

function editPost(id) {
  if (!canEdit()) return showToast('Hãy đăng nhập chủ nhân để sửa bài.');
  if (($('postTitleInput').value || $('postContentInput').value || pendingUploadB64) &&
      !confirm('Thay bản nháp đang viết bằng bài muốn sửa?')) return;
  const post = appState.posts.find(item => item.id === id);
  if (!post) return;
  restoreDraft({ ...post, editingPostId: id });
  $('composerPanel').classList.add('open');
  scheduleDraft();
  scrollToSec('composerPanel');
}

function publishPost() {
  if (imageLoading) return showToast('Ảnh đang được xử lý. Hãy chờ xong rồi lưu bài.');
  const draft = getDraft();
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (!title || !content) return showToast('Hãy nhập tiêu đề và nội dung bài viết.');
  return runMutation(async () => {
    const existing = appState.posts.find(post => post.id === editingPostId);
    const now = new Date();
    const post = {
      id: existing?.id || 'post-' + crypto.randomUUID(),
      stamp: existing?.stamp || String(Math.max(0, ...appState.posts.map(item => Number(item.stamp) || 0)) + 1).padStart(2, '0'),
      title, content, category: draft.category, mood: draft.mood, style: draft.style,
      date: existing?.date || now.toLocaleString('vi-VN'),
      image: pendingUploadB64 || publishedState.avatar
    };
    const posts = existing ? appState.posts.map(item => item.id === post.id ? post : item) : [post, ...appState.posts];
    const gallery = pendingUploadB64.startsWith('data:') && !appState.gallery.some(item => item.src === pendingUploadB64)
      ? [{ id: 'gal-' + crypto.randomUUID(), title, src: pendingUploadB64 }, ...appState.gallery] : appState.gallery;
    await commitState({ ...appState, posts, gallery });
    clearTimeout(draftTimer);
    $('postTitleInput').value = '';
    $('postContentInput').value = '';
    editingPostId = null;
    clearPreviewImage();
    clearTimeout(draftTimer);
    try { await writeRecord('draft', null); draftDirty = false; }
    catch { showToast('Bài đã lưu; chưa xóa được bản nháp cũ.'); }
    currentFilter = 'ALL';
    $('searchInput').value = '';
    filterPosts('ALL', $('categoryFilters').querySelector('button'));
    renderGallery();
    $('composerPanel').classList.remove('open');
    showToast(HoaiCloud.state.enabled ? 'Đã lưu bài và ảnh lên Supabase.' : 'Đã lưu bài trên máy.');
  });
}

function filterPosts(category, button) {
  currentFilter = category;
  $('categoryFilters').querySelectorAll('button').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  renderPosts();
}

function renderPosts() {
  const query = $('searchInput').value.toLocaleLowerCase('vi').trim();
  const posts = appState.posts.filter(post => (currentFilter === 'ALL' || post.category === currentFilter) &&
    (!query || (post.title + '\n' + post.content).toLocaleLowerCase('vi').includes(query)));
  $('searchSummary').textContent = `${posts.length} / ${appState.posts.length} bài viết`;
  $('postsContainer').innerHTML = posts.length ? posts.map(post => `
    <article class="post-card ${post.style === 'kraft' ? 'kraft-style' : ''}">
      <button class="post-image-button" onclick="openReader('${post.id}')" aria-label="Đọc ${escapeHtml(post.title)}">
        <div class="post-img-wrap"><span class="stamp-number">#${escapeHtml(post.stamp)}</span>
          <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy">
          <span class="mood-tag">${escapeHtml(post.mood)}</span></div>
      </button>
      <div class="post-body"><div class="post-meta"><span>[${escapeHtml(post.category)}]</span><span>${escapeHtml(post.date)}</span></div>
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
        <div class="post-excerpt">${escapeHtml(post.content)}</div>
        <div class="post-footer">
          <button class="btn-sm" onclick="openReader('${post.id}')">ĐỌC HỒ SƠ →</button>
          <button data-owner ${canEdit() ? '' : 'hidden'} class="btn-sm" onclick="editPost('${post.id}')">SỬA</button>
          <button data-owner ${canEdit() ? '' : 'hidden'} class="btn-sm btn-danger-sm" onclick="deletePost('${post.id}')">XÓA</button>
        </div></div></article>`).join('') : `<div class="empty-state">${appState.posts.length
      ? 'Không tìm thấy bài phù hợp. Hãy đổi bộ lọc hoặc từ khóa.' : 'Chưa có bài viết. Viết vài dòng đầu tiên của Hoài nhé.'}</div>`;
}

function renderGallery() {
  $('galleryContainer').innerHTML = appState.gallery.length ? appState.gallery.map(image => `
    <div class="gallery-item">
      <button class="gallery-open" data-gallery-label onclick="viewGalleryImage('${image.id}')" aria-label="Xem ${escapeHtml(image.title)}">
        <img data-gallery-label src="${escapeHtml(image.src)}" alt="${escapeHtml(image.title)}" loading="lazy"></button>
      <div class="gallery-caption"><span>${escapeHtml(image.title)}</span>
        <button data-owner ${canEdit() ? '' : 'hidden'} class="btn-sm btn-danger-sm" onclick="deleteGalleryItem('${image.id}')">Xóa</button></div>
    </div>`).join('') : '<div class="empty-state">Kho ảnh đang trống. Thêm ảnh để giữ lại một khoảnh khắc.</div>';
}

function showReader(html) {
  previousFocus = document.activeElement;
  $('modalContentArea').innerHTML = html;
  $('readerModal').classList.add('open');
  document.body.classList.add('modal-open');
  $('readerModal').querySelector('button').focus();
  $('readerModal').querySelector('.modal-box').scrollTop = 0;
}

function openReader(id) {
  const post = appState.posts.find(item => item.id === id);
  if (!post) return;
  showReader(`<p class="helper-text">HỒ SƠ #${escapeHtml(post.stamp)} // ${escapeHtml(post.category)} // ${escapeHtml(post.date)}</p>
    <h2 class="reader-title">${escapeHtml(post.title)}</h2>
    <img class="reader-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">
    <div class="reader-body">${escapeHtml(post.content)}</div>
    <p class="helper-text">HOÀI // ${escapeHtml(post.mood)}</p>`);
}

function viewGalleryImage(id) {
  const image = appState.gallery.find(item => item.id === id);
  if (!image) return;
  showReader(`<h2 class="reader-title" data-gallery-label>${escapeHtml(image.title)}</h2>
    <img class="reader-image" data-gallery-label src="${escapeHtml(image.src)}" alt="${escapeHtml(image.title)}">`);
}

function closeReader() {
  $('readerModal').classList.remove('open');
  document.body.classList.remove('modal-open');
  if (previousFocus?.isConnected) previousFocus.focus();
}

function deletePost(id) {
  if (!confirm('Xóa bài viết này? Hãy xuất sao lưu nếu bạn muốn giữ bản cũ.')) return;
  return runMutation(async () => {
    await commitState({ ...appState, posts: appState.posts.filter(post => post.id !== id) });
    renderPosts();
    showToast(HoaiCloud.state.enabled ? 'Đã xóa bài trên Supabase. Ảnh trong kho được giữ lại.' : 'Đã xóa bài trên máy. Ảnh trong kho được giữ lại.');
  });
}

function uploadGalleryImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const title = prompt('Tên hoặc ghi chú cho ảnh:', file.name.replace(/\.[^.]+$/, ''));
  if (title === null) { event.target.value = ''; return; }
  return runMutation(async () => {
    const src = await compressImageFile(file, 1920);
    await commitState({ ...appState, gallery: [{ id: 'gal-' + crypto.randomUUID(), title: title.trim() || 'Ảnh của Hoài', src }, ...appState.gallery] });
    renderGallery();
    event.target.value = '';
    showToast(HoaiCloud.state.enabled ? 'Đã lưu ảnh lên Supabase.' : 'Đã lưu ảnh trên máy.');
  });
}

function deleteGalleryItem(id) {
  if (!confirm('Xóa ảnh khỏi kho? Ảnh đính kèm bài viết vẫn được giữ.')) return;
  return runMutation(async () => {
    await commitState({ ...appState, gallery: appState.gallery.filter(image => image.id !== id) });
    renderGallery();
    showToast(HoaiCloud.state.enabled ? 'Đã xóa ảnh khỏi kho Supabase. Tệp được giữ để không mất ảnh trong bài khác.' : 'Đã xóa ảnh khỏi kho trên máy.');
  });
}

async function saveBio() {
  if (!canEdit()) return true;
  if ($('hoaiBio').innerText.trim() === appState.bio) return true;
  return runMutation(async () => {
    await commitState({ ...appState, bio: $('hoaiBio').innerText.trim() });
    showToast('Đã lưu lời tự bạch.');
  });
}

async function downloadState(publish) {
  if (!await saveBio()) return showToast('Chưa lưu xong lời tự bạch. Hãy thử xuất lại.');
  if (busy) return showToast('Đang lưu dữ liệu. Hãy chờ rồi xuất lại.');
  const snapshot = { ...appState, revision: new Date().toISOString() };
  const serialized = JSON.stringify(snapshot, null, 2);
  const text = publish ? 'window.HOAI_INITIAL_DATA = ' + serialized.replace(/</g, '\\u003c') + ';\n' : serialized;
  const blob = new Blob([text], { type: publish ? 'text/javascript;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = publish ? 'site-data.js' : 'hoai-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  showToast(publish ? 'Đã xuất. Thay data/site-data.js trong repository rồi đẩy lên GitHub.' : 'Đã xuất bản sao lưu JSON.');
}

function exportBackupJSON() { return downloadState(false); }
function exportPublishedData() { return downloadState(true); }

function importBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  return runMutation(async () => {
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Bản sao lưu tối đa 80 MiB.');
      const imported = validateState(JSON.parse(await file.text()));
      const destination = HoaiCloud.state.enabled ? 'toàn bộ dữ liệu công khai trên Supabase' : 'dữ liệu trên máy';
      if (!confirm(`Thay ${destination} bằng ${imported.posts.length} bài viết và ${imported.gallery.length} ảnh? Nên xuất sao lưu hiện tại trước.`)) return;
      await commitState(imported);
      applyStateToUI();
      showToast(HoaiCloud.state.enabled ? 'Đã đưa bản sao lưu lên Supabase.' : 'Đã khôi phục bản sao lưu trên máy.');
    } finally { event.target.value = ''; }
  });
}

function loadPublishedData() {
  const destination = HoaiCloud.state.enabled ? 'dữ liệu công khai trên Supabase' : 'bài viết và ảnh trên máy';
  if (!confirm(`Thay ${destination} bằng bản trong repository? Hãy xuất sao lưu hiện tại trước.`)) return;
  return runMutation(async () => {
    await commitState(structuredClone(publishedState), publishedState.revision);
    applyStateToUI();
    $('publishedUpdate').hidden = true;
    showToast('Đã nạp dữ liệu xuất bản. Bản nháp vẫn được giữ.');
  });
}

function resetDefaultData() { return loadPublishedData(); }

function scrollToSec(id) {
  $(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function connectEvents() {
  setupRadioPlayer();
  $('hoaiBio').addEventListener('blur', saveBio);
  for (const id of ['postTitleInput', 'postContentInput', 'postCatInput', 'postMoodInput', 'postStyleInput']) {
    $(id).addEventListener('input', scheduleDraft);
  }
  const dropzone = $('dropzoneBox');
  for (const type of ['dragover', 'drop']) dropzone.addEventListener(type, event => event.preventDefault());
  dropzone.addEventListener('dragover', () => dropzone.classList.add('dragging'));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', event => {
    dropzone.classList.remove('dragging');
    void selectPostImage(event.dataTransfer.files[0]);
  });
  window.addEventListener('keydown', event => {
    if (!$('readerModal').classList.contains('open')) return;
    if (event.key === 'Escape') closeReader();
    if (event.key === 'Tab') {
      event.preventDefault();
      $('readerModal').querySelector('button').focus();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (draftDirty || busy || imageLoading || $('hoaiBio').innerText.trim() !== appState.bio) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    const ids = ['sec-hero', 'sec-posts', 'sec-gallery', 'sec-backup'];
    document.querySelectorAll('.nav-btn').forEach((button, index) => {
      const active = ids[index] === visible.target.id;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -45% 0px' });
  for (const id of ['sec-hero', 'sec-posts', 'sec-gallery', 'sec-backup']) observer.observe($(id));
  const updateClock = () => { $('clockDisplay').textContent = 'GIỜ ĐỊA PHƯƠNG: ' + new Date().toLocaleTimeString('vi-VN'); };
  updateClock();
  setInterval(updateClock, 1000);
}

async function init() {
  document.querySelector('main').inert = true;
  document.querySelector('header').inert = true;
  try {
    publishedState = validateState(window.HOAI_INITIAL_DATA);
    appState = structuredClone(publishedState);
    baseRevision = publishedState.revision;
    applyStateToUI();
    activateAppUI();
    $('storageStatus').textContent = HoaiCloud.state.enabled ? 'Đang kết nối kho Supabase…' : 'Đang mở kho trên máy…';
    try { database = await openDatabase(); }
    catch (error) { console.warn('Bộ nhớ trình duyệt không khả dụng:', error); }
    await HoaiCloud.ready;
    if (HoaiCloud.state.enabled) {
      if (HoaiCloud.state.error) throw HoaiCloud.state.error;
      const cloudSnapshot = await HoaiCloud.load();
      if (cloudSnapshot) appState = validateState(cloudSnapshot);
      cloudWritable = true;
      applyStateToUI();
      if (database && canEdit()) restoreDraft(await readRecord('draft'));
      $('publishedUpdate').hidden = true;
      $('storageStatus').textContent = cloudSnapshot ? 'Bài viết và ảnh công khai • Đã tải từ Supabase.' : 'Bài viết và ảnh công khai • Bản có sẵn của Hoài.';
      return;
    }
    if (!database) { applyStateToUI(); throw new Error('Không mở được bộ nhớ trình duyệt.'); }
    const saved = await readRecord('state');
    if (saved) {
      if (canEdit()) appState = validateState(saved.snapshot);
      baseRevision = saved.baseRevision;
      storageVersion = saved.version || 0;
    } else {
      let legacy;
      try {
        const old = localStorage.getItem(LEGACY_KEY);
        if (old) legacy = validateState(JSON.parse(old));
      } catch (error) { console.warn('Không thể chuyển bản lưu cũ:', error); }
      // Only this browser's old content is migrated; the provided gallery is additive.
      if (legacy && canEdit()) appState = { ...legacy, gallery: [...legacy.gallery, ...publishedState.gallery.filter(image => image.id.startsWith('provided-'))] };
      if (canEdit()) await commitLocalState(appState);
    }
    applyStateToUI();
    restoreDraft(await readRecord('draft'));
    $('publishedUpdate').hidden = !canEdit() || baseRevision === publishedState.revision;
    $('storageStatus').textContent = canEdit() ? 'Bản thử trên máy • Chưa kết nối Supabase.' : 'Cõi riêng của Hoài • Bài viết và ảnh công khai.';
    // State writes compare versions atomically, preventing one tab from overwriting another.
    database.onclose = () => { database = null; showToast('Kho lưu đã đóng. Hãy tải lại trang.'); };
  } catch (error) {
    console.error('Không mở được kho dữ liệu:', error);
    if (appState) applyStateToUI();
    $('storageStatus').textContent = HoaiCloud.state.enabled
      ? 'Chưa tải được kho trực tuyến. Đang hiển thị bản có sẵn; hãy thử tải lại trang.'
      : 'Không mở được kho trên máy. Bạn vẫn có thể xem bài và ảnh có sẵn.';
    if (HoaiCloud.state.enabled) $('cloudUpdate').hidden = false;
  } finally {
    if (appState) activateAppUI();
    HoaiCloud.watch();
    window.HOAI_APP_READY = true;
  }
}

function activateAppUI() {
  if (!appEventsReady) {
    connectEvents();
    setupAccess();
    appEventsReady = true;
  }
  document.querySelector('main').inert = false;
  document.querySelector('header').inert = false;
}

void init();
