import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function getCustomerGroupOptions() {
  return unstable_cache(
    async () =>
      prisma.customerGroup.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
    ["customer-groups"],
    { revalidate: 300 }
  )();
}

export async function getCategoryOptions() {
  return unstable_cache(
    async () =>
      prisma.category.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
    ["categories"],
    { revalidate: 300 }
  )();
}

export async function getBrandOptions() {
  return unstable_cache(
    async () =>
      prisma.brand.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
    ["brands"],
    { revalidate: 300 }
  )();
}

export async function getDefaultBranchId() {
  const branch = await unstable_cache(
    async () =>
      prisma.branch.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true }
      }),
    ["default-branch-id"],
    { revalidate: 300 }
  )();

  return branch?.id ?? "";
}
