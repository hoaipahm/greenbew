'use strict';

window.HoaiSurveillance = (() => {
  const $el = id => document.getElementById(id);
  let cameras = [];
  let camera = 0;
  let lastSwitch = Date.now();
  let lastPoll = 0;
  let timelineKey = '';
  let editing = null;
  let saving = false;
  let timer;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const range = hour => `${String(hour).padStart(2,'0')}:00 – ${String(hour + 2).padStart(2,'0')}:00`;

  function collectImages() {
    const state = typeof appState !== 'undefined' && appState ? appState : window.HOAI_INITIAL_DATA;
    const selected = cameras[camera]?.src;
    const images = new Map();
    if (state) {
      state.gallery.forEach(image => { if (!images.has(image.src)) images.set(image.src, { src: image.src, title: galleryCaption(image) }); });
      if (!images.has(state.avatar)) images.set(state.avatar, { src: state.avatar, title: HoaiLanguage.translate('Avatar của Hoài') });
      state.posts.forEach(post => { if (!images.has(post.image)) images.set(post.image, { src: post.image, title: post.title }); });
    }
    cameras = [...images.values()];
    const index = cameras.findIndex(image => image.src === selected);
    camera = index >= 0 ? index : 0;
    $el('cameraSelect').replaceChildren(...cameras.map((image, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${String(index + 1).padStart(2,'0')} / ${String(cameras.length).padStart(2,'0')} — ${image.title}`;
      return option;
    }));
  }

  function paintCamera() {
    const selected = cameras[camera];
    $el('cameraImage').hidden = !selected;
    if (!selected) { $el('cameraLocation').textContent = HoaiLanguage.translate('Kho ảnh đang trống.'); return; }
    if ($el('cameraImage').getAttribute('src') !== selected.src) $el('cameraImage').src = selected.src;
    $el('cameraImage').alt = selected.title;
    $el('cameraLocation').textContent = selected.title;
    $el('cameraNumber').textContent = `CAM ${String(camera + 1).padStart(2,'0')} / ${String(cameras.length).padStart(2,'0')}`;
    $el('cameraSelect').value = String(camera);
  }

  function paintTimeline(date, force = false) {
    const position = HoaiBroadcast.position(date);
    const schedule = HoaiBroadcast.schedule();
    const language = HoaiLanguage.current;
    const slot = schedule.find(item => item.hour === position.hour);
    const key = `${position.day}:${position.hour}:${language}:${schedule.map(item => item.revision).join(',')}:${canEdit()}`;
    if (force || key !== timelineKey) {
      timelineKey = key;
      const rows = schedule.map(item => {
        const row = document.createElement('li');
        const active = item.hour === position.hour;
        row.className = active ? 'on-air' : '';
        if (active) row.setAttribute('aria-current', 'time');
        const time = document.createElement('time');
        time.textContent = range(item.hour);
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = item[`title_${language}`];
        const excerpt = document.createElement('span');
        excerpt.textContent = item[`body_${language}`].split('\n').filter(line => line.trim())[0];
        copy.append(title, excerpt);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-sm';
        button.textContent = HoaiLanguage.translate('SỬA');
        button.dataset.owner = '';
        button.hidden = !canEdit();
        button.onclick = () => edit(item.hour);
        row.append(time, copy, button);
        return row;
      });
      $el('signalLog').replaceChildren(...rows);
    }
    $el('broadcastTime').textContent = range(position.hour);
    $el('broadcastHeadline').textContent = slot[`title_${language}`];
    const lines = slot[`body_${language}`].split('\n').filter(line => line.trim());
    const line = lines[Math.floor(date.getTime() / 12000) % lines.length];
    if ($el('broadcastBulletin').textContent !== line) $el('broadcastBulletin').textContent = line;
    $el('broadcastProgress').value = position.progress;
    $el('broadcastProgress').setAttribute('aria-label', HoaiLanguage.translate('Tiến trình khung phát'));
    $el('signalLog').setAttribute('aria-label', HoaiLanguage.translate('Lịch bản tin hư cấu trong ngày'));
    $el('broadcastSetupNotice').textContent = HoaiBroadcast.error ? HoaiLanguage.translate('Lịch mặc định đang phát. Để lưu lịch riêng, chạy supabase/broadcast.sql trong Supabase → SQL Editor.') : '';
  }

  function next() {
    if (!cameras.length) return;
    select((camera + 1) % cameras.length);
  }

  function select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= cameras.length) return;
    camera = index;
    lastSwitch = Date.now();
    paintCamera();
  }

  function tick(date = new Date()) {
    if (document.hidden) return;
    $el('cameraClock').textContent = clock.format(date);
    if (!reduceMotion.matches && date.getTime() - lastSwitch >= 18000) next();
    paintTimeline(date);
    if (date.getTime() - lastPoll >= 30000) {
      lastPoll = date.getTime();
      void HoaiBroadcast.load();
    }
  }

  function formValue() {
    return { hour: Number($el('broadcastHour').value), title_vi: $el('broadcastTitleVi').value.trim(), title_en: $el('broadcastTitleEn').value.trim(), body_vi: $el('broadcastBodyVi').value.trim(), body_en: $el('broadcastBodyEn').value.trim() };
  }

  function fillEditor(hour) {
    editing = structuredClone(HoaiBroadcast.schedule().find(slot => slot.hour === hour));
    $el('broadcastHour').value = String(hour);
    for (const [id, key] of [['broadcastTitleVi','title_vi'],['broadcastTitleEn','title_en'],['broadcastBodyVi','body_vi'],['broadcastBodyEn','body_en']]) $el(id).value = editing[key];
    $el('broadcastEditError').textContent = HoaiBroadcast.error ? HoaiLanguage.translate('Để lưu lịch riêng, chạy supabase/broadcast.sql trong Supabase → SQL Editor.') : '';
  }

  function edit(hour = HoaiBroadcast.position().hour) {
    if (!canEdit()) return showToast('Chỉ chủ nhân đã đăng nhập mới được chỉnh sửa.');
    if (saving) return;
    $el('broadcastHour').replaceChildren(...HoaiBroadcast.schedule().map(slot => {
      const option = document.createElement('option');
      option.value = slot.hour;
      option.textContent = range(slot.hour);
      return option;
    }));
    fillEditor(hour);
    $el('broadcastEditDialog').showModal();
    $el(HoaiLanguage.current === 'en' ? 'broadcastTitleEn' : 'broadcastTitleVi').focus();
  }

  function changeEditorHour() {
    const value = formValue();
    const dirty = ['title_vi','title_en','body_vi','body_en'].some(key => value[key] !== editing[key]);
    if (dirty && !confirm('Bỏ thay đổi chưa lưu để chuyển khung giờ?')) { $el('broadcastHour').value = editing.hour; return; }
    fillEditor(value.hour);
  }

  function closeEditor() {
    if (!saving) { $el('broadcastEditDialog').close(); editing = null; }
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !editing) return;
    let value;
    try { value = HoaiBroadcast.validate(formValue()); }
    catch (error) { $el('broadcastEditError').textContent = error.message; return; }
    saving = true;
    for (const id of ['broadcastSave','broadcastCancel','broadcastHour']) $el(id).disabled = true;
    try {
      const saved = await runMutation(async () => {
        await HoaiBroadcast.save(value, editing.revision);
        showToast('Đã lưu lịch phát.');
      });
      if (saved) { $el('broadcastEditDialog').close(); editing = null; }
      else $el('broadcastEditError').textContent = HoaiLanguage.translate('Chưa lưu được lịch. Nội dung vẫn được giữ; kiểm tra thông báo rồi thử lại.');
    } finally {
      saving = false;
      for (const id of ['broadcastSave','broadcastCancel','broadcastHour']) $el(id).disabled = false;
    }
  }

  $el('broadcastEditDialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); else editing = null; });
  window.addEventListener('hoai-images-change', () => { collectImages(); paintCamera(); });
  window.addEventListener('hoai-language-change', () => { collectImages(); paintCamera(); paintTimeline(new Date(), true); });
  window.addEventListener('hoai-broadcast-change', () => paintTimeline(new Date(), true));
  window.addEventListener('hoai-auth-change', () => paintTimeline(new Date(), true));
  window.addEventListener('storage', event => { if (event.key === 'HOAI_BROADCAST_V1') void HoaiBroadcast.load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', () => { clearInterval(timer); timer = null; });
  window.addEventListener('pageshow', () => { if (!timer) timer = setInterval(tick, 1000); tick(); });
  collectImages();
  paintCamera();
  tick();
  timer = setInterval(tick, 1000);
  return { next, select, tick, edit, save, changeEditorHour, closeEditor, get cameraCount() { return cameras.length; } };
})();
