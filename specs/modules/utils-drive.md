# Mô-đun Google Drive Utils (`src/utils/drive.ts`)

- **Meta**: Trạng thái (Stable), Phiên bản (1.0.0), Đánh giá tuân thủ (100% Khớp với tài liệu)

## 1. Tổng quan (Overview)
`utils/drive.ts` là mô-đun kết nối độc lập chịu trách nhiệm giao tiếp vòng đời File Video (.webm) với hạ tầng API Google Drive trong cả Workspace (Shared Drives) và Personal. 

## 2. Yêu cầu chức năng & Phi chức năng
- **Chức năng**: Upload buffer nguyên khối lên Drive và nhận File ID; Proxy byte-range từ Drive ngược xuống response client.
- **Phi chức năng (Non-Functional)**: Rào chắn Module Hoisting của Node.js (Các biến môi trường từ `dotenv` phải được gọi qua cơ chế **Lazy Initialization** `getDriveClient` để không bị undefined lúc compile); Chèn Cờ `supportsAllDrives` vào API Native; Huỷ Socket TCP Download khi trình duyệt rách/cúp kết nối (Memory Leak Protection); Tự động trích xuất mã ngầm `416 Partial Content Array Bound Fail` và map header `Content-Range`.

## 3. Data Models & APIs
- **Nội bộ (Internal API)**:
  - `uploadVideoToDrive(buffer: Buffer, filename: string): Promise<string>`
  - `handleDriveVideoProxy(fileId: string, req: Request, res: Response): Promise<void>`

## 4. Quy tắc Nghiệp vụ (Business Rules)
- Không bao giờ cấp quyền Public file sau khi upload. Quyền tiếp cận độc quyền thông qua Service Account credentials để phòng lọt raw footage Tracing.
- **Workspace Quota Bypass**: Nhằm lách luật 0-byte Quota của Google cấp cho các Workspace Service Account, Module tự động sử dụng danh tính OAuth2 của người dùng thật (thông qua luồng Refresh Token) để lưu trữ về Personal Drive ngầm.

## 5. Ràng buộc & Giả định (Constraints & Assumptions)
- Environment Variables PHẢI tồn tại một trong hai luồng uỷ quyền:
  - **Luồng 1 (Ưu tiên)**: `GOOGLE_REFRESH_TOKEN` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Xác thực OAuth2 để lách lỗi 403 quota).
  - **Luồng 2 (Cơ bản)**: `GOOGLE_APPLICATION_CREDENTIALS` (Service Account truyền thống, chỉ chạy tốt trên môi trường có Shared Drives).

## 6. Mối quan hệ
- **Tiêu thụ (Consumers)**: `disk-store.ts` mượn hàm upload. `video.ts` mượn hàm Proxy.
- **Phụ thuộc**: `googleapis` SDK.

## 7. Lịch sử cập nhật (Changelog)
- **2026-03-27**: Hoàn thiện phiên bản 1.0 (Bao gồm Native Stream, Byte-Range Nginx Header Proxy, Garbage Cleanup).
