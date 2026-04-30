import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareSearchResults, getSearchScore } from "@/lib/search";

export async function GET(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    if (!query) {
      return NextResponse.json([]);
    }

    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        imageUrl: true,
        category: {
          select: {
            name: true
          }
        }
      },
      orderBy: { name: "asc" },
      take: 5000
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
      .slice(0, 100)
      .map((entry) => ({
        label: entry.product.name,
        value: entry.product.name,
        meta: `${entry.product.sku}${entry.product.category?.name ? ` • ${entry.product.category.name}` : ""}`,
        imageUrl: entry.product.imageUrl,
        accent: entry.product.sku,
        searchText: entry.product.name
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
