import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validations";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
    }

    const demoUsers: Record<
      string,
      { id: string; email: string; name: string; role: "ADMIN" | "MANAGER" | "CASHIER"; branchId: string | null }
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

    const user =
      parsed.data.password === "12345678"
        ? demoUsers[parsed.data.email]
        : undefined;

    if (!user) {
      return NextResponse.json({ error: "Sai email hoặc mật khẩu" }, { status: 401 });
    }

    const token = await new SignJWT(user)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    const response = NextResponse.json({ ok: true, user });
    response.cookies.set("soban_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/"
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lỗi đăng nhập nội bộ"
      },
      { status: 500 }
    );
  }
}
