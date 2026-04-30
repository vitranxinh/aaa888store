import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(3, "Mật khẩu tối thiểu 3 ký tự")
});

export const posItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discountValue: z.coerce.number().nonnegative().default(0)
});

export const posCheckoutSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "MIXED"]),
  paidAmount: z.coerce.number().nonnegative(),
  orderDiscount: z.coerce.number().nonnegative().default(0),
  otherCharge: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
  status: z.enum(["DRAFT", "COMPLETED", "PARTIAL", "CANCELLED"]).default("COMPLETED"),
  items: z.array(posItemSchema).min(1, "Giỏ hàng đang trống")
});

export const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(3),
  barcode: z.string().optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  brandId: z.string().optional().or(z.literal("")),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  lowStockAlert: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  description: z.string().optional().or(z.literal(""))
});

export const customerSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(2),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  note: z.string().optional(),
  groupId: z.string().optional(),
  openingDebt: z.number().default(0)
});

export const supplierSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(2),
  phone: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  openingDebt: z.number().nonnegative().default(0)
});

export const inventoryAdjustmentSchema = z.object({
  branchId: z.string().min(1),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  type: z.enum(["IMPORT", "EXPORT", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN"]),
  quantity: z.number().int(),
  note: z.string().optional(),
  referenceCode: z.string().optional()
});

export const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  importPrice: z.number().nonnegative(),
  batchNumber: z.string().optional().or(z.literal("")),
  expiryDate: z.string().optional()
});

export const purchaseSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  paidAmount: z.number().nonnegative(),
  note: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1)
});

export const cashTransactionSchema = z.object({
  branchId: z.string().min(1),
  type: z.enum(["RECEIPT", "PAYMENT"]),
  amount: z.number().positive(),
  note: z.string().optional(),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  orderId: z.string().optional(),
  purchaseOrderId: z.string().optional()
});

export const orderPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "MIXED"]).default("CASH"),
  note: z.string().optional()
});
