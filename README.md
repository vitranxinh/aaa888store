# SoBan Retail

SoBan Retail là web app quản lý bán lẻ đa chi nhánh cho cửa hàng vừa và nhỏ tại Việt Nam. Ứng dụng được xây bằng `Next.js 14 + TypeScript + Tailwind CSS + Prisma + PostgreSQL`, tập trung vào luồng bán hàng POS, quản lý sản phẩm, kho, khách hàng, công nợ và báo cáo.

## Tính năng chính

- Xác thực và phân quyền `Admin / Manager / Cashier`
- Dashboard doanh thu theo khung thời gian, công nợ, cảnh báo tồn thấp, hóa đơn gần đây
- Hóa đơn bán hàng:
  - tạo hóa đơn từ modal
  - bắt buộc chọn khách hàng, có khách mặc định `Khách lẻ`
  - thanh toán một phần
  - hủy hóa đơn
  - tự trừ tồn kho và ghi công nợ
- Quản lý sản phẩm, danh mục, thương hiệu, biến thể, SKU, barcode
- Quản lý nhập hàng:
  - danh mục nhà cung cấp
  - phiếu nhập có số lô, hạn dùng, đã trả/còn nợ
  - tăng tồn kho ngay khi nhập
- Thu / Chi:
  - phiếu thu từ khách
  - phiếu chi cho NCC
  - tự cập nhật đã trả / còn nợ
- Quản lý khách hàng, công nợ đầu kỳ, công nợ phát sinh
- Quản lý lô hàng và xuất kho FEFO theo hạn dùng gần nhất

## Cấu trúc thư mục

```text
app/
  (auth)/login
  (dashboard)/dashboard
  (dashboard)/products
  (dashboard)/cashflow
  (dashboard)/inventory
  (dashboard)/customers
  (dashboard)/orders
  (dashboard)/reports
  (dashboard)/settings
  api/
components/
lib/
prisma/
store/
tests/
```

## Biến môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

## Chạy local

1. Cài package:

```bash
npm install
```

2. Khởi tạo Prisma Client và migrate:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

3. Seed dữ liệu mẫu:

```bash
npm run seed
```

4. Chạy app:

```bash
npm run dev
```

Mở `http://localhost:3000`.

## Tài khoản mẫu

- `huyha@gbb.vn / huyha2005`
- `nam@gbb.vn / nam`
- `bich@gbb.vn / bich`

## API chính

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/orders`
- `PATCH /api/orders/[id]/payment`
- `GET|POST /api/products`
- `GET|POST /api/customers`
- `GET|POST /api/inventory`
- `POST /api/purchases`
- `POST /api/cash-transactions`
- `GET /api/reports/export?type=sales`

## Test

```bash
npm run test
```

## Backup dữ liệu mã hóa

Tạo backup mã hóa local:

```bash
cd ~/Projects/soban-retail
npm run backup:data
```

Script sẽ:
- hỏi mật khẩu mã hóa
- tạo file `.dump.enc`
- lưu mặc định tại `backups/database`

Nếu muốn lưu ra ổ ngoài:

```bash
cd ~/Projects/soban-retail
npm run backup:data -- /Volumes/TenOBackup/SoBanRetail
```

Khôi phục từ file backup mã hóa:

```bash
cd ~/Projects/soban-retail
npm run restore:data -- /duong-dan/toi/file.dump.enc
```

Lưu ý:
- restore sẽ tự tạo thêm 1 backup mã hóa mới trước khi ghi đè dữ liệu
- nên cất file `.dump.enc` ở ổ riêng/USB riêng và không để chung với máy làm việc
- nên nhớ kỹ mật khẩu, vì mất mật khẩu thì không giải mã được backup

## Ghi chú triển khai

- `middleware.ts` bảo vệ route và chuyển hướng về `/login` nếu chưa có session
- JWT session được lưu trong cookie `soban_session`
- `Zod + React Hook Form` dùng cho form đăng nhập và sẵn cấu trúc để mở rộng form tạo mới
- `Zustand` dùng cho state giỏ hàng POS
- `Recharts` dùng cho dashboard và reports

## Phần đã ưu tiên hoàn thiện

1. Schema dữ liệu và seed
2. App shell + auth + phân quyền
3. Hóa đơn, nhập hàng, thu/chi với cập nhật tồn kho và công nợ
4. Dashboard, customers, products, orders, inventory, cashflow

## Phần nên làm tiếp nếu đưa vào production

- CRUD đầy đủ cho promotions, staff, branches
- In hóa đơn và trả hàng / đổi hàng chi tiết hơn
- Audit log, soft delete, upload ảnh, import Excel
- Cache, rate limiting, test integration, CI/CD
