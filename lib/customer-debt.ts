import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseVietnamDateInput } from "@/lib/date-range";

export type CustomerInvoiceHistoryStatus = "all" | "unpaid" | "partial" | "paid";

export type CustomerDebtOverviewItem = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  groupId: string | null;
  openingDebt: number;
  receivableDebt: number;
  unpaidInvoiceCount: number;
  lastInvoiceDate: Date | null;
  lastReceiptDate: Date | null;
};

export type CustomerReceiptItem = {
  id: string;
  code: string;
  createdAt: Date;
  amount: number;
  note: string | null;
  orderId: string | null;
  orderCode: string | null;
  paymentMethodLabel: string;
};

export type CustomerInvoiceItem = {
  id: string;
  code: string;
  createdAt: Date;
  grandTotal: number;
  paidAmount: number;
  debtAmount: number;
  status: string;
  note: string | null;
};

export type CustomerDebtTrackingItem = {
  id: string;
  date: Date;
  type: "INVOICE" | "RECEIPT" | "PREPAYMENT" | "OVERPAYMENT";
  code: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  remainingBalance: number;
  status: string;
  orderId?: string | null;
};

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function getPaymentMethodLabel(paymentMethod: string | null | undefined) {
  if (paymentMethod === "BANK_TRANSFER") return "Chuyển khoản";
  if (paymentMethod === "MIXED") return "Hỗn hợp";
  if (paymentMethod === "CASH") return "Tiền mặt";
  return "Không rõ";
}

export function resolveCustomerHistoryFilters(searchParams?: {
  from?: string;
  to?: string;
  status?: string;
  code?: string;
  history?: string;
}) {
  const status = (searchParams?.status ?? "all") as CustomerInvoiceHistoryStatus;
  const code = searchParams?.code?.trim() ?? "";
  const history = searchParams?.history ?? "";
  const from = searchParams?.from ?? "";
  const to = searchParams?.to ?? "";

  let gte: Date | undefined;
  let lte: Date | undefined;

  if (history !== "all") {
    if (from || to) {
      gte = from ? parseVietnamDateInput(from, false) : undefined;
      lte = to ? parseVietnamDateInput(to, true) : undefined;
    } else {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      gte = start;
    }
  }

  return { status, code, history, from, to, gte, lte };
}

export function buildCustomerInvoiceHistoryWhere(
  customerId: string,
  filters: ReturnType<typeof resolveCustomerHistoryFilters>
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    customerId,
    ...(filters.code
      ? {
          code: {
            contains: filters.code,
            mode: "insensitive"
          }
        }
      : {}),
    ...(filters.gte || filters.lte
      ? {
          createdAt: {
            ...(filters.gte ? { gte: filters.gte } : {}),
            ...(filters.lte ? { lte: filters.lte } : {})
          }
        }
      : {})
  };

  if (filters.status === "unpaid") {
    where.debtAmount = { gt: 0 };
    where.paidAmount = { lte: 0 };
  } else if (filters.status === "partial") {
    where.debtAmount = { gt: 0 };
    where.paidAmount = { gt: 0 };
  } else if (filters.status === "paid") {
    where.debtAmount = { lte: 0 };
  }

  return where;
}

export async function getAllCustomers({
  q,
  page,
  pageSize,
  sort
}: {
  q: string;
  page: number;
  pageSize: number;
  sort: "default" | "debt_desc" | "debt_asc";
}) {
  const startedAt = Date.now();
  const where: Prisma.CustomerWhereInput = {
    NOT: { code: "KH000000" },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sort === "debt_desc"
      ? { receivableDebt: "desc" }
      : sort === "debt_asc"
        ? { receivableDebt: "asc" }
        : { updatedAt: "desc" };

  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      note: true,
      groupId: true,
      openingDebt: true,
      receivableDebt: true
    },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize + 1
  });

  const hasNext = customers.length > pageSize;
  const visibleCustomers = hasNext ? customers.slice(0, pageSize) : customers;
  const customerIds = visibleCustomers.map((customer) => customer.id);

  const [unpaidInvoiceGroups, receiptGroups] = await Promise.all([
    customerIds.length
      ? prisma.order.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            debtAmount: { gt: 0 }
          },
          _count: { _all: true },
          _max: { createdAt: true }
        })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.cashTransaction.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            type: "RECEIPT"
          },
          _max: { createdAt: true }
        })
      : Promise.resolve([])
  ]);

  const unpaidMap = new Map(
    unpaidInvoiceGroups.map((item) => [
      item.customerId ?? "",
      {
        count: item._count._all,
        lastInvoiceDate: item._max.createdAt ?? null
      }
    ])
  );

  const receiptMap = new Map(
    receiptGroups.map((item) => [item.customerId ?? "", item._max.createdAt ?? null])
  );

  const rows: CustomerDebtOverviewItem[] = visibleCustomers.map((customer) => {
    const unpaid = unpaidMap.get(customer.id);
    return {
      ...customer,
      openingDebt: toNumber(customer.openingDebt),
      receivableDebt: toNumber(customer.receivableDebt),
      unpaidInvoiceCount: unpaid?.count ?? 0,
      lastInvoiceDate: unpaid?.lastInvoiceDate ?? null,
      lastReceiptDate: receiptMap.get(customer.id) ?? null
    };
  });

  console.info("[CustomerDebtPerformance][overview]", {
    q,
    page,
    pageSize,
    rowCount: rows.length,
    totalMs: Date.now() - startedAt
  });

  return { rows, hasNext };
}

export async function getCustomerOutstandingDebt(customerId: string) {
  const startedAt = Date.now();
  const [activeInvoices, receipts] = await Promise.all([
    prisma.order.findMany({
      where: {
        customerId,
        debtAmount: { gt: 0 }
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        debtAmount: true,
        status: true,
        note: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.cashTransaction.findMany({
      where: {
        customerId,
        type: "RECEIPT"
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        amount: true,
        note: true,
        orderId: true,
        order: {
          select: {
            code: true,
            paymentMethod: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const normalizedActiveInvoices: CustomerInvoiceItem[] = activeInvoices.map((invoice) => ({
    id: invoice.id,
    code: invoice.code,
    createdAt: invoice.createdAt,
    grandTotal: toNumber(invoice.grandTotal),
    paidAmount: toNumber(invoice.paidAmount),
    debtAmount: toNumber(invoice.debtAmount),
    status: invoice.status,
    note: invoice.note
  }));

  const normalizedReceipts: CustomerReceiptItem[] = receipts.map((receipt) => ({
    id: receipt.id,
    code: receipt.code,
    createdAt: receipt.createdAt,
    amount: toNumber(receipt.amount),
    note: receipt.note,
    orderId: receipt.orderId,
    orderCode: receipt.order?.code ?? null,
    paymentMethodLabel: getPaymentMethodLabel(receipt.order?.paymentMethod)
  }));

  console.info("[CustomerDebtPerformance][outstanding]", {
    customerId,
    activeInvoiceCount: normalizedActiveInvoices.length,
    receiptCount: normalizedReceipts.length,
    totalMs: Date.now() - startedAt
  });

  return {
    activeInvoices: normalizedActiveInvoices,
    receipts: normalizedReceipts
  };
}

export async function getCustomerDebtTracking(customerId: string) {
  const startedAt = Date.now();
  const [invoices, receipts] = await Promise.all([
    prisma.order.findMany({
      where: {
        customerId,
        debtAmount: { gt: 0 }
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        debtAmount: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.cashTransaction.findMany({
      where: {
        customerId,
        type: "RECEIPT",
        orderId: null
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        amount: true,
        note: true
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const entries = [
    ...invoices.map((invoice) => ({
      id: invoice.id,
      date: invoice.createdAt,
      type: "INVOICE" as const,
      code: invoice.code,
      description:
        Number(invoice.paidAmount) > 0
          ? `Hóa đơn thanh toán một phần, còn nợ ${toNumber(invoice.debtAmount).toLocaleString("vi-VN")} đ`
          : "Hóa đơn chưa thanh toán",
      debitAmount: toNumber(invoice.debtAmount),
      creditAmount: 0,
      status: Number(invoice.paidAmount) > 0 ? "Thanh toán một phần" : "Chưa thanh toán",
      orderId: invoice.id
    })),
    ...receipts.map((receipt) => {
      const amount = toNumber(receipt.amount);
      return {
        id: receipt.id,
        date: receipt.createdAt,
        type: "PREPAYMENT" as const,
        code: receipt.code,
        description: receipt.note?.trim() || "Khách trả trước / chưa gắn hóa đơn",
        debitAmount: 0,
        creditAmount: amount,
        status: "Khách trả trước",
        orderId: null
      };
    })
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  const rows: CustomerDebtTrackingItem[] = entries.map((entry) => {
    runningBalance += entry.debitAmount - entry.creditAmount;
    const normalizedType =
      entry.type === "PREPAYMENT" && runningBalance < 0
        ? "OVERPAYMENT"
        : entry.type;

    return {
      id: entry.id,
      date: entry.date,
      type: normalizedType,
      code: entry.code,
      description: entry.description,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      remainingBalance: runningBalance,
      status:
        normalizedType === "OVERPAYMENT"
          ? "Khách trả dư"
          : normalizedType === "PREPAYMENT"
            ? "Khách trả trước"
            : entry.status,
      orderId: entry.orderId
    };
  });

  console.info("[CustomerDebtPerformance][tracking]", {
    customerId,
    rowCount: rows.length,
    totalMs: Date.now() - startedAt
  });

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function getCustomerInvoiceHistory(customerId: string, filters: ReturnType<typeof resolveCustomerHistoryFilters>) {
  const startedAt = Date.now();
  const invoiceHistory = await prisma.order.findMany({
    where: buildCustomerInvoiceHistoryWhere(customerId, filters),
    select: {
      id: true,
      code: true,
      createdAt: true,
      grandTotal: true,
      paidAmount: true,
      debtAmount: true,
      status: true,
      note: true
    },
    orderBy: { createdAt: "desc" }
  });

  const normalizedInvoiceHistory: CustomerInvoiceItem[] = invoiceHistory.map((invoice) => ({
    id: invoice.id,
    code: invoice.code,
    createdAt: invoice.createdAt,
    grandTotal: toNumber(invoice.grandTotal),
    paidAmount: toNumber(invoice.paidAmount),
    debtAmount: toNumber(invoice.debtAmount),
    status: invoice.status,
    note: invoice.note
  }));

  console.info("[CustomerDebtPerformance][history]", {
    customerId,
    historyCount: normalizedInvoiceHistory.length,
    totalMs: Date.now() - startedAt
  });

  return normalizedInvoiceHistory;
}

export async function getCustomerDebtDetail(customerId: string, filters: ReturnType<typeof resolveCustomerHistoryFilters>) {
  const startedAt = Date.now();
  const [customer, outstanding, trackingRows, invoiceHistory] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId }
    }),
    getCustomerOutstandingDebt(customerId),
    getCustomerDebtTracking(customerId),
    getCustomerInvoiceHistory(customerId, filters)
  ]);

  console.info("[CustomerDebtPerformance][detail]", {
    customerId,
    activeInvoiceCount: outstanding.activeInvoices.length,
    receiptCount: outstanding.receipts.length,
    trackingCount: trackingRows.length,
    historyCount: invoiceHistory.length,
    totalMs: Date.now() - startedAt
  });

  return {
    customer,
    activeInvoices: outstanding.activeInvoices,
    receipts: outstanding.receipts,
    trackingRows,
    invoiceHistory
  };
}
