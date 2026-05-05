import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@gmail.com';
  const plainPassword = 'admin';

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      console.log('Tài khoản đã tồn tại.');
      return;
    }

    const passwordHash = await bcrypt.hash(plainPassword, 10);
    
    // Find the first branch to associate with the user, or leave it null if no branch exists.
    const branch = await prisma.branch.findFirst();

    const user = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        branchId: branch?.id || null,
      },
    });

    console.log('Đã tạo tài khoản thành công:');
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${plainPassword}`);
  } catch (error) {
    console.error('Lỗi khi tạo tài khoản:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
