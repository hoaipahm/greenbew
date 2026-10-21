'use strict';

let editingGalleryId = null;
let galleryEditSaving = false;
const CAPTION_PREFIX = '@hoai-caption:';

function galleryCaptionParts(image) {
  if (image.title.startsWith(CAPTION_PREFIX)) {
    try {
      const value = JSON.parse(image.title.slice(CAPTION_PREFIX.length));
      if (typeof value.vi === 'string' && typeof value.en === 'string') return value;
    } catch { /* Older plain-text captions remain supported. */ }
  }
  return { vi: image.title, en: HoaiLanguage.english(image.title) };
}

function galleryCaption(image) {
  return galleryCaptionParts(image)[HoaiLanguage.current];
}

function editGalleryCaption(id) {
  if (!canEdit()) return showToast('Chỉ chủ nhân đã đăng nhập mới được chỉnh sửa.');
  if (galleryEditSaving) return;
  const image = appState.gallery.find(item => item.id === id);
  if (!image) return;
  editingGalleryId = id;
  const captions = galleryCaptionParts(image);
  $('galleryCaptionVi').value = captions.vi;
  $('galleryCaptionEn').value = captions.en;
  $('galleryEditError').textContent = '';
  $('galleryEditDialog').showModal();
  $(HoaiLanguage.current === 'en' ? 'galleryCaptionEn' : 'galleryCaptionVi').focus();
}

function closeGalleryEditor() {
  if (galleryEditSaving) return;
  $('galleryEditDialog').close();
  editingGalleryId = null;
}

async function saveGalleryCaption(event) {
  event.preventDefault();
  if (galleryEditSaving) return;
  const vi = $('galleryCaptionVi').value.trim();
  const en = $('galleryCaptionEn').value.trim();
  const title = CAPTION_PREFIX + JSON.stringify({ vi, en });
  if (!vi || !en || vi.length > 200 || en.length > 200 || title.length > 500) {
    $('galleryEditError').textContent = 'Nhập đủ hai ngôn ngữ, mỗi ngôn ngữ tối đa 200 ký tự.';
    return;
  }
  const id = editingGalleryId;
  if (!appState.gallery.some(image => image.id === id)) return closeGalleryEditor();
  galleryEditSaving = true;
  $('galleryEditSave').disabled = true;
  $('galleryEditCancel').disabled = true;
  try {
    const saved = await runMutation(async () => {
      await commitState({ ...appState, gallery: appState.gallery.map(image => image.id === id ? { ...image, title } : image) });
      renderGallery();
      if ($('readerModal').classList.contains('open') && $('readerModal').dataset.galleryId === id) viewGalleryImage(id, true);
      showToast('Đã lưu chú thích ảnh.');
    });
    if (saved) {
      $('galleryEditDialog').close();
      editingGalleryId = null;
    } else $('galleryEditError').textContent = 'Chưa lưu được. Nội dung vẫn được giữ để thử lại.';
  } finally {
    galleryEditSaving = false;
    $('galleryEditSave').disabled = false;
    $('galleryEditCancel').disabled = false;
  }
}

document.getElementById('galleryEditDialog').addEventListener('cancel', event => {
  if (galleryEditSaving) event.preventDefault();
  else editingGalleryId = null;
});
window.addEventListener('hoai-language-change', () => {
  if (typeof appState === 'undefined' || !appState) return;
  renderGallery();
  if ($('readerModal').classList.contains('open') && $('readerModal').dataset.galleryId) viewGalleryImage($('readerModal').dataset.galleryId, true);
});
