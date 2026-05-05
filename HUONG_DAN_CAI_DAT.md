# Hướng Dẫn Cài Đặt và Chạy Dự Án Soban Retail

Chào bạn! Đây là hướng dẫn chi tiết để bạn có thể cài đặt và chạy dự án này trên máy tính cá nhân.

## 1. Yêu cầu hệ thống
Trước khi bắt đầu, hãy đảm bảo máy bạn đã cài đặt:
- **Node.js**: Phiên bản 18 trở lên (khuyên dùng v20).
- **PostgreSQL**: Một hệ quản trị cơ sở dữ liệu đang chạy (Local hoặc Cloud).

## 2. Các bước cài đặt

### Bước 1: Cài đặt thư viện (Dependencies)
Mở terminal tại thư mục gốc của dự án và chạy lệnh:
```bash
npm install
```

### Bước 2: Cấu hình biến môi trường
1. Tìm file `.env.example` trong thư mục gốc.
2. Tạo một file mới tên là `.env` và copy nội dung từ `.env.example` sang.
3. Cập nhật các thông số trong file `.env`:
   - `DATABASE_URL`: Đường dẫn kết nối database PostgreSQL của bạn.
   - `DIRECT_URL`: Thường giống với DATABASE_URL (dùng cho Prisma migration).
   - `JWT_SECRET`: Một chuỗi ký tự bất kỳ để bảo mật phiên đăng nhập.

### Bước 3: Đồng bộ Database với Prisma
Chạy lệnh sau để tạo các bảng trong database theo cấu trúc đã định nghĩa:
```bash
npx prisma db push
```
Sau đó, chạy lệnh này để khởi tạo bộ thư viện kết nối (Prisma Client):
```bash
npx prisma generate
```

### Bước 4: Khởi tạo dữ liệu mẫu (Seeding)
Để có sẵn tài khoản Admin và các dữ liệu cơ bản (Chi nhánh, Danh mục...), hãy chạy:
```bash
npm run seed
```
*Mặc định tài khoản sẽ là: `admin@soban.vn` / `12345678` (Xem trong file .env)*

## 3. Chạy ứng dụng

### Chế độ phát triển (Development)
Chạy lệnh sau để khởi động server ở chế độ dev:
```bash
npm run dev
```
Sau khi chạy, bạn có thể truy cập ứng dụng tại: [http://localhost:3000](http://localhost:3000)

### Chế độ sản xuất (Production)
Nếu bạn muốn build dự án để chạy thực tế:
```bash
npm run build
npm run start
```

## 4. Các lệnh hữu ích khác
- `npm run lint`: Kiểm tra lỗi code.
- `npx prisma studio`: Mở giao diện web để xem và sửa dữ liệu database trực tiếp.
- `npm run sync:excel`: Đồng bộ dữ liệu từ file Excel (nếu cần).

---
**Lưu ý:** Nếu bạn gặp lỗi về "Implicit Any" hoặc "TypeScript", hãy đảm bảo bạn đã chạy `npm install` thành công để các kiểu dữ liệu được tải về đầy đủ.
