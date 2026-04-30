import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER"]);
    const contentType = request.headers.get("content-type") || "";
    let xlsxPath = "/Users/vitran/Downloads/302.xlsx";
    let uploadedPath: string | null = null;
    let branchId = session.branchId;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const incomingBranchId = String(formData.get("branchId") || "").trim();
      branchId = incomingBranchId || branchId;

      if (file instanceof File && file.size > 0) {
        const safeName = basename(file.name || "products.xlsx").replace(/\s+/g, "-");
        uploadedPath = join(tmpdir(), `${Date.now()}-${safeName}`);
        const bytes = Buffer.from(await file.arrayBuffer());
        await writeFile(uploadedPath, bytes);
        xlsxPath = uploadedPath;
      } else {
        const incomingPath = String(formData.get("xlsxPath") || "").trim();
        if (incomingPath) {
          xlsxPath = incomingPath;
        }
      }
    } else {
      const body = (await request.json()) as { xlsxPath?: string; branchId?: string };
      xlsxPath = body.xlsxPath?.trim() || xlsxPath;
      branchId = body.branchId || branchId;
    }

    if (!branchId) {
      const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
      branchId = branch?.id ?? null;
    }

    if (!branchId) {
      return NextResponse.json({ error: "Không xác định được chi nhánh để import tồn kho." }, { status: 400 });
    }

    try {
      const { stdout } = await execFileAsync("python3", ["scripts/import_products_from_xlsx.py", xlsxPath], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout) as {
        source: string;
        count: number;
        products: Array<{
          sku: string;
          name: string;
          category: string;
          sellingPrice: number;
          stock: number;
          imageUrl: string;
          status: "ACTIVE" | "INACTIVE";
          description: string;
        }>;
      };

      const imported = await prisma.$transaction(async (tx) => {
        let total = 0;

        for (const item of parsed.products) {
          let categoryId: string | null = null;
          if (item.category) {
            const slug = item.category.toLowerCase().replace(/ /g, "-");
            const category = await tx.category.upsert({
              where: { slug },
              update: { name: item.category },
              create: { name: item.category, slug },
            });
            categoryId = category.id;
          }

          const slug = `${item.name}-${item.sku}`.toLowerCase().replace(/ /g, "-").replace(/\//g, "-").replace(/-+/g, "-");
          const product = await tx.product.upsert({
            where: { sku: item.sku },
            update: {
              name: item.name,
              slug,
              categoryId,
              sellingPrice: item.sellingPrice,
              imageUrl: item.imageUrl || null,
              status: item.status,
              description: item.description,
            },
            create: {
              name: item.name,
              slug,
              sku: item.sku,
              barcode: null,
              categoryId,
              brandId: null,
              costPrice: 0,
              sellingPrice: item.sellingPrice,
              imageUrl: item.imageUrl || null,
              lowStockAlert: 10,
              status: item.status,
              description: item.description,
            },
          });

          const existingInventory = await tx.inventory.findFirst({
            where: {
              branchId,
              productId: product.id,
              variantId: null,
            },
            select: { id: true },
          });

          if (existingInventory) {
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                quantity: Math.round(item.stock),
                reservedQty: 0,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                branchId,
                productId: product.id,
                quantity: Math.round(item.stock),
                reservedQty: 0,
              },
            });
          }

          total += 1;
        }
        return total;
      });

      return NextResponse.json({
        ok: true,
        imported,
        source: parsed.source,
      });
    } finally {
      if (uploadedPath) {
        await unlink(uploadedPath).catch(() => null);
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể import sản phẩm từ Excel" },
      { status: 500 }
    );
  }
}
