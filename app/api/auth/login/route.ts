import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");

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
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.json({ error: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
    }

    const defaultBranchId =
      (await prisma.branch.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true }
      }))?.id ?? null;

    const demoUsers: Record<
      string,
      { id: string; email: string; name: string; role: "ADMIN" | "MANAGER" | "CASHIER"; branchId: string | null }
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

    const demoUser =
      ((parsed.data.email === "huy@gbb.vn" && parsed.data.password === "huy2005") ||
        (parsed.data.email === "ha@gbb.vn" && parsed.data.password === "ha2005") ||
        (parsed.data.email === "nam@gbb.vn" && parsed.data.password === "nam") ||
        (parsed.data.email === "bich@gbb.vn" && parsed.data.password === "bich"))
        ? demoUsers[parsed.data.email]
        : undefined;

    const realUser = demoUser
      ? await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, role: true, branchId: true }
        })
      : null;

    const user = realUser
      ? {
          id: realUser.id,
          email: realUser.email,
          name: realUser.name,
          role: realUser.role,
          branchId: realUser.branchId
        }
      : demoUser;

    if (!user) {
      if (!isJson) {
        const redirectUrl = new URL("/login", getRequestOrigin(request));
        redirectUrl.searchParams.set("error", "Sai email hoặc mật khẩu");
        const callbackUrl = String(body.callbackUrl ?? "");
        if (callbackUrl) redirectUrl.searchParams.set("callbackUrl", callbackUrl);
        return NextResponse.redirect(redirectUrl);
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
      : NextResponse.redirect(new URL(callbackUrl || "/dashboard", getRequestOrigin(request)));
    response.cookies.set("soban_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/"
    });

    return response;
  } catch (error) {
    const contentType = request.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    if (!isJson) {
      const redirectUrl = new URL("/login", getRequestOrigin(request));
      redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "Lỗi đăng nhập nội bộ");
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lỗi đăng nhập nội bộ"
      },
      { status: 500 }
    );
  }
}
