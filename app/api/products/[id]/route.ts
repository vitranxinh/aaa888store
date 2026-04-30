import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { productSchema } from "@/lib/validations";

function buildSlug(name: string, sku: string) {
  return `${name}-${sku}`
    .toLowerCase()
    .trim()
    .replace(/\//g, "-")
    .replace(/ /g, "-")
    .replace(/-+/g, "-");
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const body = await request.json();
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu sản phẩm không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({
      where: { id: params.id },
      select: { id: true, sku: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    }

    if (parsed.data.sku !== existing.sku) {
      const skuTaken = await prisma.product.findFirst({
        where: {
          sku: parsed.data.sku,
          id: { not: params.id },
        },
        select: { id: true },
      });

      if (skuTaken) {
        return NextResponse.json({ error: "SKU đã tồn tại" }, { status: 400 });
      }
    }

    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: parsed.data.name,
        slug: buildSlug(parsed.data.name, parsed.data.sku),
        sku: parsed.data.sku,
        barcode: parsed.data.barcode || null,
        imageUrl: parsed.data.imageUrl || null,
        categoryId: parsed.data.categoryId || null,
        brandId: parsed.data.brandId || null,
        costPrice: parsed.data.costPrice,
        sellingPrice: parsed.data.sellingPrice,
        lowStockAlert: parsed.data.lowStockAlert,
        status: parsed.data.status,
        description: parsed.data.description || null,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật sản phẩm" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN"]);

    const product = await prisma.product.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            orderItems: true,
            purchaseItems: true,
            inventoryTxns: true
          }
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    }

    if (product._count.orderItems > 0 || product._count.purchaseItems > 0 || product._count.inventoryTxns > 0) {
      return NextResponse.json(
        { error: "Không thể xóa sản phẩm đã phát sinh hóa đơn, nhập hàng hoặc lịch sử kho" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventory.deleteMany({ where: { productId: params.id } });
      await tx.productBatch.deleteMany({ where: { productId: params.id } });
      await tx.promotionProduct.deleteMany({ where: { productId: params.id } });
      await tx.productVariant.deleteMany({ where: { productId: params.id } });
      await tx.product.delete({ where: { id: params.id } });
    });

    return NextResponse.json({ ok: true, name: product.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa sản phẩm" },
      { status: 500 }
    );
  }
}
