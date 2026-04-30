import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function generateUniqueBrandSlug(name: string) {
  const baseSlug = slugify(name) || `brand-${Date.now()}`;

  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existing = await prisma.brand.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  return `${baseSlug}-${Date.now()}`;
}

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() ?? "";

    if (name.length < 2) {
      return NextResponse.json({ error: "Tên thương hiệu phải có ít nhất 2 ký tự." }, { status: 400 });
    }

    const existing = await prisma.brand.findFirst({
      where: { name: { equals: name, mode: "insensitive" } }
    });
    if (existing) {
      return NextResponse.json(existing);
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        slug: await generateUniqueBrandSlug(name)
      }
    });

    return NextResponse.json(brand);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
