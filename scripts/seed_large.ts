import { PrismaClient, OrderStatus, PaymentMethod, PurchaseStatus, ProductStatus, StockTxnType, CashTxnType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log("Cleaning up database...");
  await prisma.cashTransaction.deleteMany();
  await prisma.productBatch.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.promotionProduct.deleteMany();
  await prisma.promotionBranch.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.customerGroup.deleteMany();

  // Keep branch and users from original seed
  let branch = await prisma.branch.findFirst();
  if (!branch) {
    branch = await prisma.branch.create({
      data: { code: "Q302", name: "AAA888", address: "Thanh Xuân, Hà Nội", phone: "0918377022" }
    });
  }

  let users = await prisma.user.findMany();
  if (users.length === 0) {
    const pwd = await bcrypt.hash("123456", 10);
    const user = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.com", passwordHash: pwd, role: "ADMIN", branchId: branch.id }
    });
    users = [user];
  }

  console.log("Seeding Customer Groups & Customers...");
  const group1 = await prisma.customerGroup.create({ data: { name: "Khách VIP" } });
  const group2 = await prisma.customerGroup.create({ data: { name: "Khách lẻ" } });

  // Walk-in customer - REQUIRED for POS default orders
  const walkIn = await prisma.customer.create({
    data: {
      code: "KH000000",
      name: "Khách lẻ",
      phone: "0000000000",
      address: "",
      groupId: group2.id,
    }
  });

  const customers = [walkIn];
  for (let i = 1; i <= 50; i++) {
    customers.push(
      await prisma.customer.create({
        data: {
          code: `KH${i.toString().padStart(5, "0")}`,
          name: `Khách Hàng ${i}`,
          phone: `09${randomInt(10000000, 99999999)}`,
          address: `Địa chỉ mẫu số ${i}, Hà Nội`,
          groupId: i % 5 === 0 ? group1.id : group2.id,
          openingDebt: i % 10 === 0 ? randomInt(1, 5) * 100000 : 0,
          receivableDebt: 0,
          totalSpend: 0,
        }
      })
    );
  }

  console.log("Seeding Suppliers...");
  const suppliers = [];
  for (let i = 1; i <= 10; i++) {
    suppliers.push(
      await prisma.supplier.create({
        data: {
          code: `NCC${i.toString().padStart(4, "0")}`,
          name: `Nhà Cung Cấp ${i}`,
          phone: `08${randomInt(10000000, 99999999)}`,
          address: `Khu công nghiệp ${i}`,
          openingDebt: 0,
          payableDebt: 0,
        }
      })
    );
  }

  console.log("Seeding Categories & Brands...");
  const categories = [];
  for (let i = 1; i <= 10; i++) {
    categories.push(
      await prisma.category.create({ data: { name: `Danh mục ${i}`, slug: `danh-muc-${i}` } })
    );
  }

  const brands = [];
  for (let i = 1; i <= 5; i++) {
    brands.push(
      await prisma.brand.create({ data: { name: `Thương hiệu ${i}`, slug: `thuong-hieu-${i}` } })
    );
  }

  console.log("Seeding Products & Inventory...");
  const products = [];
  for (let i = 1; i <= 100; i++) {
    const costPrice = randomInt(5, 50) * 10000;
    const sellingPrice = costPrice + randomInt(1, 20) * 10000;
    const product = await prisma.product.create({
      data: {
        name: `Sản phẩm test ${i}`,
        slug: `san-pham-test-${i}`,
        sku: `SP${i.toString().padStart(5, "0")}`,
        barcode: `893${randomInt(100000000, 999999999)}`,
        categoryId: categories[randomInt(0, categories.length - 1)].id,
        brandId: brands[randomInt(0, brands.length - 1)].id,
        costPrice,
        sellingPrice,
        lowStockAlert: 10,
        status: ProductStatus.ACTIVE,
      }
    });
    products.push(product);

    await prisma.inventory.create({
      data: {
        branchId: branch.id,
        productId: product.id,
        quantity: randomInt(50, 500),
        reservedQty: 0,
      }
    });
  }

  console.log("Seeding Purchase Orders...");
  const now = new Date();
  const past3Months = new Date();
  past3Months.setMonth(past3Months.getMonth() - 3);

  for (let i = 1; i <= 30; i++) {
    const poDate = randomDate(past3Months, now);
    const supplier = suppliers[randomInt(0, suppliers.length - 1)];
    const itemCount = randomInt(1, 5);
    const items = [];
    let totalAmount = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = products[randomInt(0, products.length - 1)];
      const qty = randomInt(10, 50);
      const importPrice = Number(product.costPrice);
      const total = qty * importPrice;
      totalAmount += total;

      items.push({
        productId: product.id,
        quantity: qty,
        importPrice,
        total,
        batchNumber: `BATCH-${i}-${j}`,
        expiryDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        code: `PN${i.toString().padStart(6, "0")}`,
        branchId: branch.id,
        supplierId: supplier.id,
        createdById: users[0].id,
        status: PurchaseStatus.COMPLETED,
        totalAmount,
        paidAmount: totalAmount,
        debtAmount: 0,
        note: `Nhập hàng lần ${i}`,
        createdAt: poDate,
        updatedAt: poDate,
        items: { create: items }
      },
      include: { items: true }
    });

    for (const item of po.items) {
      await prisma.productBatch.create({
        data: {
          branchId: branch.id,
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          importPrice: item.importPrice,
          purchaseItemId: item.id,
        }
      });
      await prisma.inventoryTransaction.create({
        data: {
          branchId: branch.id,
          productId: item.productId,
          type: StockTxnType.IMPORT,
          quantity: item.quantity,
          referenceCode: po.code,
          createdById: users[0].id,
          createdAt: poDate,
        }
      });
    }
  }

  console.log("Seeding Orders...");
  for (let i = 1; i <= 200; i++) {
    const orderDate = randomDate(past3Months, now);
    const customer = customers[randomInt(0, customers.length - 1)];
    const itemCount = randomInt(1, 4);
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = products[randomInt(0, products.length - 1)];
      const qty = randomInt(1, 5);
      const unitPrice = Number(product.sellingPrice);
      const total = qty * unitPrice;
      subtotal += total;

      items.push({
        productId: product.id,
        quantity: qty,
        unitPrice,
        costPrice: Number(product.costPrice),
        discountValue: 0,
        total,
      });
    }

    const order = await prisma.order.create({
      data: {
        code: `HD${i.toString().padStart(6, "0")}`,
        branchId: branch.id,
        customerId: customer.id,
        createdById: users[0].id,
        status: OrderStatus.COMPLETED,
        subtotal,
        discountTotal: 0,
        grandTotal: subtotal,
        paymentMethod: PaymentMethod.CASH,
        paidAmount: subtotal,
        debtAmount: 0,
        createdAt: orderDate,
        updatedAt: orderDate,
        items: { create: items }
      }
    });

    await prisma.cashTransaction.create({
      data: {
        code: `PT-HD${i.toString().padStart(6, "0")}`,
        branchId: branch.id,
        type: CashTxnType.RECEIPT,
        amount: subtotal,
        customerId: customer.id,
        orderId: order.id,
        createdById: users[0].id,
        createdAt: orderDate,
      }
    });
  }

  console.log("Seed Large Data Completed Successfully!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
