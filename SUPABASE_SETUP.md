# Kết nối Supabase cho website Hoài

Website đã chuyển sang mã Supabase, nhưng **chưa có project Supabase thật được kết nối**. Khi cấu hình còn tắt, khách xem bản có sẵn; nút soạn thử trên localhost vẫn dùng kho IndexedDB cũ.

## 1. Tạo project Free

Mở https://supabase.com/dashboard, đăng ký hoặc đăng nhập. Tạo organization gói **Free**, sau đó chọn **New project**, đặt tên, tự đặt mật khẩu database và chọn khu vực gần bạn, ví dụ Singapore nếu có. Không gửi mật khẩu database cho trợ lý và không chép vào website.

Cũng có thể cài/kết nối Supabase qua đề xuất trong cuộc trò chuyện để trợ lý hỗ trợ thiết lập. Chưa kết nối thì trợ lý chưa thể tạo project hoặc chạy SQL trong tài khoản của bạn.

## 2. Lấy cấu hình công khai

Lấy **Project URL** và **Publishable key** từ trang kết nối/API của project. Publishable key thường bắt đầu bằng **sb_publishable_**; legacy **anon key** cũng dùng được.

Không dùng **service_role**, **secret key / sb_secret_**, access token tài khoản hoặc mật khẩu database trong mã frontend. Chỉ URL và publishable key có thể gửi để điền cấu hình.

## 3. Tạo database và bucket

Trong **SQL Editor**, mở truy vấn mới, dán toàn bộ [supabase/setup.sql](supabase/setup.sql) rồi **Run**. Script:

- Tạo bảng công khai hoai_site chứa bài, danh sách ảnh, bio và revision.
- Bật Row Level Security và chặn ghi đối với khách/tài khoản khác.
- Tạo bucket công khai **hoai-images**, chỉ nhận ảnh JPG/PNG/WebP/GIF tối đa 20 MiB.
- Tạo hàm lưu nguyên tử, ngăn máy đang giữ bản cũ ghi đè bản mới.

Script tạo kho mới, không đụng dữ liệu Firebase. Chưa gán chủ nhân thì chưa ai có quyền ghi từ website.

## 4. Tạo tài khoản chủ nhân của website

Trong **Authentication → Users**, dùng **Add user → Create new user** để tạo tài khoản bằng email và mật khẩu của bạn. Xác nhận email/tùy chọn Auto Confirm nếu được hiển thị. Đây là tài khoản đăng nhập website, khác tài khoản đăng nhập Supabase Dashboard.

Không có nút đăng ký công khai trên website. Tắt **Allow new users to sign up** trong cấu hình Authentication nếu đang bật. Không cần bật Google OAuth.

Sao chép **User UID/ID** của tài khoản vừa tạo. Đây là UUID của Supabase, **không dùng lại UID Firebase**.

Mở [supabase/set-owner.sql](supabase/set-owner.sql), thay REPLACE_WITH_SUPABASE_USER_UUID bằng UUID đó và chạy trong SQL Editor. Tài khoản đầu tiên không tự nhận quyền; chủ nhân phải được gán bằng SQL.

## 5. Bật kết nối trong mã

Điền vào supabase-config.js:

- enabled: true
- url: Project URL
- publishableKey: khóa công khai của project
- ownerId: UUID vừa gán trong set-owner.sql
- Giữ bucket là hoai-images để khớp SQL.

Không lưu email/mật khẩu chủ nhân trong mã. Bạn nhập trực tiếp vào hộp đăng nhập trên website.

Chạy **python serve.py**, mở http://127.0.0.1:8000/, nhấn Ctrl + F5. Bấm **ĐĂNG NHẬP CHỦ NHÂN**, nhập email/mật khẩu vừa tạo. Khi SQL và owner ID đúng, các nút viết/sửa/xóa sẽ hiện.

## 6. Chuyển dữ liệu hiện có

Xuất JSON sao lưu từ trình duyệt/địa chỉ cũ trước khi chuyển. Đừng xóa dữ liệu trang hoặc project Firebase.

Khi Supabase chưa có bài, đăng nhập và bấm **ĐƯA DỮ LIỆU TRÊN MÁY LÊN SUPABASE**. Trang lấy kho IndexedDB cũ của trình duyệt này nếu có; nếu không có sẽ lấy bài/ảnh sẵn trong data/site-data.js. Bản JSON cũ có thể nhập qua nút nhập sao lưu sau khi đăng nhập.

Ảnh tải thêm dạng base64 sẽ được đưa vào Storage. Các ảnh có sẵn trong assets/ và nhạc MP3 tiếp tục nằm ở GitHub, vì vậy phải giữ thư mục assets/ khi triển khai. URL ảnh Firebase cũ không tự chuyển bucket; nếu từng dùng Firebase Storage, cần tải ảnh về/chuẩn bị chuyển riêng trước khi ngừng dịch vụ đó.

Bản nháp chỉ lưu trên máy. Bản nháp cũ của Firebase vẫn còn trong IndexedDB với khóa cũ, chưa tự chuyển sang tài khoản Supabase. Nếu có bản nháp cần giữ, sao chép nội dung trước khi đổi cấu hình. Dữ liệu từ địa chỉ khác, ví dụ localhost hoặc cổng 3000, không tự xuất hiện ở 127.0.0.1:8000: hãy xuất/nhập JSON để chuyển.

## 7. Kiểm tra trước khi ngừng Firebase

1. Tạo một bài và tải một ảnh khi đăng nhập chủ nhân, chờ xác nhận đã lưu Supabase.
2. Tải lại: bài/ảnh vẫn còn.
3. Mở cửa sổ riêng tư: không đăng nhập vẫn xem được bài/ảnh, không thấy nút sửa.
4. Thử tài khoản khác: không được lưu, kể cả gọi Data API trực tiếp; RLS phải chặn.
5. Thử sửa ở hai tab: tab giữ revision cũ phải báo tải bản mới.

Chưa có kiểm thử trên Supabase thật cho đến khi hoàn tất các bước trên. Các kiểm tra tự động hiện dùng SDK mô phỏng và bản xem thử cục bộ.

## Lưu trữ và sao lưu

### Bật chỉnh sửa lịch bản tin

Mở file `supabase/broadcast.sql`, sao chép toàn bộ vào **Supabase → SQL Editor → New query → Run**. Chỉ cần chạy một lần sau khi đã có chủ nhân từ `set-owner.sql`. File không sửa kho bài/ảnh; nó thêm bảng `hoai_broadcast`, RLS và hàm lưu có revision. Mỗi khung chẵn từ 0 đến 22 là một hàng, đọc công khai, chỉ chủ nhân được tạo/sửa.

Sau khi báo Success, tải lại website, đăng nhập chủ nhân và chọn **Giám sát đêm → SỬA** ở khung muốn đổi. Nhập đủ hai bản Việt/Anh rồi lưu. Mở cửa sổ ẩn danh để kiểm tra nội dung mới sau tối đa 30 giây. Nếu chưa chạy SQL, web vẫn phát lịch mặc định nhưng sẽ thông báo cần thiết lập khi chủ nhân muốn lưu lịch riêng.

Lịch nằm riêng trong `hoai_broadcast`, không có trong file JSON sao lưu bài/ảnh hiện tại. Sao lưu bảng lịch riêng từ dashboard. Quay về bản giao diện trước không cần xóa bảng mới; giữ bảng để không mất bản tin đã sửa.

Đây là kho cá nhân nhỏ: tối đa 2.000 bài, 5.000 mục ảnh và 8 MiB nội dung JSON (chữ + URL), còn file ảnh nằm riêng trong Storage. Toàn bộ snapshot được lưu trong một transaction để giữ tương thích với giao diện hiện tại. Nếu kho lớn hơn, cần tách bảng/phân trang thay vì tăng kích thước vô hạn.

Xóa mục ảnh khỏi giao diện không xóa file Storage vì file có thể còn được bài khác sử dụng. Ảnh upload xong nhưng lưu bài lỗi cũng có thể còn trong bucket. Chỉ dọn file không còn liên kết sau khi đã sao lưu.

JSON tải xuống khi dùng Supabase chứa URL file, không chứa tất cả byte ảnh. Sao lưu đầy đủ cần cả JSON và file trong bucket. Bản Free có hạn mức dung lượng/băng thông và có thể bị tạm dừng nếu ít hoạt động; kiểm tra mục Usage và email thông báo trong dashboard.

## GitHub Pages và quay lại bản cũ

Đưa index.html, app.js, radio.js, access.js, ui-sounds.js, supabase-client.js, supabase-config.js, enhancements.css, assets/, data/ và .nojekyll lên repository. Giao diện vẫn dùng GitHub Pages, backend dùng Supabase.

Các tệp firebase-client.js, firebase-config.js, firestore.rules, storage.rules và FIREBASE_SETUP.md được giữ làm tài liệu/bản cũ; index.html không tải chúng, firebase-config.js đã tắt. Không xóa Firebase hoặc dữ liệu cũ trước khi kiểm tra chuyển thành công.

Tài liệu chính thức: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [đăng nhập mật khẩu](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Storage](https://supabase.com/docs/guides/storage/security/access-control), [gói Free](https://supabase.com/pricing).
