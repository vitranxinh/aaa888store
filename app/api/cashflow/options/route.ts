import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareSearchResults, getSearchScore } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OptionKind = "customer" | "supplier" | "order" | "purchase";

function rankResults<T extends { label: string; searchText: string }>(
  rows: T[],
  query: string,
  limit: number
) {
  return rows
    .map((row) => ({
      row,
      score: getSearchScore(row.searchText, query)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      compareSearchResults(
        { label: a.row.label, score: a.score, searchText: a.row.searchText },
        { label: b.row.label, score: b.score, searchText: b.row.searchText },
        query
      )
    )
    .slice(0, limit)
    .map((entry) => entry.row);
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const kind = (searchParams.get("kind") ?? "") as OptionKind;
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "15") || 15, 25);

    if (!kind) {
      return NextResponse.json({ error: "Thiếu loại dữ liệu" }, { status: 400 });
    }

    if (kind === "customer") {
      const customers = await prisma.customer.findMany({
        where: query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { code: { contains: query, mode: "insensitive" } }
              ]
            }
          : undefined,
        select: { id: true, name: true, code: true, phone: true },
        orderBy: { updatedAt: "desc" },
        take: 80
      });

      return NextResponse.json(
        rankResults(
          customers.map((customer) => ({
            id: customer.id,
            label: customer.name,
            meta: [customer.code, customer.phone].filter(Boolean).join(" • "),
            searchText: `${customer.name} ${customer.code} ${customer.phone ?? ""}`
          })),
          query || " ",
          limit
        )
      );
    }

    if (kind === "supplier") {
      const suppliers = await prisma.supplier.findMany({
        where: query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { code: { contains: query, mode: "insensitive" } }
              ]
            }
          : undefined,
        select: { id: true, name: true, code: true, phone: true },
        orderBy: { updatedAt: "desc" },
        take: 80
      });

      return NextResponse.json(
        rankResults(
          suppliers.map((supplier) => ({
            id: supplier.id,
            label: supplier.name,
            meta: [supplier.code, supplier.phone].filter(Boolean).join(" • "),
            searchText: `${supplier.name} ${supplier.code} ${supplier.phone ?? ""}`
          })),
          query || " ",
          limit
        )
      );
    }

    if (kind === "order") {
      const orders = await prisma.order.findMany({
        where: {
          branchId: session.branchId ?? undefined,
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: "insensitive" } },
                  { customer: { name: { contains: query, mode: "insensitive" } } }
                ]
              }
            : {})
        },
        select: {
          id: true,
          code: true,
          customer: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 60
      });

      return NextResponse.json(
        rankResults(
          orders.map((order) => ({
            id: order.id,
            label: order.code,
            meta: order.customer?.name ?? "",
            searchText: `${order.code} ${order.customer?.name ?? ""}`
          })),
          query || " ",
          limit
        )
      );
    }

    if (kind === "purchase") {
      const purchases = await prisma.purchaseOrder.findMany({
        where: {
          branchId: session.branchId ?? undefined,
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: "insensitive" } },
                  { supplier: { name: { contains: query, mode: "insensitive" } } }
                ]
              }
            : {})
        },
        select: {
          id: true,
          code: true,
          supplier: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 60
      });

      return NextResponse.json(
        rankResults(
          purchases.map((purchase) => ({
            id: purchase.id,
            label: purchase.code,
            meta: purchase.supplier?.name ?? "",
            searchText: `${purchase.code} ${purchase.supplier?.name ?? ""}`
          })),
          query || " ",
          limit
        )
      );
    }

    return NextResponse.json({ error: "Loại dữ liệu không hợp lệ" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
