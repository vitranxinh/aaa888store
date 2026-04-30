import { endOfDay, format, startOfDay, startOfMonth, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export type DashboardRange = "today" | "7d" | "30d" | "month";

function resolveRange(range: DashboardRange) {
  const now = new Date();
  switch (range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "month":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "7d":
    default:
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  }
}

export async function getDashboardData(branchId: string | undefined, range: DashboardRange = "today") {
  const { start, end } = resolveRange(range);
  const branchWhere = branchId ? { branchId } : {};

  const [customerCount, productCount, orders, lowStock, recentOrders] = await Promise.all([
    prisma.customer.count(),
    prisma.product.count(),
    prisma.order.findMany({
      where: {
        ...branchWhere,
        createdAt: { gte: start, lte: end },
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      include: { customer: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.inventory.findMany({
      where: { ...branchWhere },
      include: { product: true, branch: true }
    }),
    prisma.order.findMany({
      where: branchWhere,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const revenue = orders.reduce((sum, order) => sum + Number(order.grandTotal), 0);
  const debt = orders.reduce((sum, order) => sum + Number(order.debtAmount), 0);
  const lowStockCount = lowStock.filter((item) => item.product && item.quantity <= item.product.lowStockAlert).length;

  const chartDays = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 12;
  const revenueByPeriod = await Promise.all(
    Array.from({ length: chartDays }).map(async (_, index) => {
      const date = subDays(end, chartDays - index - 1);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const aggregate = await prisma.order.aggregate({
        where: {
          ...branchWhere,
          createdAt: { gte: dayStart, lte: dayEnd },
          status: { in: ["COMPLETED", "PARTIAL"] }
        },
        _sum: { grandTotal: true }
      });
      return {
        label: format(date, "dd/MM"),
        revenue: Number(aggregate._sum.grandTotal ?? 0)
      };
    })
  );

  return {
    range,
    customerCount,
    productCount,
    invoiceCount: recentOrders.length,
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
        ...(branchId ? { branches: { some: { branchId } } } : {})
      },
      orderBy: { updatedAt: "desc" },
      take: 20
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
