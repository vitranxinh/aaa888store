import { eachDayOfInterval, format } from "date-fns";
import { resolveVietnamDateRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";

export type DashboardRange = "today" | "7d" | "30d" | "month";

function resolveRange(range: DashboardRange) {
  const resolved = resolveVietnamDateRange(range);
  return {
    start: resolved?.gte ?? new Date(),
    end: resolved?.lte ?? new Date()
  };
}

export async function getDashboardData(branchId: string | undefined, range: DashboardRange = "today") {
  const { start, end } = resolveRange(range);
  const branchWhere = branchId ? { branchId } : {};
  const customerWhere = {
    NOT: { code: "KH000000" }
  };

  const [customerCount, productCount, invoiceCount, periodOrders, lowStockCount, recentOrders] = await Promise.all([
    prisma.customer.count({ where: customerWhere }),
    prisma.product.count(),
    prisma.order.count({
      where: {
        ...branchWhere,
        createdAt: { gte: start, lte: end }
      }
    }),
    prisma.order.findMany({
      where: {
        ...branchWhere,
        createdAt: { gte: start, lte: end },
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      select: {
        createdAt: true,
        grandTotal: true,
        debtAmount: true
      }
    }),
    prisma.inventory.count({
      where: {
        ...branchWhere,
        product: {
          lowStockAlert: {
            gte: 0
          }
        }
      }
    }),
    prisma.order.findMany({
      where: branchWhere,
      select: {
        id: true,
        code: true,
        grandTotal: true,
        paidAmount: true,
        customer: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 6
    })
  ]);

  const revenue = periodOrders.reduce((sum, order) => sum + Number(order.grandTotal), 0);
  const debt = periodOrders.reduce((sum, order) => sum + Number(order.debtAmount), 0);

  const intervalDays = eachDayOfInterval({ start, end });
  const revenueByDayMap = periodOrders.reduce<Map<string, number>>((map, order) => {
    const dayKey = format(order.createdAt, "yyyy-MM-dd");
    map.set(dayKey, (map.get(dayKey) ?? 0) + Number(order.grandTotal));
    return map;
  }, new Map());
  const revenueByPeriod = intervalDays.map((date) => {
    const dayKey = format(date, "yyyy-MM-dd");
    return {
      label: format(date, "dd/MM"),
      revenue: revenueByDayMap.get(dayKey) ?? 0
    };
  });

  return {
    range,
    customerCount,
    productCount,
    invoiceCount,
    revenue,
    debt,
    lowStockCount,
    revenueByPeriod,
    recentOrders
  };
}

export async function getPosData(branchId?: string) {
  const [branches, customers, products, promotions] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: {
        category: true,
        inventories: { where: branchId ? { branchId } : undefined },
        batches: { where: branchId ? { branchId } : undefined, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] }
      },
      orderBy: { updatedAt: "desc" },
      take: 300
    }),
    prisma.promotion.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branches: { some: { branchId } } } : {}),
      },
      orderBy: { startDate: "desc" },
      take: 20,
    })
  ]);

  return {
    branches,
    customers,
    promotions: promotions.map((promotion) => ({
      ...promotion,
      value: Number(promotion.value)
    })),
    products: products.map((product) => ({
      ...product,
      sellingPrice: Number(product.sellingPrice),
      costPrice: Number(product.costPrice)
    }))
  };
}
