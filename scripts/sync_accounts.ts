import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const branch =
    (await prisma.branch.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    })) ??
    (await prisma.branch.create({
      data: {
        code: "Q302",
        name: "AAAHHH",
        address: "Thanh Xuân, Hà Nội",
        phone: "0918377022"
      }
    }));

  await prisma.branch.update({
    where: { id: branch.id },
    data: { name: "AAAHHH" }
  });

  const accounts = [
    {
      name: "Huy",
      email: "huy@gbb.vn",
      password: "huy2005",
      role: UserRole.ADMIN,
      legacyEmails: ["huyha@gbb.vn", "sep@soban.vn", "admin@soban.vn"]
    },
    {
      name: "Hà",
      email: "ha@gbb.vn",
      password: "ha2005",
      role: UserRole.ADMIN,
      legacyEmails: []
    },
    {
      name: "Nam",
      email: "nam@gbb.vn",
      password: "nam",
      role: UserRole.CASHIER,
      legacyEmails: ["a@soban.vn", "manager@soban.vn"]
    },
    {
      name: "Bich",
      email: "bich@gbb.vn",
      password: "bich",
      role: UserRole.CASHIER,
      legacyEmails: ["b@soban.vn", "cashier@soban.vn"]
    }
  ];

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const existing =
      (await prisma.user.findUnique({ where: { email: account.email } })) ??
      (await prisma.user.findFirst({
        where: { email: { in: account.legacyEmails } }
      }));

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: account.name,
          email: account.email,
          passwordHash,
          role: account.role,
          isActive: true,
          branchId: branch.id
        }
      });
      continue;
    }

    await prisma.user.create({
      data: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        branchId: branch.id,
        isActive: true
      }
    });
  }

  const staleBossEmails = ["huyha@gbb.vn"];
  await prisma.user.updateMany({
    where: {
      email: { in: staleBossEmails },
      NOT: { email: { in: accounts.map((account) => account.email) } }
    },
    data: {
      isActive: false
    }
  });

  console.log("Đã đồng bộ 4 tài khoản: huy@gbb.vn, ha@gbb.vn, nam@gbb.vn, bich@gbb.vn");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
