import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { requireApiSession } from "@/lib/auth";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN"]);

    const body = (await request.json()) as {
      passphrase?: string;
      targetDir?: string;
    };

    const passphrase = body.passphrase?.trim() ?? "";
    const rawTargetDir = body.targetDir?.trim() || path.join(os.homedir(), "Desktop", "SoBanRetailBackup");
    const targetDir =
      rawTargetDir === "~"
        ? os.homedir()
        : rawTargetDir.startsWith("~/")
          ? path.join(os.homedir(), rawTargetDir.slice(2))
          : rawTargetDir;

    if (passphrase.length < 4) {
      return NextResponse.json({ error: "Mật khẩu mã hóa phải có ít nhất 4 ký tự." }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), "scripts", "backup_database.sh");
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath, targetDir], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BACKUP_PASSPHRASE: passphrase
      }
    });

    const output = `${stdout}\n${stderr}`.trim();
    const createdPath =
      output
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("Đã tạo backup mã hóa:"))
        ?.replace("Đã tạo backup mã hóa:", "")
        .trim() ?? "";

    return NextResponse.json({
      success: true,
      path: createdPath,
      message: createdPath ? `Đã tạo backup: ${createdPath}` : "Đã tạo backup dữ liệu."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể sao lưu dữ liệu";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
