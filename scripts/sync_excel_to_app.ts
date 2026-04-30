import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

type ImportedProduct = {
  sku: string;
  name: string;
  category: string;
  sellingPrice: number;
  stock: number;
  imageUrl: string;
  status: "ACTIVE" | "INACTIVE";
  description: string;
};

type ImportedCustomer = {
  code: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  openingDebt: number;
};

function toSlug(value: string, suffix = "") {
  return `${value}${suffix ? `-${suffix}` : ""}`
    .toLowerCase()
    .trim()
    .replace(/\//g, "-")
    .replace(/ /g, "-")
    .replace(/-+/g, "-");
}

async function readJson<T>(script: string, xlsxPath: string): Promise<T> {
  const { stdout } = await execFileAsync("python3", [script, xlsxPath], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as T;
}

async function ensureBranchId() {
  const branch = await prisma.branch.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!branch) {
    throw new Error("Không tìm thấy chi nhánh active để đồng bộ dữ liệu.");
  }

  return branch.id;
}

async function syncProducts(xlsxPath: string) {
  const branchId = await ensureBranchId();
  const parsed = await readJson<{ source: string; count: number; products: ImportedProduct[] }>(
    "scripts/import_products_from_xlsx.py",
    xlsxPath
  );

  let total = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of parsed.products) {
      let categoryId: string | null = null;

      if (item.category) {
        const category = await tx.category.upsert({
          where: { slug: toSlug(item.category) },
          update: { name: item.category },
          create: { name: item.category, slug: toSlug(item.category) },
        });
        categoryId = category.id;
      }

      const product = await tx.product.upsert({
        where: { sku: item.sku },
        update: {
          name: item.name,
          slug: toSlug(item.name, item.sku),
          categoryId,
          sellingPrice: item.sellingPrice,
          imageUrl: item.imageUrl || null,
          status: item.status,
          description: item.description || null,
        },
        create: {
          name: item.name,
          slug: toSlug(item.name, item.sku),
          sku: item.sku,
          barcode: null,
          categoryId,
          brandId: null,
          costPrice: 0,
          sellingPrice: item.sellingPrice,
          imageUrl: item.imageUrl || null,
          lowStockAlert: 10,
          status: item.status,
          description: item.description || null,
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
            quantity: Math.round(item.stock || 0),
            reservedQty: 0,
          },
        });
      } else {
        await tx.inventory.create({
          data: {
            branchId,
            productId: product.id,
            quantity: Math.round(item.stock || 0),
            reservedQty: 0,
          },
        });
      }

      total += 1;
    }
  });

  return { total, source: parsed.source };
}

async function syncCustomers(xlsxPath: string) {
  const parsed = await readJson<{ source: string; count: number; customers: ImportedCustomer[] }>(
    "scripts/import_customers_from_xlsx.py",
    xlsxPath
  );

  let total = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of parsed.customers) {
      if (!item.code || !item.name) continue;

      const normalizedPhone = item.phone.trim() || `NO-PHONE-${item.code}`;
      const existingByCode = await tx.customer.findUnique({
        where: { code: item.code },
        select: { id: true },
      });
      const existingByPhone = normalizedPhone.startsWith("NO-PHONE-")
        ? null
        : await tx.customer.findFirst({
            where: { phone: normalizedPhone },
            select: { id: true },
          });

      const targetId = existingByCode?.id ?? existingByPhone?.id ?? null;

      if (targetId) {
        await tx.customer.update({
          where: { id: targetId },
          data: {
            code: item.code,
            name: item.name,
            phone: normalizedPhone,
            address: item.address || null,
            note: item.note || null,
            openingDebt: item.openingDebt || 0,
          },
        });
      } else {
        await tx.customer.create({
          data: {
            code: item.code,
            name: item.name,
            phone: normalizedPhone,
            address: item.address || null,
            note: item.note || null,
            openingDebt: item.openingDebt || 0,
            receivableDebt: 0,
          },
        });
      }

      total += 1;
    }
  });

  return { total, source: parsed.source };
}

async function main() {
  const xlsxPath = process.argv[2] || "/Users/vitran/Downloads/302.xlsx";
  const mode = process.argv[3] || "both";

  const result: Record<string, unknown> = { xlsxPath, mode };

  if (mode === "products" || mode === "both") {
    result.products = await syncProducts(xlsxPath);
  }

  if (mode === "customers" || mode === "both") {
    result.customers = await syncCustomers(xlsxPath);
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
