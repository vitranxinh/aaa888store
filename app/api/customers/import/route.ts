import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const contentType = request.headers.get("content-type") || "";
    let xlsxPath = "/Users/vitran/Downloads/302.xlsx";
    let uploadedPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (file instanceof File && file.size > 0) {
        const safeName = basename(file.name || "customers.xlsx").replace(/\s+/g, "-");
        uploadedPath = join(tmpdir(), `${Date.now()}-${safeName}`);
        const bytes = Buffer.from(await file.arrayBuffer());
        await writeFile(uploadedPath, bytes);
        xlsxPath = uploadedPath;
      } else {
        const incomingPath = String(formData.get("xlsxPath") || "").trim();
        if (incomingPath) {
          xlsxPath = incomingPath;
        }
      }
    } else {
      const body = (await request.json()) as { xlsxPath?: string };
      xlsxPath = body.xlsxPath?.trim() || xlsxPath;
    }

    try {
      const { stdout } = await execFileAsync("python3", ["scripts/import_customers_from_xlsx.py", xlsxPath], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });

      const parsed = JSON.parse(stdout) as {
        source: string;
        count: number;
        customers: Array<{
          code: string;
          name: string;
          phone: string;
          address: string;
          note: string;
          openingDebt: number;
        }>;
      };

      const imported = await prisma.$transaction(async (tx) => {
        let total = 0;

        for (const item of parsed.customers) {
          if (!item.code || !item.name) {
            continue;
          }

          const normalizedPhone = item.phone.trim() || `NO-PHONE-${item.code}`;

          const existingByCode = await tx.customer.findUnique({
            where: { code: item.code },
            select: { id: true, code: true },
          });

          const existingByPhone = normalizedPhone.startsWith("NO-PHONE-")
            ? null
            : await tx.customer.findFirst({
                where: { phone: normalizedPhone },
                select: { id: true, code: true },
              });

          const targetId = existingByCode?.id ?? existingByPhone?.id ?? null;

          if (targetId) {
            await tx.customer.update({
              where: { id: targetId },
              data: {
                code: item.code,
                name: item.name,
                phone: normalizedPhone,
                address: item.address || null,
                note: item.note || null,
                openingDebt: 0,
              },
            });
          } else {
            await tx.customer.create({
              data: {
                code: item.code,
                name: item.name,
                phone: normalizedPhone,
                address: item.address || null,
                note: item.note || null,
                openingDebt: 0,
                receivableDebt: 0,
              },
            });
          }

          total += 1;
        }

        return total;
      });

      return NextResponse.json({
        ok: true,
        imported,
        source: parsed.source,
      });
    } finally {
      if (uploadedPath) {
        await unlink(uploadedPath).catch(() => null);
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể import khách hàng từ Excel" },
      { status: 500 }
    );
  }
}
