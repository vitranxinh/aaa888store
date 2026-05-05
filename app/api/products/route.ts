import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { productSchema } from "@/lib/validations";

async function generateProductSku() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `SP${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const existing = await prisma.product.findUnique({
      where: { sku: candidate },
      select: { id: true }
    });

    if (!existing) return candidate;
  }

  return `SP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

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
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const productInput = {
      name: body.name,
      sku: body.sku || (await generateProductSku()),
      barcode: body.barcode || "",
      imageUrl: body.imageUrl || "",
      categoryId: body.categoryId || "",
      brandId: body.brandId || "",
      costPrice: typeof body.costPrice === "number" ? body.costPrice : 0,
      sellingPrice: typeof body.sellingPrice === "number" ? body.sellingPrice : Number(body.sellingPrice ?? 0),
      lowStockAlert: typeof body.lowStockAlert === "number" ? body.lowStockAlert : 10,
      status: body.status || "ACTIVE",
      description: body.description || ""
    };
    const parsed = productSchema.safeParse(productInput);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu sản phẩm không hợp lệ" }, { status: 400 });
    }
    const slug = `${parsed.data.name}-${parsed.data.sku}`.toLowerCase().replace(/\//g, "-").replace(/ /g, "-").replace(/-+/g, "-");
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
    revalidateTag("products-page");
    revalidateTag("pos-data");
    revalidatePath("/products");
    revalidatePath("/pos");
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
