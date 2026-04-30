import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

    if (!query) {
      return NextResponse.json([]);
    }

    const customers = await prisma.customer.findMany({
      where: {
        NOT: { code: "KH000000" },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { code: { contains: query, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        name: true,
        code: true,
        phone: true
      },
      orderBy: { updatedAt: "desc" },
      take: limit
    });

    return NextResponse.json(
      customers.map((customer) => ({
        id: customer.id,
        label: customer.name,
        value: customer.name,
        meta: [customer.code, customer.phone].filter(Boolean).join(" • "),
        accent: customer.code,
        searchText: customer.name
      }))
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
