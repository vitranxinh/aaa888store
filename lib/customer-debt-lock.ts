const CUSTOMER_DEBT_FIELDS = ["openingDebt", "receivableDebt", "currentDebt", "oldDebt", "debtAmount"] as const;

export const CUSTOMER_DEBT_LOCK_MESSAGE = "Đã khóa chỉnh sửa công nợ khách hàng. Chỉ có thể cập nhật thông tin khách hàng.";

export function hasCustomerDebtFields(body: unknown): boolean {
  return typeof body === "object" && body !== null &&
    CUSTOMER_DEBT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}
