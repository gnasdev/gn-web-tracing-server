# Kế hoạch Tích hợp Lưu trữ Logs lên Google Drive

## 1. Mục tiêu (Goal)
Chuyển đổi cơ chế lưu trữ các file dung lượng lớn (Logs: Console, Network, WebSocket) từ ổ cứng (local disk) lên Google Drive, tương tự như cách đã làm với Video. Qua đó, giảm tối đa dung lượng bộ nhớ cấp phát cho Server, tiến dần tới kiến trúc Stateless (phi trạng thái).

## 2. Ràng buộc Kỹ thuật & User Review Required
> [!IMPORTANT]
> - Do quá trình tải Logs từ Google Drive mất khoảng 1-2 giây qua HTTP, tốc độ mở ban đầu của trang Viewer (`/view/:id`) sẽ chậm đi một chút so với đọc file từ ổ cứng nội bộ.
> - Cấu trúc thư mục local `data/<id>/` sẽ chỉ còn lại duy nhất file `metadata.json` đóng vai trò là "chỉ mục" (index) chứa 2 pointer: `driveFileId` (cho video) và `driveLogsId` (cho logs).
> - Hàm `diskStore.getRecording()` vốn đang là đồng bộ (Sync) bắt buộc phải chuyển sang **Bất Đồng Bộ (Async/Promise)** để chờ fetch data từ Drive, qua đó Route `GET /api/recordings/:id` cũng phải chuyển thành Async.

## 3. Các thay đổi đề xuất (Proposed Changes)

### 3.1. Layer Utility (Tương tác API Google Drive)
#### [MODIFY] [drive.ts](file:///Users/ngosangns/Github/infra/gn-web-tracing-server/src/utils/drive.ts)
- Viết thêm hàm `uploadLogsToDrive(id: string, logsData: string): Promise<string>` dùng `drive.files.create` với định dạng `application/json`.
- Viết thêm hàm `fetchLogsFromDrive(fileId: string): Promise<any>` dùng `drive.files.get` với tham số `alt: 'media'` để lấy raw JSON content về từ Drive.

### 3.2. Layer Storage (Quản lý Disk Local)
#### [MODIFY] [disk-store.ts](file:///Users/ngosangns/Github/infra/gn-web-tracing-server/src/storage/disk-store.ts)
- Thay đổi hàm `saveRecording()`: Bãi bỏ việc xé nhỏ log và dùng `fs.writeFileSync()` cho 3 file rời (`console-logs.json`, `network-requests.json`, `websocket-logs.json`).
- Gom tất cả dữ liệu text (Log) thành 1 object JSON tĩnh, bắn qua module `drive.ts` để upload -> Lấy `driveLogsId` -> Đính kèm vào `metadata.json`.
- Cập nhật hàm `getRecording()` thành `async getRecording()`. Gọi `.fetchLogsFromDrive()` nếu metadata có trường `driveLogsId`, sau đó trộn data với metadata rồi ném lại cho client. Nếu file cũ (chưa upload lên drive), vẫn fallback đọc từ ổ cứng.

### 3.3. Layer API (Controller) 
#### [MODIFY] [recordings.ts](file:///Users/ngosangns/Github/infra/gn-web-tracing-server/src/routes/recordings.ts)
- Đổi Route `router.get("/:id")` thêm `async (req, res)`, và cập nhật lệnh lấy data thành `await diskStore.getRecording(req.params.id)`. Lồng `try/catch` bắt lỗi API Drive.

## 4. Xác minh (Verification Plan)
- Chạy thử một Request upload Video & Logs hoàn chỉnh từ curl hoặc extension. Đảm bảo dung lượng thư mục `data/` local cực mỏng (khoảng 300 byte).
- Truy cập vào frontend `http://localhost:3000/view/:id`, kiểm tra các tab *Network*, *Console* có load lên biểu đồ timeline bình thường hay không. Đảm bảo file JSON gộp được parser trên trình duyệt giải mã chính xác.
