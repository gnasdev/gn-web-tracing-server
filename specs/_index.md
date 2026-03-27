# Mục Lục & Sơ Đồ Phụ Thuộc (TOC)

## Sơ đồ Kiến trúc & Phụ thuộc
Dự án Server Tracing hiện tại có luồng phụ thuộc cốt lõi của tính năng Google Drive thông qua sơ đồ sau:

- `src/routes/upload.ts` (API Nhận Video) -> `src/storage/disk-store.ts` (Orchestrate I/O)
- `src/storage/disk-store.ts` -> `src/utils/drive.ts` (Gửi stream Video -> Google Drive Workspace [Shared/Personal])
- `src/routes/video.ts` (Proxy Frontend) -> `src/utils/drive.ts` (Kéo Stream Video Range)

## Danh sách Modules
- [Utils Drive (`src/utils/drive.ts`)](modules/utils-drive.md)
- Phân hệ Storage (`src/storage/disk-store.ts`)
- Quyết định kiến trúc ADR ([decisions/_index.md](decisions/_index.md))

## Trạng thái Compliance
Vui lòng xem chi tiết tuân thủ quy tắc tại [compliance/_summary.md](compliance/_summary.md)
