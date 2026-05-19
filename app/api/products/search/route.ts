import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareSearchResults, getSearchScore } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "40") || 40, 100);
    const salesOnly = searchParams.get("salesOnly") === "1";
    const branchId = searchParams.get("branchId")?.trim() || session.branchId || "";
    const status = searchParams.get("status");
    const includeInactive = searchParams.get("includeInactive") === "1";

    if (!query) {
      return NextResponse.json([]);
    }

    const products = await prisma.product.findMany({
      where: {
        ...(salesOnly
          ? {
              status: "ACTIVE" as const
            }
          : status === "active"
            ? { status: "ACTIVE" as const }
            : status === "inactive"
              ? { status: "INACTIVE" as const }
              : includeInactive
                ? {}
                : { status: "ACTIVE" as const }),
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { sku: { contains: query, mode: "insensitive" } },
          { barcode: { contains: query, mode: "insensitive" } },
          { category: { name: { contains: query, mode: "insensitive" } } }
        ]
      },
      select: {
        id: true,
        name: true,
        sku: true,
        imageUrl: true,
        sellingPrice: true,
        inventories: {
          where: {
            branchId: branchId || undefined,
            variantId: null
          },
          select: {
            quantity: true,
            reservedQty: true
          }
        },
        category: {
          select: {
            name: true
          }
        }
      },
      orderBy: { name: "asc" },
      take: 400
    });

    const results = products
      .map((product) => ({
        product,
        score: getSearchScore(product.name, query)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        compareSearchResults(
          { label: a.product.name, score: a.score, searchText: a.product.name },
          { label: b.product.name, score: b.score, searchText: b.product.name },
          query
        )
      )
      .slice(0, limit)
      .map((entry) => {
        const currentStock = entry.product.inventories.reduce(
          (sum, inventory) => sum + inventory.quantity - inventory.reservedQty,
          0
        );

        return {
          label: entry.product.name,
          value: entry.product.name,
          id: entry.product.id,
          meta: `${entry.product.sku}${entry.product.category?.name ? ` • ${entry.product.category.name}` : ""}`,
          imageUrl: entry.product.imageUrl,
          accent: entry.product.sku,
          searchText: entry.product.name,
          sellingPrice: Number(entry.product.sellingPrice),
          currentStock
        };
      });

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
