import bcrypt from "bcryptjs";
import {
  CashTxnType,
  OrderStatus,
  PaymentMethod,
  PrismaClient,
  ProductStatus,
  PromotionType,
  PurchaseStatus,
  StockTxnType,
  UserRole
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  const branch = await prisma.branch.create({
    data: {
      code: "Q302",
      name: "AAAHHH",
      address: "Thanh Xuân, Hà Nội",
      phone: "0918377022"
    }
  });

  const adminHuyPasswordHash = await bcrypt.hash(process.env.SEED_ADMIN_HUY_PASSWORD ?? "huy2005", 10);
  const adminHaPasswordHash = await bcrypt.hash(process.env.SEED_ADMIN_HA_PASSWORD ?? "ha2005", 10);
  const employeeNamPasswordHash = await bcrypt.hash(process.env.SEED_EMPLOYEE_NAM_PASSWORD ?? "nam", 10);
  const employeeBichPasswordHash = await bcrypt.hash(process.env.SEED_EMPLOYEE_BICH_PASSWORD ?? "bich", 10);
  const employeeDanPasswordHash = await bcrypt.hash(process.env.SEED_EMPLOYEE_DAN_PASSWORD ?? "dan", 10);
  const [ownerHuy, ownerHa, employeeA, employeeB] = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: "Huy",
        email: process.env.SEED_ADMIN_HUY_EMAIL ?? "huy@gbb.vn",
        passwordHash: adminHuyPasswordHash,
        role: UserRole.ADMIN,
        branchId: branch.id
      }
    }),
    prisma.user.create({
      data: {
        name: "Hà",
        email: process.env.SEED_ADMIN_HA_EMAIL ?? "ha@gbb.vn",
        passwordHash: adminHaPasswordHash,
        role: UserRole.ADMIN,
        branchId: branch.id
      }
    }),
    prisma.user.create({
      data: {
        name: "Nam",
        email: process.env.SEED_EMPLOYEE_NAM_EMAIL ?? "nam@gbb.vn",
        passwordHash: employeeNamPasswordHash,
        role: UserRole.CASHIER,
        branchId: branch.id
      }
    }),
    prisma.user.create({
      data: {
        name: "Bich",
        email: process.env.SEED_EMPLOYEE_BICH_EMAIL ?? "bich@gbb.vn",
        passwordHash: employeeBichPasswordHash,
        role: UserRole.CASHIER,
        branchId: branch.id
      }
    }),
    prisma.user.create({
      data: {
        name: "Dan",
        email: process.env.SEED_EMPLOYEE_DAN_EMAIL ?? "dan@gbb.vn",
        passwordHash: employeeDanPasswordHash,
        role: UserRole.CASHIER,
        branchId: branch.id
      }
    })
  ]);

  const [groupRetail, groupVip] = await prisma.$transaction([
    prisma.customerGroup.create({ data: { name: "Khách lẻ" } }),
    prisma.customerGroup.create({ data: { name: "Khách sỉ" } })
  ]);

  const [walkIn, customerA, customerB] = await prisma.$transaction([
    prisma.customer.create({
      data: {
        code: "KH000000",
        name: "Khách lẻ",
        phone: "0000000000",
        address: "",
        groupId: groupRetail.id
      }
    }),
    prisma.customer.create({
      data: {
        code: "KH000045",
        name: "A Việt Hoàng Nam Định (N)",
        phone: "0937377378",
        address: "Nam Định - Huyện Hải Hậu",
        openingDebt: 0,
        receivableDebt: 0,
        totalSpend: 400000,
        groupId: groupVip.id
      }
    }),
    prisma.customer.create({
      data: {
        code: "KH000044",
        name: "A Cường Quảng Nam",
        phone: "0328805186",
        address: "Quảng Nam",
        openingDebt: 150000,
        receivableDebt: 204999,
        totalSpend: 204999,
        groupId: groupVip.id
      }
    })
  ]);

  const suppliers = await prisma.$transaction([
    prisma.supplier.create({
      data: {
        code: "NCC000001",
        name: "Dược phẩm Minh Anh",
        phone: "0911000001",
        address: "Hà Nội",
        openingDebt: 500000,
        payableDebt: 1200000
      }
    }),
    prisma.supplier.create({
      data: {
        code: "NCC000002",
        name: "Công ty Nova Pharma",
        phone: "0911000002",
        address: "Bắc Ninh",
        payableDebt: 0
      }
    })
  ]);

  const [brandA, brandB] = await prisma.$transaction([
    prisma.brand.create({ data: { name: "Rostex", slug: "rostex" } }),
    prisma.brand.create({ data: { name: "Nutriday", slug: "nutriday" } })
  ]);

  const [catWomen, catDrug, catHeart] = await prisma.$transaction([
    prisma.category.create({ data: { name: "TRÁNH THAI - PHỤ KHOA", slug: "tranh-thai-phu-khoa" } }),
    prisma.category.create({ data: { name: "THUỐC", slug: "thuoc" } }),
    prisma.category.create({ data: { name: "TIM MẠCH - HUYẾT ÁP", slug: "tim-mach-huyet-ap" } })
  ]);

  const products = await prisma.$transaction([
    prisma.product.create({
      data: {
        name: "Sadetabs Gramon Uruguay (hộp 12 viên đặt)",
        slug: "sadetabs-gramon-uruguay-hop-12-vien-dat",
        sku: "Q30227032372",
        barcode: "893600100001",
        imageUrl: "https://placehold.co/120x120",
        categoryId: catWomen.id,
        brandId: brandA.id,
        costPrice: 0,
        sellingPrice: 0,
        lowStockAlert: 30,
        status: ProductStatus.ACTIVE
      }
    }),
    prisma.product.create({
      data: {
        name: "Motilium Domperidon Janssen chai 30ml",
        slug: "motilium-domperidon-janssen-chai-30ml",
        sku: "Q302665378",
        barcode: "893600100002",
        imageUrl: "https://placehold.co/120x120",
        categoryId: catDrug.id,
        brandId: brandB.id,
        costPrice: 0,
        sellingPrice: 0,
        lowStockAlert: 20,
        status: ProductStatus.ACTIVE
      }
    }),
    prisma.product.create({
      data: {
        name: "Kavasdin Amlodipine 5mg Khánh Hòa",
        slug: "kavasdin-amlodipine-5mg-khanh-hoa",
        sku: "Q3023052327",
        barcode: "893600100003",
        imageUrl: "https://placehold.co/120x120",
        categoryId: catHeart.id,
        brandId: brandA.id,
        costPrice: 0,
        sellingPrice: 0,
        lowStockAlert: 5,
        status: ProductStatus.ACTIVE
      }
    }),
    prisma.product.create({
      data: {
        name: "Biotin Nutriday Hàn Quốc",
        slug: "biotin-nutriday-han-quoc",
        sku: "SP64856014",
        barcode: "893600100004",
        imageUrl: "https://placehold.co/120x120",
        categoryId: catDrug.id,
        brandId: brandB.id,
        costPrice: 180000,
        sellingPrice: 226000,
        lowStockAlert: 10,
        status: ProductStatus.ACTIVE
      }
    })
  ]);

  for (const [index, product] of products.entries()) {
    await prisma.inventory.create({
      data: {
        branchId: branch.id,
        productId: product.id,
        quantity: [29885, 29745, 1, 80][index] ?? 100,
        reservedQty: 0
      }
    });
  }

  const purchase1 = await prisma.purchaseOrder.create({
    data: {
      code: "PN000001",
      branchId: branch.id,
      supplierId: suppliers[0].id,
      createdById: employeeA.id,
      status: PurchaseStatus.PARTIAL,
      totalAmount: 2700000,
      paidAmount: 1500000,
      debtAmount: 1200000,
      note: "Nhập hàng đầu tháng",
      items: {
        create: [
          {
            productId: products[3].id,
            quantity: 40,
            importPrice: 180000,
            total: 7200000,
            batchNumber: "LO-BIOTIN-0426",
            expiryDate: new Date("2027-04-30")
          },
          {
            productId: products[2].id,
            quantity: 10,
            importPrice: 0,
            total: 0,
            batchNumber: "LO-KAVA-1024",
            expiryDate: new Date("2026-10-31")
          }
        ]
      }
    },
    include: { items: true }
  });

  for (const item of purchase1.items) {
    await prisma.productBatch.create({
      data: {
        branchId: branch.id,
        productId: item.productId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        importPrice: item.importPrice,
        purchaseItemId: item.id
      }
    });
    await prisma.inventoryTransaction.create({
      data: {
        branchId: branch.id,
        productId: item.productId,
        type: StockTxnType.IMPORT,
        quantity: item.quantity,
        referenceCode: purchase1.code,
        createdById: employeeA.id,
        note: `Nhập lô ${item.batchNumber}`
      }
    });
  }

  const order1 = await prisma.order.create({
    data: {
      code: "HD050838",
      branchId: branch.id,
      customerId: customerA.id,
      createdById: employeeB.id,
      status: OrderStatus.COMPLETED,
      subtotal: 400000,
      discountTotal: 0,
      grandTotal: 400000,
      paymentMethod: PaymentMethod.CASH,
      paidAmount: 400000,
      debtAmount: 0,
      note: "",
      items: {
        create: [
          {
            productId: products[1].id,
            quantity: 2,
            unitPrice: 200000,
            costPrice: 150000,
            discountValue: 0,
            total: 400000
          }
        ]
      }
    }
  });

  const order2 = await prisma.order.create({
    data: {
      code: "HD556384",
      branchId: branch.id,
      customerId: customerB.id,
      createdById: employeeB.id,
      status: OrderStatus.PARTIAL,
      subtotal: 204999,
      discountTotal: 0,
      grandTotal: 204999,
      paymentMethod: PaymentMethod.MIXED,
      paidAmount: 0,
      debtAmount: 204999,
      note: "Công nợ khách trả sau",
      items: {
        create: [
          {
            productId: products[3].id,
            quantity: 1,
            unitPrice: 204999,
            costPrice: 180000,
            discountValue: 0,
            total: 204999
          }
        ]
      }
    }
  });

  const order3 = await prisma.order.create({
    data: {
      code: "HD512137",
      branchId: branch.id,
      customerId: walkIn.id,
      createdById: employeeB.id,
      status: OrderStatus.COMPLETED,
      subtotal: 0,
      discountTotal: 0,
      grandTotal: 0,
      paymentMethod: PaymentMethod.CASH,
      paidAmount: 0,
      debtAmount: 0,
      note: "Khách hỏi giá"
    }
  });

  await prisma.cashTransaction.createMany({
    data: [
      {
        code: "PT000001",
        branchId: branch.id,
        type: CashTxnType.RECEIPT,
        amount: 400000,
        customerId: customerA.id,
        orderId: order1.id,
        createdById: employeeB.id,
        note: "Thu đủ hóa đơn HD050838"
      },
      {
        code: "PC000001",
        branchId: branch.id,
        type: CashTxnType.PAYMENT,
        amount: 1500000,
        supplierId: suppliers[0].id,
        purchaseOrderId: purchase1.id,
        createdById: employeeA.id,
        note: "Thanh toán một phần phiếu nhập"
      }
    ]
  });

  await prisma.promotion.create({
    data: {
      name: "Khuyến mãi tháng 4",
      code: "KM-THANG-4",
      type: PromotionType.PERCENT,
      value: 10,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-30"),
      branches: { create: [{ branchId: branch.id }] },
      products: { create: [{ productId: products[3].id }] }
    }
  });

  console.log({
    branch: branch.name,
    users: [ownerHuy.email, ownerHa.email, employeeA.email, employeeB.email],
    customers: 3,
    suppliers: 2,
    products: 4,
    orders: [order1.code, order2.code, order3.code],
    purchaseOrder: purchase1.code
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
