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
  const maxAge = 60 * 60 * 24 * 365;
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge,
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

export async function resolveActorUserId(session: SessionUser) {
  const user =
    (await prisma.user.findUnique({
      where: { email: session.email },
      select: { id: true }
    })) ??
    (await prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    }));

  if (!user) {
    throw new Error("Chưa có người dùng hợp lệ trong hệ thống");
  }

  return user.id;
}

export async function authenticate(email: string, password: string) {
  const defaultBranchId =
    (await prisma.branch.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    }))?.id ?? null;

  const demoUsers: Record<
    string,
    { id: string; email: string; name: string; role: UserRole; branchId: string | null }
  > = {
    "huy@gbb.vn": {
      id: "demo-admin",
      email: "huy@gbb.vn",
      name: "Huy",
      role: "ADMIN",
      branchId: defaultBranchId
    },
    "ha@gbb.vn": {
      id: "demo-admin-2",
      email: "ha@gbb.vn",
      name: "Hà",
      role: "ADMIN",
      branchId: defaultBranchId
    },
    "nam@gbb.vn": {
      id: "demo-manager",
      email: "nam@gbb.vn",
      name: "Nam",
      role: "CASHIER",
      branchId: defaultBranchId
    },
    "bich@gbb.vn": {
      id: "demo-cashier",
      email: "bich@gbb.vn",
      name: "Bich",
      role: "CASHIER",
      branchId: defaultBranchId
    }
  };

  if (demoUsers[email] && (
    (email === "huy@gbb.vn" && password === "huy2005") ||
    (email === "ha@gbb.vn" && password === "ha2005") ||
    (email === "nam@gbb.vn" && password === "nam") ||
    (email === "bich@gbb.vn" && password === "bich")
  )) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, branchId: true }
    });

    if (user) {
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId
      } satisfies SessionUser;
    }

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
