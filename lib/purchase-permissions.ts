import type { SessionUser } from "@/lib/auth";

const PURCHASE_MANAGER_EMAILS = new Set(["huy@gbb.vn", "ha@gbb.vn", "tien@gbb.vn"]);

export function canManagePurchases(session: Pick<SessionUser, "email">) {
  return PURCHASE_MANAGER_EMAILS.has(session.email.trim().toLowerCase());
}

export function requirePurchaseManager(session: Pick<SessionUser, "email">) {
  if (!canManagePurchases(session)) {
    throw new Error("FORBIDDEN_PURCHASE_MANAGE");
  }
}

export function purchasePermissionErrorResponse(message: string) {
  if (message === "FORBIDDEN_PURCHASE_MANAGE") {
    return {
      error: "Tài khoản này không có quyền nhập hàng."
    };
  }

  return null;
}
