import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareSearchResults, getSearchScore } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayCustomerPhone(phone: string | null) {
  return phone?.startsWith("AUTO_PHONE_") ? "" : phone;
}

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
      orderBy: { name: "asc" },
      take: 200
    });

    const results = customers
      .map((customer) => ({
        customer: { ...customer, phone: displayCustomerPhone(customer.phone) },
        score: getSearchScore(`${customer.name} ${customer.code} ${displayCustomerPhone(customer.phone) ?? ""}`, query)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        compareSearchResults(
          { label: a.customer.name, score: a.score, searchText: `${a.customer.name} ${a.customer.code} ${a.customer.phone ?? ""}` },
          { label: b.customer.name, score: b.score, searchText: `${b.customer.name} ${b.customer.code} ${b.customer.phone ?? ""}` },
          query
        )
      )
      .slice(0, limit)
      .map((entry) => ({
        id: entry.customer.id,
        label: entry.customer.name,
        value: entry.customer.name,
        meta: [entry.customer.code, entry.customer.phone].filter(Boolean).join(" • "),
        accent: entry.customer.code,
        searchText: entry.customer.name
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
