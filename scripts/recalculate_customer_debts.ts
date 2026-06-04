import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function calculateCustomerDebt(customerId: string, openingDebt: Prisma.Decimal | number | null) {
  const [orderAggregate, standaloneReceiptAggregate, customerPaymentAggregate] = await Promise.all([
    prisma.order.aggregate({
      where: {
        customerId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      _sum: { grandTotal: true, paidAmount: true }
    }),
    prisma.cashTransaction.aggregate({
      where: {
        customerId,
        type: "RECEIPT",
        orderId: null
      },
      _sum: { amount: true }
    }),
    prisma.cashTransaction.aggregate({
      where: {
        customerId,
        type: "PAYMENT"
      },
      _sum: { amount: true }
    })
  ]);

  return (
    Number(openingDebt ?? 0) +
    Number(orderAggregate._sum.grandTotal ?? 0) -
    Number(orderAggregate._sum.paidAmount ?? 0) +
    Number(customerPaymentAggregate._sum.amount ?? 0) -
    Number(standaloneReceiptAggregate._sum.amount ?? 0)
  );
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
