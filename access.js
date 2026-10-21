'use strict';

let localEditor = false;
let cloudWritable = false;
const isLocalPreview = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
try { localEditor = isLocalPreview && sessionStorage.getItem('HOAI_LOCAL_EDITOR') === 'on'; }
catch { /* A local editing session can work without persisting the toggle. */ }

function canEdit() {
  return HoaiCloud.state.enabled
    ? HoaiCloud.state.owner && !HoaiCloud.state.error && cloudWritable
    : isLocalPreview && localEditor;
}

function requireEditor() {
  if (!canEdit()) throw new Error('Chỉ chủ nhân đã đăng nhập mới được chỉnh sửa.');
}

function paintAccess() {
  const owner = canEdit();
  document.querySelectorAll('[data-owner]').forEach(element => { element.hidden = !owner; });
  document.getElementById('hoaiBio').contentEditable = String(owner);
  document.getElementById('btnOwnerLogin').hidden = Boolean(HoaiCloud.state.user);
  document.getElementById('btnOwnerLogin').disabled = !HoaiCloud.state.enabled || HoaiCloud.state.loading || Boolean(HoaiCloud.state.error);
  document.getElementById('btnOwnerLogout').hidden = !HoaiCloud.state.user;
  document.getElementById('btnLocalEditor').hidden = !isLocalPreview || HoaiCloud.state.enabled;
  document.getElementById('btnLocalEditor').textContent = localEditor ? 'THOÁT SOẠN THẢO THỬ' : 'SOẠN THẢO THỬ TRÊN MÁY';
  document.getElementById('btnLocalEditor').setAttribute('aria-pressed', String(localEditor));
  document.getElementById('authStatus').textContent = HoaiCloud.state.loading ? 'ĐANG KẾT NỐI SUPABASE…' : owner
    ? (HoaiCloud.state.enabled ? 'CHỦ NHÂN // ĐÃ ĐĂNG NHẬP' : 'BẢN THỬ TRÊN MÁY')
    : (HoaiCloud.state.owner ? 'CHỦ NHÂN // KHO CHƯA SẴN SÀNG'
      : HoaiCloud.state.user ? 'UID: ' + HoaiCloud.state.user.id + ' // CHƯA CÓ QUYỀN SỬA' : 'KHÁCH // CHỈ XEM');
  document.getElementById('btnMigrateCloud').hidden = !HoaiCloud.state.enabled || HoaiCloud.state.hasData;
  document.getElementById('cloudAdminStatus').textContent = HoaiCloud.state.enabled
    ? (HoaiCloud.state.hasData ? 'Bài và ảnh được lưu trực tiếp trên Supabase.' : 'Supabase chưa có dữ liệu. Bạn có thể đưa bản trên máy lên bằng nút bên dưới.')
    : 'Chưa kết nối Supabase. Các thay đổi trong bản thử chỉ lưu trên trình duyệt này.';
  if (!owner) {
    document.getElementById('publishedUpdate').hidden = true;
    document.getElementById('composerPanel').classList.remove('open');
    if (typeof appState !== 'undefined' && appState) document.getElementById('hoaiBio').textContent = appState.bio;
  }
}

function loginOwner() {
  if (!HoaiCloud.state.enabled || HoaiCloud.state.loading || HoaiCloud.state.error) return;
  document.getElementById('ownerLoginError').textContent = '';
  document.getElementById('ownerLoginDialog').showModal();
  document.getElementById('ownerEmail').focus();
}

function closeOwnerLogin() {
  document.getElementById('ownerPassword').value = '';
  document.getElementById('ownerLoginDialog').close();
}

async function submitOwnerLogin(event) {
  event.preventDefault();
  const button = document.getElementById('ownerLoginSubmit');
  if (button.disabled) return;
  button.disabled = true;
  document.getElementById('ownerLoginError').textContent = 'Đang đăng nhập…';
  try {
    await HoaiCloud.login({
      email: document.getElementById('ownerEmail').value.trim(),
      password: document.getElementById('ownerPassword').value
    });
    closeOwnerLogin();
    paintAccess();
    if (canEdit() && database) restoreDraft(await readRecord('draft'));
    if (!canEdit()) showToast('Đã đăng nhập. Sao chép UID ở thanh trên để gán quyền chủ nhân theo hướng dẫn.');
  } catch (error) { document.getElementById('ownerLoginError').textContent = error.message; }
  finally { document.getElementById('ownerPassword').value = ''; button.disabled = false; paintAccess(); }
}

async function logoutOwner() {
  if (busy) return showToast('Đang lưu dữ liệu. Hãy chờ xong rồi đăng xuất.');
  try { await HoaiCloud.logout(); paintAccess(); }
  catch (error) { showToast('Chưa đăng xuất được: ' + error.message); }
}

async function toggleLocalEditor() {
  if (!isLocalPreview || HoaiCloud.state.enabled) return;
  localEditor = !localEditor;
  try { sessionStorage.setItem('HOAI_LOCAL_EDITOR', localEditor ? 'on' : 'off'); }
  catch { /* The toggle remains available for this tab. */ }
  paintAccess();
  if (localEditor && database) {
    const saved = await readRecord('state');
    if (saved) {
      appState = validateState(saved.snapshot);
      storageVersion = saved.version || 0;
      applyStateToUI();
    } else await commitState(appState);
    restoreDraft(await readRecord('draft'));
  }
}

async function importLocalToCloud() {
  if (!canEdit() || !HoaiCloud.state.enabled || HoaiCloud.state.hasData) return;
  if (!confirm('Đưa bản bài và ảnh trên trình duyệt này lên Supabase để mọi người xem?')) return;
  return runMutation(async () => {
    const saved = database ? await readRecord('state') : null;
    const snapshot = validateState(saved?.snapshot || appState);
    await commitState(snapshot);
    applyStateToUI();
    paintAccess();
    showToast('Đã đưa dữ liệu lên Supabase.');
  });
}

async function refreshCloudData() {
  if (!HoaiCloud.state.enabled || busy) return;
  try {
    const snapshot = await HoaiCloud.load();
    if (snapshot) {
      appState = validateState(snapshot);
      cloudWritable = true;
      applyStateToUI();
      paintAccess();
      document.getElementById('cloudUpdate').hidden = true;
    } else {
      cloudWritable = true;
      paintAccess();
      document.getElementById('cloudUpdate').hidden = true;
    }
  } catch (error) { showToast('Chưa tải được bản mới: ' + error.message); }
}

function setupAccess() {
  paintAccess();
  HoaiSounds.setup();
  document.getElementById('ownerLoginDialog').addEventListener('close', () => { document.getElementById('ownerPassword').value = ''; });
  window.addEventListener('hoai-auth-change', paintAccess);
  window.addEventListener('hoai-cloud-update', event => {
    // Let an acknowledged local commit finish before deciding whether it is remote.
    setTimeout(() => {
      if (event.detail.revision === appState.revision) return;
      if (canEdit() || busy) document.getElementById('cloudUpdate').hidden = false;
      else void refreshCloudData();
    }, 0);
  });
  window.addEventListener('hoai-cloud-watch-error', () => {
    document.getElementById('cloudUpdate').hidden = false;
  });
  HoaiCloud.watch();
}
