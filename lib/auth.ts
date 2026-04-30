import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
const COOKIE_NAME = "soban_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId: string | null;
};

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/"
  });
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = await jwtVerify(token, JWT_SECRET);
    return payload.payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function requireSession(roles?: UserRole[]) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (roles && !roles.includes(session.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireApiSession(roles?: UserRole[]) {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  if (roles && !roles.includes(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function authenticate(email: string, password: string) {
  const demoUsers: Record<
    string,
    { id: string; email: string; name: string; role: UserRole; branchId: string | null }
  > = {
    "admin@soban.vn": {
      id: "demo-admin",
      email: "admin@soban.vn",
      name: "Chủ cửa hàng",
      role: "ADMIN",
      branchId: null
    },
    "manager@soban.vn": {
      id: "demo-manager",
      email: "manager@soban.vn",
      name: "Quản lý quầy",
      role: "MANAGER",
      branchId: null
    },
    "cashier@soban.vn": {
      id: "demo-cashier",
      email: "cashier@soban.vn",
      name: "Thu ngân",
      role: "CASHIER",
      branchId: null
    }
  };

  if (password === "12345678" && demoUsers[email]) {
    return demoUsers[email];
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || !user.isActive) return null;
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId
  } satisfies SessionUser;
}
