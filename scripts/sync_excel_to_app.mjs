import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

function toSlug(value, suffix = "") {
  return `${value}${suffix ? `-${suffix}` : ""}`
    .toLowerCase()
    .trim()
    .replace(/\//g, "-")
    .replace(/ /g, "-")
    .replace(/-+/g, "-");
}

async function readJson(script, xlsxPath) {
  const { stdout } = await execFileAsync("python3", [script, xlsxPath], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout);
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

async function syncProducts(xlsxPath) {
  const branchId = await ensureBranchId();
  const parsed = await readJson("scripts/import_products_from_xlsx.py", xlsxPath);
  let total = 0;
  const categoryCache = new Map();

  for (const item of parsed.products) {
    let categoryId = null;

    if (item.category) {
      const categorySlug = toSlug(item.category);
      if (categoryCache.has(categorySlug)) {
        categoryId = categoryCache.get(categorySlug);
      } else {
        const category = await prisma.category.upsert({
          where: { slug: categorySlug },
          update: { name: item.category },
          create: { name: item.category, slug: categorySlug },
        });
        categoryId = category.id;
        categoryCache.set(categorySlug, category.id);
      }
    }

    const product = await prisma.product.upsert({
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

    const existingInventory = await prisma.inventory.findFirst({
      where: {
        branchId,
        productId: product.id,
        variantId: null,
      },
      select: { id: true },
    });

    if (existingInventory) {
      await prisma.inventory.update({
        where: { id: existingInventory.id },
        data: {
          quantity: Math.round(item.stock || 0),
          reservedQty: 0,
        },
      });
    } else {
      await prisma.inventory.create({
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

  return { total, source: parsed.source };
}

async function syncCustomers(xlsxPath) {
  const parsed = await readJson("scripts/import_customers_from_xlsx.py", xlsxPath);
  let total = 0;

  for (const item of parsed.customers) {
    if (!item.code || !item.name) continue;

    const normalizedPhone = item.phone.trim() || `NO-PHONE-${item.code}`;
    const existingByCode = await prisma.customer.findUnique({
      where: { code: item.code },
      select: { id: true },
    });
    const existingByPhone = normalizedPhone.startsWith("NO-PHONE-")
      ? null
      : await prisma.customer.findFirst({
          where: { phone: normalizedPhone },
          select: { id: true },
        });

    const targetId = existingByCode?.id ?? existingByPhone?.id ?? null;

    if (targetId) {
      await prisma.customer.update({
        where: { id: targetId },
        data: {
          code: item.code,
          name: item.name,
          phone: normalizedPhone,
          address: item.address || null,
          note: item.note || null,
          openingDebt: 0,
        },
      });
    } else {
      await prisma.customer.create({
        data: {
          code: item.code,
          name: item.name,
          phone: normalizedPhone,
          address: item.address || null,
          note: item.note || null,
          openingDebt: 0,
          receivableDebt: 0,
        },
      });
    }

    total += 1;
  }

  return { total, source: parsed.source };
}

async function main() {
  const xlsxPath = process.argv[2] || "/Users/vitran/Downloads/302.xlsx";
  const mode = process.argv[3] || "both";
  const result = { xlsxPath, mode };

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
