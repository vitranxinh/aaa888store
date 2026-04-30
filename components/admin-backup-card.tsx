"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToastStore } from "@/store/toast-store";

export function AdminBackupCard() {
  const pushToast = useToastStore((state) => state.push);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [targetDir, setTargetDir] = useState("~/Desktop/SoBanRetailBackup");
  const [latestPath, setLatestPath] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitBackup() {
    const trimmedPassphrase = passphrase.trim();
    const trimmedConfirmPassphrase = confirmPassphrase.trim();
    const trimmedTargetDir = targetDir.trim();

    if (trimmedPassphrase.length < 4) {
      pushToast({
        title: "Không thể sao lưu",
        description: "Mật khẩu mã hóa phải có ít nhất 4 ký tự.",
        variant: "error"
      });
      return;
    }

    if (trimmedPassphrase !== trimmedConfirmPassphrase) {
      pushToast({
        title: "Không thể sao lưu",
        description: "Mật khẩu xác nhận không khớp.",
        variant: "error"
      });
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passphrase: trimmedPassphrase,
          targetDir: trimmedTargetDir
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        pushToast({
          title: "Không thể sao lưu",
          description: payload.error || "Không thể sao lưu dữ liệu.",
          variant: "error"
        });
        return;
      }

      setLatestPath(payload.path || "");
      setPassphrase("");
      setConfirmPassphrase("");
      pushToast({
        title: "Đã sao lưu dữ liệu",
        description: payload.message
      });
    });
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-slate-900">Sao lưu dữ liệu</h3>
      <p className="mt-2 text-sm text-slate-500">
        Chỉ tài khoản sếp mới thấy mục này. Backup sẽ tạo file mã hóa `.dump.enc` để khôi phục khi lỡ xóa nhầm.
      </p>

      <div className="mt-4 grid gap-4">
        <label className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">Thư mục lưu backup</span>
          <input
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
            className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm text-slate-900 outline-none"
            placeholder="~/Desktop/SoBanRetailBackup"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">Mật khẩu mã hóa</span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm text-slate-900 outline-none"
              placeholder="Nhập mật khẩu backup"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">Nhập lại mật khẩu</span>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-300 px-4 text-sm text-slate-900 outline-none"
              placeholder="Nhập lại mật khẩu"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button className="h-11 rounded-2xl px-5 text-sm font-semibold" onClick={submitBackup} disabled={isPending}>
            {isPending ? "Đang sao lưu..." : "Sao lưu dữ liệu"}
          </Button>
          {latestPath ? <p className="text-sm text-slate-500 break-all">{latestPath}</p> : null}
        </div>
      </div>
    </Card>
  );
}
