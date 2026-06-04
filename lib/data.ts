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
  const startedAt = Date.now();
  const { start, end } = resolveRange(range);
  const branchWhere = branchId ? { branchId } : {};
  const customerWhere = {
    NOT: { code: "KH000000" }
  };
  const summaryStartedAt = Date.now();
  let customerCount = 0;
  let productCount = 0;
  let outStockCount = 0;
  let lowStockCount = 0;
  let invoiceCount = 0;
  let revenue = 0;
  let debt = 0;
  let chartOrders: Array<{ createdAt: Date; grandTotal: Prisma.Decimal }> = [];

  try {
    const [
      countedCustomers,
      countedProducts,
      aggregatedOrders,
      stockProducts,
      fetchedChartOrders
    ] = await prisma.$transaction([
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
      prisma.product.findMany({
        where: {
          status: "ACTIVE"
        },
        select: {
          lowStockAlert: true,
          inventories: {
            where: {
              ...(branchId ? { branchId } : {}),
              variantId: null
            },
            select: { quantity: true }
          }
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
          grandTotal: true
        }
      })
    ]);

    customerCount = countedCustomers;
    productCount = countedProducts;
    outStockCount = stockProducts.filter((product) => {
      const currentStock = product.inventories.reduce((sum, inventory) => sum + inventory.quantity, 0);
      return currentStock <= 0;
    }).length;
    lowStockCount = stockProducts.filter((product) => {
      const currentStock = product.inventories.reduce((sum, inventory) => sum + inventory.quantity, 0);
      return currentStock > 0 && currentStock <= product.lowStockAlert;
    }).length;
    invoiceCount = aggregatedOrders._count.id;
    revenue = Number(aggregatedOrders._sum.grandTotal ?? 0);
    debt = Number(aggregatedOrders._sum.debtAmount ?? 0);
    chartOrders = fetchedChartOrders;
  } catch (error) {
    console.error("[DashboardPerformance]", {
      phase: "summary",
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - summaryStartedAt
    });
  }

  console.info("[DashboardPerformance]", {
    phase: "summary",
    durationMs: Date.now() - summaryStartedAt,
    customerCount,
    productCount,
    outStockCount,
    invoiceCount
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

  const result = {
    range,
    customerCount,
    productCount,
    outStockCount,
    invoiceCount,
    revenue,
    debt,
    lowStockCount,
    revenueByPeriod
  };

  console.info("[DashboardPerformance]", {
    phase: "full-request",
    durationMs: Date.now() - startedAt,
    range,
    branchId: branchId ?? "all"
  });

  return result;
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
