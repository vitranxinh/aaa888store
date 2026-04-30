# Hướng dẫn gắn VBA vào workbook Excel

Workbook đã được tạo ở:

- `/Users/vitran/Documents/New project/QuanLyCuaHang_VBA.xlsx`

Mã VBA nằm ở:

- `/Users/vitran/Documents/New project/vba/StoreManager.bas`
- `/Users/vitran/Documents/New project/vba/ThisWorkbook.cls`

## Cách gắn macro vào Excel

1. Mở file `QuanLyCuaHang_VBA.xlsx` bằng Microsoft Excel.
2. Vào `Tools` -> `Macro` -> `Visual Basic Editor`.
3. Trong cửa sổ VBA:
4. Chuột phải vào project của workbook -> `Import File...`
5. Import file `StoreManager.bas`
6. Chọn `ThisWorkbook` của project hiện tại, mở code window, dán nội dung của `ThisWorkbook.cls` vào.
7. Lưu file thành định dạng `Excel Macro-Enabled Workbook (.xlsm)`.

## Macro chính

- `GoToMenu`
- `GoToDashboard`
- `FillCustomerNameOnForm`
- `CreateInvoiceFromForm`
- `CreateVoucherFromForm`
- `RefreshDashboard`

## Cách dùng nhanh

1. Vào sheet `TẠO_HÓA_ĐƠN`
2. Nhập:
   - `B2`: mã khách hàng
   - `B4`: ghi chú
   - từ dòng `6` trở xuống:
     - cột `A`: mã sản phẩm
     - cột `B`: số lượng
3. Chạy macro `FillCustomerNameOnForm` để tự điền tên khách.
4. Chạy macro `CreateInvoiceFromForm`.
5. Hóa đơn sẽ được:
   - ghi vào `CHI TIẾT HÓA ĐƠN`
   - cập nhật `CÔNG NỢ THEO HÓA ĐƠN`
   - trừ tồn kho tại `Hàng Q302`
   - đổ sang mẫu in `LÊN HÓA ĐƠN`

## Phiếu thu chi

1. Vào sheet `PHIẾU_THU_CHI`
2. Nhập:
   - `B2`: `receipt` hoặc `payment`
   - `B3`: mã khách hàng
   - `B4`: mã hóa đơn
   - `B5`: số tiền
   - `B7`: ghi chú
3. Chạy macro `CreateVoucherFromForm`
4. Phiếu sẽ được ghi vào `SỔ_THU_CHI`
5. Nếu là `receipt`, cột `Khách đã trả` ở `CÔNG NỢ THEO HÓA ĐƠN` sẽ tự tăng

## Gợi ý cho người dùng không rành kỹ thuật

- Có thể gán macro vào nút Shape ngay trên các sheet `MENU`, `TẠO_HÓA_ĐƠN`, `PHIẾU_THU_CHI`
- Nếu bạn muốn, tôi có thể làm tiếp một vòng nữa để tự tạo luôn các nút bấm và bố cục đẹp hơn trong workbook
