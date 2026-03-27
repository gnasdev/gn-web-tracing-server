# Lên Kế Hoạch: Tích Hợp Google Drive Cho Hệ Thống Tracing

## 1. Trả lời câu hỏi của User
**Có thể kết nối đến Google Drive để save video thay vì local không?**

- **CÓ THỂ.** Việc lưu trữ video (được upload từ extension) có thể chuyển hoàn toàn sang lưu trên Google Drive thay vì lưu ở local folder `data/` như hiện tại. 

**Trong player dùng video từ Google Drive?**

- **CÓ THỂ.** Chơi video từ Google Drive hoàn toàn khả thi. Tuy nhiên do Player (file `VideoPlayer.tsx`) đang dùng `HTMLMediaElement` và dựa vào các sự kiện onTimeUpdate/onSeeked để Sync trạng thái Network/Console, nếu chúng ta truyền thẳng link Google Drive (`<video src="drive-link">`) sẽ dễ bị chặn CORS và khó kiểm soát HTTP Byte-Range requests (để tua video mượt mà).
- **Giải pháp tốt nhất:**  Giữ nguyên API `/api/recordings/:id/video` ở Backend và thay vì đọc file local, Backend sẽ stream video trực tiếp từ Google Drive xuống Player và xử lý Range requests. Như vậy, Frontend (Player) không cần phải thay đổi code và không sợ lỗi sync.

## 2. Giải pháp Kỹ thuật & Workflow

### 2.1. Phía Server (`gn-web-tracing-server`)
- **Tích hợp Google Drive API:**
  - Cài đặt thêm thư viện `googleapis`.
  - Cấu hình xác thực qua Service Account (khuyên dùng để tự động hoá upload server-to-server) hoặc OAuth2. Server sẽ được cấp quyền truy cập vào 1 folder cụ thể trên Drive.
- **Sửa đổi logic Upload (`src/routes/upload.ts` & `src/storage/disk-store.ts`):**
  - Hiện tại:  video lưu bằng `fs.writeFileSync(path.join(dir, "recording.webm"), video);`.
  - Thay đổi: Khi nhận buffer video, server sẽ dùng `drive.files.create` để upload file lên Google Drive.
  - Khi hoàn thành, ID (`fileId`) của video trên Drive sẽ lưu vào file `metadata.json` (hoặc db) của recording đó, thay vì lưu file `.webm` trên server.
  - Các log console, network... có thể giữ nguyên lưu trên local server/db vì size nhỏ.
- **Sửa đổi logic Stream Video (`src/routes/video.ts`):**
  - Hiện tại: `res.sendFile(videoPath)` 
  - Thay đổi:  Lấy `fileId` từ `metadata.json`, gọi `drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })`. 
  - Bắt buộc phải proxy Stream và xử lý header `Range` request chuẩn xác để khi Player nhấn tua (seek), server trả về mã `206 Partial Content` để video tự tải các byte còn lại.

### 2.2. Phía Extension (`gn-web-tracing-extension`)
- Extension **không cần phải sửa đổi code**. Quá trình Capture (`RecorderManager`) vẫn tạo buffer WebM, sau đó `uploadRecording()` pack zip hoặc form-data gửi cho server Backend như cũ. Backend sẽ lo việc giao tiếp với Drive.

## 3. Các bước triển khai
1. Cài đặt và cấu hình thư viện `googleapis` trên `gn-web-tracing-server`.
2. Khai báo credentials Service Account Key trong `.env`.
3. Viết module utils xử lý giao tiếp Google Drive (upload file, đọc stream file support Range).
4. Update quá trình save recording trong `/src/storage/disk-store.ts` (không save video down disk, mà đẩy lên Drive và lưu lại ID).
5. Update logic handler endpoint proxy stream video GET `/api/recordings/:id/video`.
6. Thực hiện test đảm bảo timeline và logs vẫn sync tốt khi video proxy từ drive.
7. Xây dựng tài liệu spec cập nhật các thay đổi theo `RULE[AGENTS.md]`.

Tôi đã lưu plan này vào `specs/planning/google-drive-integration.md` theo yêu cầu. Hãy xác nhận (approve) hoặc điều chỉnh thêm để tôi có thể bắt đầu code task lớn này nhé! 
