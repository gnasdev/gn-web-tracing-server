# Tích hợp lưu trữ Video lên Google Drive

- **Trạng thái**: Đã áp dụng
- **Ngày**: 2026-03-27
- **Người thực hiện**: Antigravity

## 1. Vấn đề
Hệ thống `gn-web-tracing` mặc định lưu toàn bộ metadata, console logs, network logs và video buffer xuống thư mục `data/` local. Đối với server chạy dài hạn hoặc deploy trên môi trường bị giới hạn bộ nhớ (ví dụ ephemeral storage trên các cloud platform), lưu video `.webm` sẽ gây phình dung lượng. Có yêu cầu chuyển đổi vị trí lưu trữ video lên Google Drive.

## 2. Giải pháp đã chọn
- **Backend (Server)**:
  - Sử dụng thư viện `googleapis` với `auth.GoogleAuth` (thường thông qua Service Account).
  - Proxy toàn bộ request tạo video gửi thẳng lên Drive qua API `drive.files.create({media, ...})`.
  - Thay vì lưu video(`.webm`), lưu `driveFileId` vào trong `metadata.json`.
  - Proxy request đọc video (`GET /api/recordings/:id/video`) bằng cách fetch stream từ Drive Server với Option `Range` để đảm bảo user tua video mượt mà trên browser.

- **Frontend/Extension**:
  - Không thay đổi. Vẫn dùng chuẩn Player cũ, vẫn trỏ link video vào backend API server bình thường.
  - Vẫn gửi buffer qua form-data lúc upload.

## 3. Lý do thiết kế (Vì sao không cho Extension gửi trực tiếp lên Drive hoặc Player fetch thẳng từ Drive?)
- **Tránh CORS / Authentication leak**: Extension gửi file trực tiếp sẽ lộ Service Account (hoặc bắt buộc user phải có thủ tục OAuth rườm rà).
- **Hỗ trợ Byte-Range (Tua video)**: `HTMLMediaElement` của browser yêu cầu fetch `206 Partial Content`. Google Drive API đôi khi bị chặn ở một số trình duyệt hoặc đòi token cookie trực tiếp. Proxy ở backend là an toàn và ổn định nhất, che giấu hoàn toàn logic lưu trữ đằng sau HTTP Route chuẩn của App. Cấu trúc Proxy còn dễ dàng đảo ngược sang S3/MinIO sau này nếu cần thiết.

## 4. Hệ quả & Ràng buộc Kỹ thuật (Technical Constraints)
- **Thay đổi dependencies**: Bổ sung `googleapis` vào server package.
- **Ràng buộc Môi trường**: Cần Inject environment variable `GOOGLE_APPLICATION_CREDENTIALS` (dẫn tới file json Service Account) và tuỳ chọn `GOOGLE_DRIVE_FOLDER_ID`. Node process phải có quyền đọc file JSON credentials.
- **Ràng buộc Upload (Multer)**: Cần bọc logic `upload.single(...)` trong middleware custom để bắt Explicit Error. Nếu multer gặp lỗi (file quá to, hoặc client truyền sai tên trường form-data), nó sẽ đẩy lỗi thẳng vào Global Error Handler và ngắt luôn request, gây khó khăn cho việc debug log của route (`Incoming upload...`).
- **Ràng buộc Proxy Stream**: Chrome `<video>` tag bắt buộc phải có `Content-Length` và `Content-Range` trong response `206 Partial Content`. Nếu proxy bị hụt 2 header này, video sẽ văng lỗi `NotSupportedError: The element has no supported sources`.
- **Ràng buộc Googleapis (Native Fetch)**: Các phiên bản `googleapis` gần đây sử dụng Native `Fetch` (undici) trong Node.js. Biến `driveRes.headers` trả về không còn là Plain Object mà là instance của `Headers`. BẮT BUỘC sử dụng hàm `.get('content-length')` khi đọc header proxy thay vì style property cũ `['content-length']`.
- **Đường dẫn API Client**: Extension `gn-web-tracing` trước đây upload lên `POST /recordings`. Để tương thích ngược mà không cần sửa code extension, server mount router ở cả hai path `/api/recordings` và `/recordings`.
