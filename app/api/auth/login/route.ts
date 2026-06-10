import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

function getRequestOrigin(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/.test(host) ? "http" : "https");

  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      if (!isJson) {
        const redirectUrl = new URL("/login", getRequestOrigin(request));
        redirectUrl.searchParams.set("error", "Dữ liệu đăng nhập không hợp lệ");
        return NextResponse.redirect(redirectUrl, 303);
      }
      return NextResponse.json({ error: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
    }

    let user: {
      id: string;
      email: string;
      name: string;
      role: "ADMIN" | "MANAGER" | "CASHIER";
      branchId: string | null;
    } | null = null;
    const email = parsed.data.email.trim().toLowerCase();

    const realUser = await prisma.user.findUnique({
      where: { email }
    });

    if (realUser?.isActive) {
      const isValidPassword = await bcrypt.compare(parsed.data.password, realUser.passwordHash);
      if (isValidPassword) {
        user = {
          id: realUser.id,
          email: realUser.email,
          name: realUser.name,
          role: realUser.role,
          branchId: realUser.branchId
        };
      }
    }

    if (!user) {
      if (!isJson) {
        const redirectUrl = new URL("/login", getRequestOrigin(request));
        redirectUrl.searchParams.set("error", "Sai email hoặc mật khẩu");
        const callbackUrl = String(body.callbackUrl ?? "");
        if (callbackUrl) redirectUrl.searchParams.set("callbackUrl", callbackUrl);
        return NextResponse.redirect(redirectUrl, 303);
      }
      return NextResponse.json({ error: "Sai email hoặc mật khẩu" }, { status: 401 });
    }

    const token = await new SignJWT(user)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    const callbackUrl = String(body.callbackUrl ?? "");
    const response = isJson
      ? NextResponse.json({ ok: true, user })
      : NextResponse.redirect(new URL(callbackUrl || "/dashboard", getRequestOrigin(request)), 303);
    response.cookies.set("soban_session", token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 7
    });

    return response;
  } catch (error) {
    const contentType = request.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    if (!isJson) {
      const redirectUrl = new URL("/login", getRequestOrigin(request));
      redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "Lỗi đăng nhập nội bộ");
      return NextResponse.redirect(redirectUrl, 303);
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lỗi đăng nhập nội bộ"
      },
      { status: 500 }
    );
  }
}
