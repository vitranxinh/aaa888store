import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { productSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const products = await prisma.product.findMany({
      include: { category: true, brand: true, variants: true, inventories: true },
      orderBy: { updatedAt: "desc" }
    });
    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const body = await request.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu sản phẩm không hợp lệ" }, { status: 400 });
    }
    const slug = parsed.data.name.toLowerCase().replace(/ /g, "-");
    const product = await prisma.product.create({
      data: {
        ...parsed.data,
        slug,
        barcode: parsed.data.barcode || null,
        imageUrl: parsed.data.imageUrl || null,
        categoryId: parsed.data.categoryId || null,
        brandId: parsed.data.brandId || null,
        description: parsed.data.description || null
      }
    });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
