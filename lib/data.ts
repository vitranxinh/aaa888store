import { unstable_cache } from "next/cache";
import { eachDayOfInterval, format } from "date-fns";
import type { Prisma } from "@prisma/client";
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

async function fetchDashboardData(branchId: string | undefined, range: DashboardRange = "today") {
  const { start, end } = resolveRange(range);
  const branchWhere = branchId ? { branchId } : {};
  const customerWhere = {
    NOT: { code: "KH000000" }
  };

  const [
    customerCount,
    productCount,
    orderAggregate,
    lowStockCount,
    recentOrders
  ] = await Promise.all([
    prisma.customer.count({ where: customerWhere }),
    prisma.product.count(),
    prisma.order.aggregate({
      where: {
        ...branchWhere,
        createdAt: { gte: start, lte: end },
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      _sum: {
        grandTotal: true,
        debtAmount: true
      },
      _count: {
        id: true
      }
    }),
    prisma.inventory.count({
      where: {
        ...branchWhere,
        product: {
          lowStockAlert: { gte: 0 }
        },
        quantity: { lte: 0 } // Assuming low stock means <= 0 or below alert
      }
    }),
    prisma.order.findMany({
      where: branchWhere,
      select: {
        id: true,
        code: true,
        grandTotal: true,
        paidAmount: true,
        customer: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 6
    })
  ]);

  const revenue = Number(orderAggregate._sum.grandTotal ?? 0);
  const debt = Number(orderAggregate._sum.debtAmount ?? 0);
  const invoiceCount = orderAggregate._count.id;

  // For the chart, we still need the individual order totals within the period
  // but we only fetch what's needed for the chart.
  const chartOrders = await prisma.order.findMany({
    where: {
      ...branchWhere,
      createdAt: { gte: start, lte: end },
      status: { in: ["COMPLETED", "PARTIAL"] }
    },
    select: {
      createdAt: true,
      grandTotal: true
    }
  });

  const intervalDays = eachDayOfInterval({ start, end });
  const revenueByDayMap = chartOrders.reduce<Map<string, number>>((map: Map<string, number>, order: { createdAt: Date; grandTotal: Prisma.Decimal }) => {
    const dayKey = format(order.createdAt, "yyyy-MM-dd");
    map.set(dayKey, (map.get(dayKey) ?? 0) + Number(order.grandTotal));
    return map;
  }, new Map());

  const revenueByPeriod = intervalDays.map((date: Date) => {
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

export async function getDashboardData(branchId: string | undefined, range: DashboardRange = "today") {
  return unstable_cache(
    () => fetchDashboardData(branchId, range),
    ["dashboard-data", branchId ?? "all", range],
    { revalidate: 30 }
  )();
}

async function fetchPosData(branchId?: string) {
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
      take: 500
    }),
    prisma.promotion.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branches: { some: { branchId } } } : {}),
      },
      orderBy: { startDate: "desc" },
      take: 50,
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

export async function getPosData(branchId?: string) {
  return unstable_cache(
    () => fetchPosData(branchId),
    ["pos-data", branchId ?? "all"],
    { revalidate: 60, tags: ["pos-data"] }
  )();
}
