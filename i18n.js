'use strict';

// Interface copy only: posts, captions, biography and input values are never translated.
window.HoaiLanguage = (() => {
  const entries = {
    '01. CÕI RIÊNG': '01. SANCTUARY',
    '02. NHẬT KÝ & HỒ SƠ': '02. JOURNAL & FILES',
    '03. KHO ẢNH': '03. IMAGE VAULT',
    '04. ĐÀI ĐÊM & DỮ LIỆU': '04. NIGHT RADIO & DATA',
    '+ VIẾT BÀI / TẢI ẢNH': '+ WRITE / UPLOAD',
    'KHÁCH // CHỈ XEM': 'VISITOR // READ ONLY',
    'ĐĂNG NHẬP CHỦ NHÂN': 'OWNER LOGIN',
    'ĐĂNG XUẤT': 'LOG OUT',
    'ĐĂNG NHẬP': 'LOG IN',
    'MẬT KHẨU': 'PASSWORD',
    'ĐÓNG': 'CLOSE',
    'ĐÓNG [X]': 'CLOSE [X]',
    'ĐÓNG [ESC]': 'CLOSE [ESC]',
    'SOẠN THẢO THỬ TRÊN MÁY': 'LOCAL EDITOR',
    'THOÁT SOẠN THẢO THỬ': 'EXIT LOCAL EDITOR',
    'BẢN THỬ TRÊN MÁY': 'LOCAL PREVIEW',
    'ĐANG KẾT NỐI SUPABASE…': 'CONNECTING TO SUPABASE…',
    'CHỦ NHÂN // ĐÃ ĐĂNG NHẬP': 'OWNER // SIGNED IN',
    'CHỦ NHÂN // KHO CHƯA SẴN SÀNG': 'OWNER // ARCHIVE NOT READY',
    'CHƯA CÓ QUYỀN SỬA': 'NO EDIT ACCESS',
    '♪ TIẾNG BẤM: BẬT': '♪ CLICK SOUND: ON',
    '♪ TIẾNG BẤM: TẮT': '♪ CLICK SOUND: OFF',
    'TẢI BẢN MỚI': 'LOAD UPDATE',
    'Bài và ảnh có cập nhật mới.': 'New posts and images are available.',
    'ĐƯA DỮ LIỆU TRÊN MÁY LÊN FIREBASE': 'UPLOAD LOCAL DATA TO SUPABASE',
    'NẠP BẢN TỪ GITHUB': 'LOAD FROM GITHUB',
    'Có bản dữ liệu mới trong repository. Bản trên máy vẫn được giữ nguyên.': 'A new repository version is available. Your local copy is preserved.',
    'CHỦ NHÂN: HOÀI': 'OWNER: HOÀI',
    '[Đổi Avatar]': '[Change avatar]',
    '* Nhấp trực tiếp vào khung chữ trên để sửa lời tự bạch của Hoài (Tự động lưu)': '* Click the biography above to edit (saved automatically)',
    'CHỦ SỞ HỮU': 'OWNER',
    'TỔNG BÀI VIẾT': 'TOTAL POSTS',
    'ẢNH LƯU TRỮ': 'ARCHIVED IMAGES',
    'TRẠNG THÁI CỬA': 'DOOR STATUS',
    'CÕI RIÊNG': 'SANCTUARY',
    '[TRẠM SOẠN THẢO TRỰC TIẾP TRÊN WEB CỦA HOÀI]': '[HOÀI’S WRITING TERMINAL]',
    'Bản nháp tự lưu trên máy khi bạn nhập.': 'Drafts are saved on this device as you type.',
    'Tiêu đề bài viết / Hồ sơ': 'Post / file title',
    'Ví dụ: Đêm thứ 14 - Chỉ còn tiếng radio...': 'Example: Night 14 — Only the radio remains...',
    'Chuyên mục': 'Category',
    'NHẬT KÝ ĐÊM': 'NIGHT JOURNAL',
    'HỒ SƠ MẬT': 'CLASSIFIED FILES',
    'TẢN VĂN CÔ ĐỘC': 'SOLITARY NOTES',
    'GÓC SUY NGẪM': 'REFLECTIONS',
    'Tâm trạng (Alive / Die)': 'Mood (Alive / Die)',
    'ALIVE // TỈNH TÁO': 'ALIVE // AWAKE',
    'ISOLATED // CÔ LẬP': 'ISOLATED // ALONE',
    'DIE ? // MẤT KẾT NỐI': 'DIE ? // DISCONNECTED',
    'SILENT // IM LẶNG': 'SILENT // STILL',
    'Phong cách thẻ bài': 'Post card style',
    "Đen Lục Bảo (No, I'm Not Human)": "Emerald darkness (No, I'm Not Human)",
    'Giấy Cũ Đóng Dấu Đỏ (14 Lies)': 'Aged paper, red stamp (14 Lies)',
    'Nội dung bài viết của Hoài': 'Post content',
    'Viết bất cứ điều gì Hoài muốn lưu giữ tại đây...': 'Write anything you want to preserve here...',
    'Tải ảnh đính kèm bài viết (Từ máy tính/điện thoại)': 'Attach an image (from your computer / phone)',
    'Nhấp để chọn ảnh hoặc kéo thả vào đây': 'Choose an image or drop it here',
    'Nén ảnh để lưu trên máy • Xuất bản sao lưu để giữ lâu dài': 'Images are compressed • Export backups for safekeeping',
    'Xóa ảnh đính kèm': 'Remove attachment',
    'LƯU BÀI VIẾT VÀO LÃNH ĐỊA': 'SAVE TO THE ARCHIVE',
    '02 // NHẬT KÝ & HỒ SƠ CỦA HOÀI': '02 // HOÀI’S JOURNAL & FILES',
    'Mọi suy nghĩ, câu chuyện và hình ảnh do chính Hoài viết và lưu trữ.': 'Thoughts, stories and images written and archived by Hoài.',
    '+ VIẾT BÀI MỚI NGAY': '+ WRITE A NEW POST',
    'TẤT CẢ': 'ALL',
    'Tìm kiếm trong nhật ký của Hoài...': 'Search Hoài’s journal...',
    'Tìm bài viết': 'Search posts',
    'ĐỌC HỒ SƠ →': 'READ FILE →',
    'SỬA': 'EDIT',
    'XÓA': 'DELETE',
    'Xóa': 'Delete',
    'Không tìm thấy bài phù hợp. Hãy đổi bộ lọc hoặc từ khóa.': 'No matching posts. Try another filter or search term.',
    'Chưa có bài viết. Viết vài dòng đầu tiên của Hoài nhé.': 'No posts yet. Write your first lines.',
    '03 // KHO LƯU TRỮ HÌNH ẢNH CÁ NHÂN': '03 // PERSONAL IMAGE VAULT',
    'Nơi Hoài tải lên những bức ảnh tâm đắc để trưng bày riêng.': 'A collection of images Hoài wants to keep and share.',
    '+ TẢI ẢNH LÊN KHO': '+ UPLOAD TO VAULT',
    'Kho ảnh đang trống. Thêm ảnh để giữ lại một khoảnh khắc.': 'The vault is empty. Add an image to preserve a moment.',
    'ĐÀI PHÁT THANH ĐÊM KHUYA // TẦN SỐ CỦA HOÀI': 'LATE NIGHT RADIO // HOÀI’S FREQUENCY',
    '▶ PHÁT NHẠC': '▶ PLAY MUSIC',
    'Ⅱ TẠM DỪNG': 'Ⅱ PAUSE',
    'ÂM LƯỢNG': 'VOLUME',
    'TỐC ĐỘ PHÁT': 'PLAYBACK SPEED',
    'TẦN SỐ NỀN': 'BACKGROUND FREQUENCY',
    'BẬT NỀN SYNTH': 'ENABLE SYNTH',
    'TẮT NỀN SYNTH': 'DISABLE SYNTH',
    'SÂU THẲM': 'DEEP',
    'CÔ ĐỘC': 'SOLITUDE',
    '● CHẠM VÀO TRANG ĐỂ NGHE NHẠC': '● TAP THE PAGE TO LISTEN',
    '● KHÔNG PHÁT ĐƯỢC': '● PLAYBACK UNAVAILABLE',
    '● LỖI TẢI NHẠC': '● AUDIO LOAD ERROR',
    '● ĐANG TẢI ĐOẠN NHẠC…': '● BUFFERING…',
    '● ĐANG TUA…': '● SEEKING…',
    'NỀN ĐANG TẮT': 'SYNTH OFF',
    'NỀN ĐANG PHÁT': 'SYNTH ON',
    'LƯU TRỮ & ĐƯA LÊN GITHUB PAGES': 'BACKUP & GITHUB PAGES',
    '⬆ XUẤT DỮ LIỆU CHO GITHUB': '⬆ EXPORT FOR GITHUB',
    '⬇ TẢI FILE SAO LƯU (.JSON)': '⬇ DOWNLOAD BACKUP (.JSON)',
    '⬆ NHẬP FILE DỮ LIỆU (.JSON)': '⬆ IMPORT BACKUP (.JSON)',
    'KHÔI PHỤC BẢN XUẤT BẢN': 'RESTORE PUBLISHED VERSION',
    'Trang cá nhân trên GitHub Pages có thể được người khác xem qua đường dẫn; đây chưa phải kho có mật khẩu.': 'Your GitHub Pages site is public. This is not a password-protected vault.',
    'Bài viết và ảnh mới được lưu trên trình duyệt này bằng IndexedDB. Để giữ trên GitHub và mở ở máy khác, xuất dữ liệu xuất bản, thay tệp': 'Local preview changes use IndexedDB. To publish a local copy on GitHub, export the published data, replace',
    'trong repository rồi đẩy lên GitHub. Bản JSON dùng để sao lưu và khôi phục trên máy.': 'in the repository and push to GitHub. JSON files provide local backup and restore.',
    'Tài khoản quản trị của Hoài. Khách có thể xem bài và ảnh mà không đăng nhập.': 'Hoài’s administrator account. Visitors can read posts and view images without signing in.',
    'Đang đăng nhập…': 'Signing in…',
    'Đang mở kho lưu trữ…': 'Opening the archive…',
    'Đang kết nối kho Supabase…': 'Connecting to the Supabase archive…',
    'Đang mở kho trên máy…': 'Opening the local archive…',
    'Bài viết và ảnh công khai • Đã tải từ Supabase.': 'Public posts and images • Loaded from Supabase.',
    'Bài viết và ảnh công khai • Bản có sẵn của Hoài.': 'Public posts and images • Hoài’s bundled copy.',
    'Cõi riêng của Hoài • Bài viết và ảnh công khai.': 'Hoài’s sanctuary • Public posts and images.',
    'Bản thử trên máy • Chưa kết nối Supabase.': 'Local preview • Supabase is not connected.',
    'Chưa tải được kho trực tuyến. Đang hiển thị bản có sẵn; hãy thử tải lại trang.': 'The online archive is unavailable. Showing the bundled copy; try reloading.',
    'Không mở được kho trên máy. Bạn vẫn có thể xem bài và ảnh có sẵn.': 'Local storage is unavailable. Bundled posts and images remain accessible.',
    'Bài và ảnh được lưu trực tiếp trên Supabase.': 'Posts and images are saved directly to Supabase.',
    'Supabase chưa có dữ liệu. Bạn có thể đưa bản trên máy lên bằng nút bên dưới.': 'Supabase is empty. Upload your local copy using the button below.',
    'Chưa kết nối Supabase. Các thay đổi trong bản thử chỉ lưu trên trình duyệt này.': 'Supabase is not connected. Preview changes are stored in this browser only.',
    'Đang lưu bài và ảnh lên Supabase…': 'Saving posts and images to Supabase…',
    'Đã lưu trên Supabase': 'Saved to Supabase',
    'Đã lưu trên máy': 'Saved on this device',
    'Xuất dữ liệu để giữ trên GitHub.': 'Export data to preserve it on GitHub.',
    'GIỜ ĐỊA PHƯƠNG:': 'LOCAL TIME:',
    'Đang xử lý ảnh…': 'Processing image…',
    'Ảnh đã xử lý xong. Bản nháp tự lưu trên máy.': 'Image ready. Drafts are saved on this device.',
    'Đã lưu bản nháp trên máy.': 'Draft saved on this device.',
    'Chưa lưu được bản nháp. Hãy giữ trang này mở.': 'Could not save the draft. Keep this page open.',
    'Đã khôi phục bản nháp lần trước.': 'Previous draft restored.',
    'Chỉ chủ nhân đã đăng nhập mới được chỉnh sửa.': 'Only the signed-in owner can edit.',
    'Hãy đăng nhập chủ nhân để viết bài.': 'Sign in as the owner to write a post.',
    'Hãy đăng nhập chủ nhân để sửa bài.': 'Sign in as the owner to edit a post.',
    'Hãy nhập tiêu đề và nội dung bài viết.': 'Enter a title and post content.',
    'Ảnh đang được xử lý. Hãy chờ xong rồi lưu bài.': 'Image processing is in progress. Wait before saving.',
    'Đã lưu avatar lên Supabase.': 'Avatar saved to Supabase.',
    'Đã lưu avatar trên máy.': 'Avatar saved on this device.',
    'Đã lưu bài và ảnh lên Supabase.': 'Post and images saved to Supabase.',
    'Đã lưu bài trên máy.': 'Post saved on this device.',
    'Đã lưu ảnh lên Supabase.': 'Image saved to Supabase.',
    'Đã lưu ảnh trên máy.': 'Image saved on this device.',
    'Đã lưu lời tự bạch.': 'Biography saved.',
    'Đã đưa dữ liệu lên Supabase.': 'Data uploaded to Supabase.',
    'Đã xuất bản sao lưu JSON.': 'JSON backup exported.',
    'Đã xuất. Thay data/site-data.js trong repository rồi đẩy lên GitHub.': 'Exported. Replace data/site-data.js in the repository and push to GitHub.',
    'Đã nạp dữ liệu xuất bản. Bản nháp vẫn được giữ.': 'Published data loaded. Drafts are preserved.',
    'Đã đưa bản sao lưu lên Supabase.': 'Backup uploaded to Supabase.',
    'Đã khôi phục bản sao lưu trên máy.': 'Local backup restored.',
    'Kho lưu đã đóng. Hãy tải lại trang.': 'The archive has closed. Reload the page.',
    'Chưa phát được nhạc. Kiểm tra kết nối rồi thử lại.': 'Could not play music. Check your connection and retry.',
    'Không tải được soundtrack. Kiểm tra tệp nhạc và kết nối.': 'Could not load the soundtrack. Check the audio file and connection.',
    'Thay bản nháp đang viết bằng bài muốn sửa?': 'Replace the current draft with this post?',
    'Xóa bài viết này? Hãy xuất sao lưu nếu bạn muốn giữ bản cũ.': 'Delete this post? Export a backup first if you want to keep a copy.',
    'Xóa ảnh khỏi kho? Ảnh đính kèm bài viết vẫn được giữ.': 'Remove this image from the vault? Post attachments will be preserved.',
    'Lưu thất bại. Nội dung hiện tại được giữ để bạn thử lại hoặc xuất sao lưu.': 'Save failed. Your content is preserved so you can retry or export a backup.',
    'Đang lưu dữ liệu. Hãy chờ xong rồi đăng xuất.': 'Saving data. Wait before signing out.',
    'Đang lưu dữ liệu. Hãy chờ rồi xuất lại.': 'Saving data. Wait before exporting.',
    'Chưa lưu xong lời tự bạch. Hãy thử xuất lại.': 'Biography not saved yet. Try exporting again.',
    'Bài đã lưu; chưa xóa được bản nháp cũ.': 'Post saved; the old draft could not be removed.',
    'Đã xóa bài trên Supabase. Ảnh trong kho được giữ lại.': 'Post deleted from Supabase. Vault images are preserved.',
    'Đã xóa bài trên máy. Ảnh trong kho được giữ lại.': 'Local post deleted. Vault images are preserved.',
    'Đã xóa ảnh khỏi kho Supabase. Tệp được giữ để không mất ảnh trong bài khác.': 'Image removed from the Supabase vault. The file is kept for other posts.',
    'Đã xóa ảnh khỏi kho trên máy.': 'Image removed from the local vault.',
    'Kết nối với Hoài': 'Connect with Hoài',
    'Điều hướng chính': 'Main navigation',
    'Facebook của Hoài (mở tab mới)': 'Hoài’s Facebook (opens a new tab)',
    'Tham gia Discord của Hoài (mở tab mới)': 'Join Hoài’s Discord (opens a new tab)',
    'Discord // Tín hiệu từ Hoài': 'Discord // Signal from Hoài',
    'Avatar của Hoài': 'Hoài’s avatar',
    'Lời tự bạch của Hoài': 'Hoài’s biography',
    'Đọc bài viết và xem ảnh': 'Read posts and view images',
    'Bốn dải sóng và phổ âm phản ứng theo nhạc đang phát': 'Four live waveforms and audio spectrum',
    'Nhạc nền Original Soundtrack': 'Original Soundtrack background music',
    'Tua nhạc': 'Seek audio',
    'Âm lượng đài': 'Radio volume',
    'Tốc độ phát nhạc': 'Playback speed',
    'Chọn tần số nền': 'Choose background frequency',
    'Trình duyệt của bạn chưa hỗ trợ phát nhạc.': 'Your browser does not support audio playback.',
    'Đã lưu vào lãnh địa của Hoài!': 'Saved to Hoài’s archive!',
    'Đưa bản bài và ảnh trên trình duyệt này lên Supabase để mọi người xem?': 'Upload this browser’s posts and images to Supabase for everyone to see?',
    'Thiếu cấu hình Supabase. Xem SUPABASE_SETUP.md.': 'Supabase configuration is missing. See SUPABASE_SETUP.md.',
    'Không dùng secret key trong website. Hãy dùng publishable key.': 'Do not use a secret key on the website. Use a publishable key.',
    'Chỉ dùng anon key hoặc publishable key cho website.': 'Use only an anon or publishable key on the website.',
    'API key không phải anon key hợp lệ.': 'The API key is not a valid anon key.',
    'Chưa kết nối project Supabase.': 'Supabase is not connected.',
    'Đăng nhập thất bại. Kiểm tra email và mật khẩu của tài khoản chủ nhân.': 'Login failed. Check the owner account’s email and password.',
    'Tài khoản này không có quyền quản trị website.': 'This account cannot administer the website.',
    'Chưa đọc được kho Supabase. Kiểm tra project và chạy supabase/setup.sql.': 'Could not read the Supabase archive. Check your project and run supabase/setup.sql.',
    'Ảnh tối đa 20 MiB, định dạng JPG, PNG, WebP hoặc GIF.': 'Images must be JPG, PNG, WebP or GIF, up to 20 MiB.',
    'Đường dẫn ảnh Supabase không hợp lệ.': 'Invalid Supabase image URL.',
    'Chỉ chủ nhân đã đăng nhập mới được lưu thay đổi.': 'Only the signed-in owner can save changes.',
    'Nội dung vượt giới hạn của kho cá nhân.': 'The content exceeds the archive limits.',
    'Kho dữ liệu vượt 8 MiB nội dung. Hãy chia nhỏ kho trước khi lưu.': 'The archive exceeds 8 MiB. Reduce its content before saving.',
    'Một máy khác đã lưu thay đổi. Sao lưu bản đang viết rồi tải bản mới trước khi lưu tiếp.': 'Another device saved changes. Back up your draft and load the latest version before saving.',
    'Supabase từ chối quyền ghi. Kiểm tra tài khoản và owner ID trong SQL.': 'Supabase denied write access. Check your account and the owner ID in SQL.',
    'Máy chủ chưa xác nhận bản lưu. Hãy tải bản mới để kiểm tra.': 'The server did not confirm the save. Load the latest version to check.',
    'Bản sao lưu phải có danh sách bài viết và ảnh.': 'The backup must contain lists of posts and images.',
    'Thông tin cá nhân trong bản sao lưu không hợp lệ.': 'Invalid profile information in the backup.',
    'Mã bài viết hoặc ảnh không hợp lệ hay bị trùng.': 'Post or image IDs are invalid or duplicated.',
    'Một bài viết bị thiếu hoặc sai thông tin.': 'A post contains missing or invalid information.',
    'Một ảnh không hợp lệ.': 'An image is invalid.',
    'Hãy chọn ảnh JPG, PNG, WebP hoặc GIF.': 'Choose a JPG, PNG, WebP or GIF image.',
    'Ảnh tối đa 20 MiB.': 'Images can be up to 20 MiB.',
    'Không thể xử lý ảnh trong trình duyệt này.': 'This browser cannot process the image.',
    'Không đọc được ảnh.': 'Could not read the image.',
    'Bản sao lưu tối đa 80 MiB.': 'Backups can be up to 80 MiB.',
    'Không mở được bộ nhớ trình duyệt.': 'Could not open browser storage.',
    'Bộ nhớ không khả dụng. Hãy sao lưu dữ liệu.': 'Storage is unavailable. Back up your data.',
    'Đã đăng nhập. Sao chép UID ở thanh trên để gán quyền chủ nhân theo hướng dẫn.': 'Signed in. Copy the UID above to assign owner access using the setup guide.',
    'Không tải được Supabase SDK. Hãy kiểm tra mạng rồi tải lại trang.': 'Could not load the Supabase SDK. Check your connection and reload.',
    'Trình duyệt chưa hỗ trợ bộ phát âm thanh này.': 'This browser does not support this audio player.'
  };
  const excluded = 'script,style,svg,[data-no-translate],#hoaiBio,.post-title,.post-excerpt,.post-meta,.mood-tag,.gallery-caption>span,#modalContentArea,input,textarea';
  const originals = new WeakMap();
  const attributes = new WeakMap();
  let language = 'vi';
  try { language = localStorage.getItem('HOAI_LANGUAGE') === 'en' ? 'en' : 'vi'; } catch { /* Storage is optional. */ }

  function translate(value) {
    if (language !== 'en') return value;
    const key = value.trim();
    if (entries[key]) return value.replace(key, entries[key]);
    const importPrompt = key.match(/^Thay (.+) bằng (\d+) bài viết và (\d+) ảnh\? Nên xuất sao lưu hiện tại trước\.$/);
    if (importPrompt) return `Replace ${destination(importPrompt[1])} with ${importPrompt[2]} posts and ${importPrompt[3]} images? Export a backup first.`;
    const restorePrompt = key.match(/^Thay (.+) bằng bản trong repository\? Hãy xuất sao lưu hiện tại trước\.$/);
    if (restorePrompt) return `Replace ${destination(restorePrompt[1])} with the repository version? Export a backup first.`;
    for (const [vi, en] of [['Chưa lưu: ', 'Not saved: '], ['Chưa đăng xuất được: ', 'Could not log out: '], ['Chưa tải được bản mới: ', 'Could not load the update: '], ['Chưa lưu được lên Supabase: ', 'Could not save to Supabase: '], ['Chưa bật/tắt được tần số: ', 'Could not toggle the frequency: ']]) {
      if (key.startsWith(vi)) return en + translate(key.slice(vi.length));
    }
    // Only known status formats, never arbitrary user content.
    return value.replace(/(\d+ \/ \d+) bài viết/g, '$1 posts')
      .replace(/NỀN ĐANG TẮT/g, 'SYNTH OFF').replace(/NỀN ĐANG PHÁT/g, 'SYNTH ON')
      .replace(/GIỜ ĐỊA PHƯƠNG:/g, 'LOCAL TIME:')
      .replace(/Đã lưu trên Supabase/g, 'Saved to Supabase')
      .replace(/Đã lưu trên máy/g, 'Saved on this device')
      .replace(/Xuất dữ liệu để giữ trên GitHub\./g, 'Export data to preserve it on GitHub.')
      .replace(/CHƯA CÓ QUYỀN SỬA/g, 'NO EDIT ACCESS');
  }

  function destination(value) {
    return value.replace('toàn bộ dữ liệu công khai trên Supabase', 'all public Supabase data')
      .replace('dữ liệu công khai trên Supabase', 'public Supabase data')
      .replace('bài viết và ảnh trên máy', 'local posts and images')
      .replace('dữ liệu trên máy', 'local data');
  }

  function paintNode(node) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const saved = originals.get(node);
    const source = saved && node.nodeValue === saved.rendered ? saved.source : node.nodeValue;
    const rendered = translate(source);
    originals.set(node, { source, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }

  function paint(root) {
    if (root.nodeType === Node.TEXT_NODE) return paintNode(root);
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) paintNode(walker.currentNode);
    for (const element of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[alt]')]) {
      if (element.closest('script,style,svg,[data-no-translate],#modalContentArea,.post-card,.gallery-item')) continue;
      const saved = attributes.get(element) || {};
      for (const name of ['placeholder', 'aria-label', 'title', 'alt']) {
        if (!element.hasAttribute(name)) continue;
        const value = element.getAttribute(name);
        const source = saved[name] && value === saved[name].rendered ? saved[name].source : value;
        const rendered = translate(source);
        saved[name] = { source, rendered };
        if (value !== rendered) element.setAttribute(name, rendered);
      }
      attributes.set(element, saved);
    }
  }

  function set(value) {
    if (!['vi', 'en'].includes(value)) return;
    language = value;
    document.documentElement.lang = value;
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === value));
    });
    try { localStorage.setItem('HOAI_LANGUAGE', value); } catch { /* Keep the selection for this visit. */ }
    paint(document.body);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(paint);
      else paint(record.target);
    }
  });
  set(language);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title', 'alt'] });
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = message => nativeConfirm(translate(String(message)));
  return { set, translate, get current() { return language; } };
})();
