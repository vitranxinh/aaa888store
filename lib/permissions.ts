import type { UserRole } from "@prisma/client";

export const rolePermissions: Record<UserRole, string[]> = {
  ADMIN: ["dashboard", "customers", "suppliers", "products", "orders", "inventory", "cashflow", "reports", "settings", "pos"],
  MANAGER: ["dashboard", "customers", "suppliers", "products", "orders", "inventory", "cashflow", "reports", "pos"],
  CASHIER: ["dashboard", "customers", "suppliers", "products", "orders", "cashflow", "reports", "settings", "pos"]
};

export function canAccess(role: UserRole, key: string) {
  return rolePermissions[role]?.includes(key) ?? false;
}
