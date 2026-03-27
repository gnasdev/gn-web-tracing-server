# Trạng thái Đồng bộ

- **Lần cập nhật cuối**: 2026-03-27
- ** HEAD / Commit gần nhất đồng bộ**: [Cần cập nhật mã SHA bằng tay hoặc pipeline]

## Lịch sử thay đổi đáng chú ý gần đây:
- **2026-03-27**: Tích hợp Google Drive API vào gn-web-tracing-server. Video (.webm) được upload trực tiếp từ Server lên Drive thay vì lưu file local. Metadata thêm thông tin `driveFileId`. Bổ sung module `drive.ts` proxy byte-range stream từ Drive về client.
