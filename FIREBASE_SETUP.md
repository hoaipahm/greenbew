# Kết nối Firebase cho Hoài

> Tài liệu phương án cũ. Website hiện đã chuyển sang mã Supabase; xem SUPABASE_SETUP.md. Giữ tài liệu này để đối chiếu và khôi phục, không cần tiếp tục đăng ký thanh toán Firebase.

Mã kết nối đã được chuẩn bị; Firebase chưa hoạt động cho đến khi tạo project, điền cấu hình và triển khai rules. Không có mật khẩu hoặc service-account key trong mã nguồn.

## 1. Tạo project bằng tài khoản Google của bạn

Mở [Firebase Console](https://console.firebase.google.com/), chọn **Create a project**, đặt tên, có thể bỏ Google Analytics. Hoặc kết nối plugin Firebase trong cuộc trò chuyện để trợ lý tiếp tục cấu hình trong tài khoản của bạn.

Việc liên kết thanh toán cần chính bạn thực hiện. Cloud Storage hiện yêu cầu gói Blaze. Không cung cấp thông tin thẻ trong cuộc trò chuyện. Chọn khu vực database và bucket phù hợp trước khi tạo vì đây là quyết định khó thay đổi.

## 2. Thêm ứng dụng Web

Trong Project settings → General → Your apps → biểu tượng Web `</>`, đăng ký ứng dụng. Sao chép đối tượng `firebaseConfig` vào thuộc tính `firebase` trong `firebase-config.js`, đặt `enabled: true`. Cấu hình Web này có thể nằm trong repository; tuyệt đối không chép JSON của service account.

## 3. Bật đăng nhập Google và lấy UID chủ nhân

Authentication → Get started → Sign-in method → Google → Enable, chọn email hỗ trợ rồi lưu.

Trong Authentication → Settings → Authorized domains, thêm `localhost`, `127.0.0.1` để thử trên máy và tên miền GitHub Pages của bạn, ví dụ `ten-cua-ban.github.io` (không nhập đường dẫn repository).

Mở trang và bấm **ĐĂNG NHẬP CHỦ NHÂN**, đăng nhập Google. Khi `ownerUid` còn trống, trang chỉ hiển thị UID của tài khoản đã đăng nhập và vẫn khóa quyền chỉnh sửa. Bạn cũng có thể lấy UID trong Authentication → Users.

Chép UID đó vào **ba vị trí**:

- `ownerUid` trong `firebase-config.js`.
- Thay `__SET_OWNER_UID__` trong `firestore.rules`.
- Thay `__SET_OWNER_UID__` trong `storage.rules`.

Chỉ UID được gán thủ công mới là chủ nhân. Người đăng nhập đầu tiên không tự nhận quyền quản trị.

## 4. Tạo Firestore và Storage, triển khai rules

Tạo Cloud Firestore ở production mode, chọn Standard edition và vị trí lưu. Tạo Storage sau khi liên kết Blaze; kiểm tra `storageBucket` trong cấu hình khớp bucket thực tế.

Trong Firestore → Rules, dán nội dung `firestore.rules` đã thay UID rồi Publish. Làm tương tự Storage → Rules với `storage.rules`. Không sử dụng test mode hoặc luật cho tất cả mọi người ghi.

Nếu dùng Firebase CLI đã đăng nhập, có thể chọn project bằng `firebase use --add`, sau đó chạy:

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Firebase CLI chỉ triển khai backend/rules; giao diện vẫn dùng GitHub Pages. Thông tin kết nối không tự triển khai rules: phải làm bước này trước khi sử dụng.

## 5. Đưa dữ liệu hiện có lên Firebase

Trước tiên xuất JSON từ bản trên máy để giữ bản sao riêng. Tải lại trang, đăng nhập tài khoản có UID chủ nhân. Khi Firebase chưa có dữ liệu, bấm **ĐƯA DỮ LIỆU TRÊN MÁY LÊN FIREBASE**.

- Nếu trình duyệt này có bản IndexedDB cũ, dùng bản đó; nếu chưa có, dùng bài và ảnh mẫu hiện tại.
- Ảnh tải thêm dạng base64 được đưa vào Storage. Firestore lưu nội dung bài và URL ảnh, không nhúng ảnh vào document.
- Ảnh/nhạc đã có trong `assets/` tiếp tục ở GitHub; giữ nguyên thư mục đó khi push.
- Bản nháp chỉ lưu trên máy, chưa công khai. Chỉ bài đã bấm lưu mới được gửi lên Firebase.
- Không xóa dữ liệu IndexedDB cũ sau khi chuyển; bản cũ vẫn có thể dùng để khôi phục.

Sau đó lưu bài, sửa bio, đổi avatar, tải/xóa ảnh qua giao diện sẽ cập nhật Firebase khi online. Máy khác tải trang sẽ đọc cùng dữ liệu. Khách đang mở trang được cập nhật khi có thay đổi; chủ nhân có thông báo tải bản mới để tránh ghi đè nội dung đang sửa.

## Dữ liệu và giới hạn của bản tích hợp

- `posts/{id}`: một document mỗi bài.
- `gallery/{id}`: một document mỗi ảnh.
- `site/profile`: bio, avatar, trạng thái.
- `site/meta`: revision và thứ tự hiển thị. Transaction kiểm tra revision để ngăn hai máy ghi đè nhau.
- Storage: `public/images/<sha256>.<extension>`. Ảnh giống nhau dùng chung đường dẫn.

Ảnh đầu vào tối đa 20 MiB, bài tối đa 700.000 byte sau mã hóa JSON và nội dung tối đa 300.000 ký tự theo rules; tiêu đề tối đa 500 ký tự. Mỗi lần nhập/thay đổi tối đa 400 document bài/ảnh. Đây là giới hạn bảo vệ của ứng dụng, không phải toàn bộ hạn mức Firebase.

Xóa bài không tự xóa ảnh khỏi Storage vì ảnh có thể được dùng trong bài hoặc gallery khác. Nếu tải ảnh thành công nhưng lưu bài thất bại, ảnh có thể còn trong bucket. Dọn ảnh không còn dùng trong Firebase Console sau khi sao lưu và kiểm tra liên kết.

JSON xuất từ bản online chứa URL ảnh Storage; không phải bản tải toàn bộ file ảnh về máy. Nếu cần bản sao độc lập với Firebase, phải sao lưu cả bucket.

Theo dõi mục Usage và Billing của project. Có thể đặt cảnh báo ngân sách; cảnh báo không tự chặn chi phí. Mọi bài/ảnh đã lưu lên vùng công khai đều có thể được khách xem; bản nháp không nằm trong Firestore.

## Kiểm tra quyền sau khi kết nối

1. Đăng xuất: chỉ thấy bài và ảnh, không có nút viết/sửa/xóa/tải ảnh.
2. Đăng nhập tài khoản chủ nhân: thấy nút quản trị, thử tạo một bài và tải một ảnh.
3. Mở cửa sổ riêng tư: phải xem được bài/ảnh mới mà không đăng nhập.
4. Đăng nhập tài khoản khác: không được sửa. Rules phải từ chối ghi dù người dùng sửa HTML trên máy họ.
5. Mở hai tab cùng tài khoản, lưu ở tab thứ nhất rồi thử lưu ở tab cũ: phải báo cần tải bản mới.

Khi chưa cấu hình Firebase, trang GitHub Pages chỉ hiển thị bản trong `data/site-data.js`. Chỉ địa chỉ localhost có nút **SOẠN THẢO THỬ TRÊN MÁY**, lưu IndexedDB; đây không phải quyền quản trị Firebase.

Tài liệu: [SDK Web](https://firebase.google.com/docs/web/alt-setup), [đăng nhập Google](https://firebase.google.com/docs/auth/web/google-signin), [Firestore rules](https://firebase.google.com/docs/firestore/security/get-started), [thay đổi gói Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
