# Trạng thái Đồng bộ

- **Lần cập nhật cuối**: 2026-03-28
- ** HEAD / Commit gần nhất đồng bộ**: HEAD (2026-03-28 proxy fixes and stateless release)

- **2026-03-28**: Hoàn thiện kiến trúc Stateless bằng Docker Compose. Nâng cấp bộ xử lý Proxy API hỗ trợ Native Fetch headers và tùy chỉnh Multer limits cho file dung lượng lớn, gỡ bỏ route aliases dư thừa. Tại Extension, gỡ bỏ `timeslice` của MediaRecorder để khôi phục WebM Cues (chuẩn xác khi tua video) và sửa bug race condition xử lý `stopCapture`.
- **2026-03-27**: Tích hợp Google Drive API vào gn-web-tracing-server. Video (.webm) được upload trực tiếp từ Server lên Drive thay vì lưu file local. Metadata thêm thông tin `driveFileId`. Bổ sung module `drive.ts` proxy byte-range stream từ Drive về client.
