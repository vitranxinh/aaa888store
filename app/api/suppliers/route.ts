import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { supplierSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "80") || 80, 200);
    const suppliers = await prisma.supplier.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { code: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } }
            ]
          }
        : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true
      },
      orderBy: { code: "asc" },
      take: limit
    });
    return NextResponse.json(suppliers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = supplierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu nhà cung cấp không hợp lệ" }, { status: 400 });
    }

    const duplicate = await prisma.supplier.findFirst({
      where: {
        OR: [
          { code: parsed.data.code },
          ...(parsed.data.phone ? [{ phone: parsed.data.phone }] : [])
        ]
      },
      select: { id: true }
    });

    if (duplicate) {
      return NextResponse.json({ error: "Mã NCC hoặc số điện thoại đã tồn tại" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        openingDebt: parsed.data.openingDebt,
        payableDebt: 0
      }
    });

    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể thêm nhà cung cấp" },
      { status: 500 }
    );
  }
}
