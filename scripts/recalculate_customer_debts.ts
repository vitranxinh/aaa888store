import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function calculateCustomerDebt(customerId: string, openingDebt: Prisma.Decimal | number | null) {
  const [orders, standaloneCashTransactions] = await Promise.all([
    prisma.order.findMany({
      where: {
        customerId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      select: {
        id: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        oldDebtAmount: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.cashTransaction.findMany({
      where: {
        customerId,
        orderId: null,
        type: { in: ["RECEIPT", "PAYMENT"] }
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        amount: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  const events = [
    ...orders.map((order) => ({
      kind: "ORDER" as const,
      id: order.id,
      createdAt: order.createdAt,
      grandTotal: Number(order.grandTotal ?? 0),
      paidAmount: Number(order.paidAmount ?? 0),
      oldDebtAmount: Number(order.oldDebtAmount ?? 0)
    })),
    ...standaloneCashTransactions.map((txn) => ({
      kind: "CASH" as const,
      id: txn.id,
      createdAt: txn.createdAt,
      type: txn.type,
      amount: Number(txn.amount ?? 0)
    }))
  ].sort((a, b) => {
    const timeDelta = a.createdAt.getTime() - b.createdAt.getTime();
    return timeDelta !== 0 ? timeDelta : a.id.localeCompare(b.id);
  });

  let debt = Number(openingDebt ?? 0);
  for (const event of events) {
    if (event.kind === "ORDER") {
      if (event.oldDebtAmount > 0) {
        debt = Math.max(debt, event.oldDebtAmount);
      }
      debt += event.grandTotal - event.paidAmount;
    } else if (event.type === "RECEIPT") {
      debt -= event.amount;
    } else if (event.type === "PAYMENT") {
      debt += event.amount;
    }
  }

  return debt;
}

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      openingDebt: true,
      receivableDebt: true
    },
    orderBy: { code: "asc" }
  });

  let changed = 0;
  let totalDelta = 0;
  const changedSamples: Array<{
    code: string;
    name: string;
    before: number;
    after: number;
    delta: number;
  }> = [];

  for (const customer of customers) {
    const expectedDebt = await calculateCustomerDebt(customer.id, customer.openingDebt);
    const currentDebt = Number(customer.receivableDebt ?? 0);
    const delta = expectedDebt - currentDebt;

    if (Math.abs(delta) < 0.5) continue;

    changed += 1;
    totalDelta += delta;
    if (changedSamples.length < 20) {
      changedSamples.push({
        code: customer.code,
        name: customer.name,
        before: currentDebt,
        after: expectedDebt,
        delta
      });
    }

    if (!isDryRun) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { receivableDebt: new Prisma.Decimal(expectedDebt) }
      });
    }
  }

  console.log(JSON.stringify({
    dryRun: isDryRun,
    customersChecked: customers.length,
    customersChanged: changed,
    totalDelta,
    samples: changedSamples
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
