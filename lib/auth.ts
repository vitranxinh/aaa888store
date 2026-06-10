import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
const COOKIE_NAME = "soban_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

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
  const maxAge = 60 * 60 * 24 * 365;
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);

  cookies().set(COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    maxAge,
  });
}

export async function destroySession() {
  cookies().set(COOKIE_NAME, "", {
    ...COOKIE_OPTIONS,
    maxAge: 0
  });
}

export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = await jwtVerify(token, JWT_SECRET);
    const session = payload.payload as Partial<SessionUser>;
    const sessionId = typeof session.id === "string" ? session.id : "";
    const sessionEmail = typeof session.email === "string" ? session.email : "";

    if (!sessionId && !sessionEmail) return null;

    const user = sessionId && !sessionId.startsWith("demo-")
      ? await prisma.user.findFirst({
          where: {
            id: sessionId,
            email: sessionEmail,
            isActive: true
          },
          select: { id: true, email: true, name: true, role: true, branchId: true }
        })
      : await prisma.user.findFirst({
          where: {
            email: sessionEmail,
            isActive: true
          },
          select: { id: true, email: true, name: true, role: true, branchId: true }
        });

    return user;
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

export async function resolveActorUserId(session: SessionUser) {
  const user = await prisma.user.findFirst({
    where: {
      id: session.id,
      email: session.email,
      isActive: true
    },
    select: { id: true }
  });

  if (!user) {
    throw new Error("Phiên đăng nhập không khớp tài khoản hợp lệ. Vui lòng đăng nhập lại.");
  }

  return user.id;
}

export async function authenticate(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
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
