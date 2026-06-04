"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type DraftRow = {
  id: string;
  customerName: string;
  branchName: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

type ApiDraft = {
  id: string;
  createdAt: string;
  updatedAt: string;
  customer?: { name: string } | null;
  branch?: { name: string } | null;
  user?: { name: string } | null;
  draftData?: { customerQuery?: string } | null;
};

export function OrderDraftsListClient({
  initialDrafts,
  refreshUrl
}: {
  initialDrafts: DraftRow[];
  refreshUrl: string;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  const refreshDrafts = useCallback(async () => {
    try {
      const response = await fetch(refreshUrl, {
        credentials: "same-origin"
      });
      if (!response.ok) return;
      const payload = (await response.json()) as ApiDraft[];
      setDrafts(
        payload.map((draft) => ({
          id: draft.id,
          customerName: draft.customer?.name ?? draft.draftData?.customerQuery ?? "Chưa chọn khách",
          branchName: draft.branch?.name ?? "-",
          createdByName: draft.user?.name ?? "-",
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt
        }))
      );
    } catch {
      // Draft refresh is non-critical; the route refresh will still catch up.
    }
  }, [refreshUrl]);

  useEffect(() => {
    const handler = () => {
      void refreshDrafts();
    };
    window.addEventListener("order-draft:saved", handler);
    return () => window.removeEventListener("order-draft:saved", handler);
  }, [refreshDrafts]);

  function openDraft(draftId: string) {
    window.dispatchEvent(new CustomEvent("order-draft:open", { detail: { draftId } }));
  }

  function deleteDraft(draftId: string) {
    startTransition(async () => {
      const previousDrafts = drafts;
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      try {
        const response = await fetch(`/api/order-drafts/${draftId}`, {
          method: "DELETE",
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setDrafts(previousDrafts);
          pushToast({
            title: "Không thể xóa bản nháp",
            description: payload.error ?? "Vui lòng thử lại",
            variant: "error"
          });
          return;
        }

        pushToast({ title: "Đã xóa bản nháp" });
        window.dispatchEvent(new Event("order-draft:saved"));
      } catch (error) {
        setDrafts(previousDrafts);
        pushToast({
          title: "Không thể xóa bản nháp",
          description: error instanceof Error ? error.message : "Lỗi mạng, vui lòng thử lại",
          variant: "error"
        });
      }
    });
  }

  if (drafts.length === 0) return <div className="hidden" data-order-drafts-list="empty" />;

  return (
    <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-soft sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Hóa đơn nháp</h2>
          <p className="text-sm text-slate-600 sm:text-base">Bản nháp hóa đơn chưa hoàn tất, có thể mở lại để tiếp tục.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-700">{drafts.length} bản nháp</span>
      </div>

      <div className="mt-4 grid gap-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-emerald-100 bg-white p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">{draft.id.slice(0, 8).toUpperCase()}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Bản nháp</span>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                  <p>Khách: <span className="font-semibold text-slate-900">{draft.customerName}</span></p>
                  <p>Chi nhánh: {draft.branchName}</p>
                  <p>Người tạo: {draft.createdByName}</p>
                  <p>Ngày tạo: {new Date(draft.createdAt).toLocaleString("vi-VN")}</p>
                  <p>Cập nhật: {new Date(draft.updatedAt).toLocaleString("vi-VN")}</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:w-56">
                <Button type="button" className="h-10" onClick={() => openDraft(draft.id)}>
                  Tiếp tục sửa
                </Button>
                <Button type="button" variant="outline" className="h-10" onClick={() => deleteDraft(draft.id)} loading={isPending}>
                  Xóa
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
