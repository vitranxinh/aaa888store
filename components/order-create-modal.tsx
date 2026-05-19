"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { useToastStore } from "@/store/toast-store";

type Props = {
  branchId: string;
};

type ProductSuggestion = {
  id: string;
  label: string;
  sellingPrice: number;
  currentStock: number;
  meta?: string;
};

type OrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountValue: number;
};

type OrderDraftData = {
  customerId: string;
  customerQuery: string;
  productQuery: string;
  note: string;
  otherCharge: number;
  paidAmount: number;
  paymentTouched: boolean;
  lines: OrderLine[];
};

type OrderDraft = {
  id: string;
  customerId: string | null;
  draftData: OrderDraftData;
  updatedAt: string;
  customer?: { id: string; name: string; phone: string } | null;
};

export function OrderCreateModal({ branchId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; label: string; meta?: string }>>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductSuggestion[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [note, setNote] = useState("");
  const [otherCharge, setOtherCharge] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [restoreDraft, setRestoreDraft] = useState<OrderDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const suppressAutosaveRef = useRef(false);
  const pushToast = useToastStore((state) => state.push);

  const merchandiseTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines]);
  const orderTotal = useMemo(() => merchandiseTotal + otherCharge, [merchandiseTotal, otherCharge]);

  const resetForm = useCallback(() => {
    setCustomerId("");
    setCustomerQuery("");
    setCustomerResults([]);
    setProductQuery("");
    setProductResults([]);
    setNote("");
    setOtherCharge(0);
    setPaidAmount(0);
    setPaymentTouched(false);
    setLines([]);
    setDraftId(null);
    setRestoreDraft(null);
    setSaveStatus("idle");
    setLastSavedAt(null);
    setHasUnsavedChanges(false);
  }, []);

  const buildDraftData = useCallback((): OrderDraftData => ({
    customerId,
    customerQuery,
    productQuery,
    note,
    otherCharge,
    paidAmount,
    paymentTouched,
    lines
  }), [customerId, customerQuery, productQuery, note, otherCharge, paidAmount, paymentTouched, lines]);

  const hasDraftContent = useCallback((data: OrderDraftData) => (
    Boolean(data.customerId || data.customerQuery.trim() || data.productQuery.trim() || data.note.trim() || data.otherCharge > 0 || data.paidAmount > 0 || data.lines.length > 0)
  ), []);

  const applyDraftData = useCallback((draft: OrderDraft) => {
    const data = draft.draftData;
    suppressAutosaveRef.current = true;
    setDraftId(draft.id);
    setCustomerId(data.customerId ?? draft.customerId ?? "");
    setCustomerQuery(data.customerQuery ?? draft.customer?.name ?? "");
    setProductQuery(data.productQuery ?? "");
    setProductResults([]);
    setNote(data.note ?? "");
    setOtherCharge(Number(data.otherCharge ?? 0));
    setPaidAmount(Number(data.paidAmount ?? 0));
    setPaymentTouched(Boolean(data.paymentTouched));
    setLines(Array.isArray(data.lines) ? data.lines : []);
    setSaveStatus("saved");
    setLastSavedAt(draft.updatedAt);
    setHasUnsavedChanges(false);
    window.setTimeout(() => {
      suppressAutosaveRef.current = false;
    }, 0);
  }, []);

  async function loadLatestDraft() {
    try {
      const response = await fetch(`/api/order-drafts?latest=1&branchId=${encodeURIComponent(branchId)}`, {
        credentials: "same-origin"
      });
      if (!response.ok) return;
      const draft = (await response.json()) as OrderDraft | null;
      if (draft?.id) {
        setRestoreDraft(draft);
      }
    } catch {
      setRestoreDraft(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    suppressAutosaveRef.current = true;
    resetForm();
    void loadLatestDraft().finally(() => {
      window.setTimeout(() => {
        suppressAutosaveRef.current = false;
      }, 0);
    });
  }, [open, resetForm]);

  useEffect(() => {
    if (!paymentTouched) {
      setPaidAmount(orderTotal);
    }
  }, [orderTotal, paymentTouched]);

  const saveDraft = useCallback(async (manual = false) => {
    const data = buildDraftData();
    if (!hasDraftContent(data)) {
      if (manual) {
        pushToast({ title: "Chưa có dữ liệu để lưu nháp", description: "Hãy nhập khách hàng hoặc sản phẩm trước khi lưu." });
      }
      return null;
    }

    setSaveStatus("saving");
    setIsSavingDraft(true);
    try {
      const response = await fetch("/api/order-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: draftId,
          branchId,
          customerId: data.customerId || null,
          draftData: data
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Không thể lưu nháp");
      }

      setDraftId(payload.id);
      setSaveStatus("saved");
      setLastSavedAt(payload.updatedAt);
      setHasUnsavedChanges(false);
      if (manual) {
        pushToast({ title: "Đã lưu bản nháp", description: "Bạn có thể mở lại và tiếp tục tạo hóa đơn sau." });
      }
      return payload as OrderDraft;
    } catch (error) {
      setSaveStatus("error");
      if (manual) {
        pushToast({
          title: "Không thể lưu nháp",
          description: error instanceof Error ? error.message : "Lỗi mạng hoặc phiên đăng nhập đã hết hạn",
          variant: "error"
        });
      }
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  }, [branchId, buildDraftData, draftId, hasDraftContent, pushToast]);

  async function deleteDraft(id: string) {
    try {
      await fetch(`/api/order-drafts/${id}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
    } catch {
      // Non-critical: starting fresh should not block invoice creation.
    }
  }

  function closeModal() {
    if (hasUnsavedChanges && saveStatus !== "saved") {
      const shouldClose = window.confirm("Bản nháp chưa lưu xong. Bạn vẫn muốn đóng form?");
      if (!shouldClose) return;
    }

    setOpen(false);
    setPaymentTouched(false);
  }

  useEffect(() => {
    if (!open || suppressAutosaveRef.current) return;
    const data = buildDraftData();
    setHasUnsavedChanges(hasDraftContent(data));
    if (hasDraftContent(data)) setSaveStatus("idle");
    if (!hasDraftContent(data)) return;

    const timeoutId = window.setTimeout(() => {
      void saveDraft(false);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [open, buildDraftData, hasDraftContent, saveDraft]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || saveStatus === "saved") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, hasUnsavedChanges, saveStatus]);

  useEffect(() => {
    const handler = async (event: Event) => {
      const draftIdFromEvent = (event as CustomEvent<{ draftId?: string }>).detail?.draftId;
      if (!draftIdFromEvent) return;
      setOpen(true);
      try {
        const response = await fetch(`/api/order-drafts/${draftIdFromEvent}`, {
          credentials: "same-origin"
        });
        if (!response.ok) throw new Error("Không thể tải bản nháp");
        const draft = (await response.json()) as OrderDraft;
        applyDraftData(draft);
        setRestoreDraft(null);
      } catch (error) {
        pushToast({
          title: "Không thể mở bản nháp",
          description: error instanceof Error ? error.message : "Bản nháp không còn tồn tại",
          variant: "error"
        });
      }
    };
    window.addEventListener("order-draft:open", handler);
    return () => window.removeEventListener("order-draft:open", handler);
  }, [applyDraftData, pushToast]);

  useEffect(() => {
    if (!open) return;
    const query = customerQuery.trim();

    if (!query || customerId) {
      setCustomerResults([]);
      setIsSearchingCustomers(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const response = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=20`, {
          signal: controller.signal,
          credentials: "same-origin"
        });
        if (!response.ok) {
          setCustomerResults([]);
          return;
        }

        const payload = (await response.json()) as Array<{ id: string; label: string; meta?: string }>;
        setCustomerResults(payload);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCustomerResults([]);
        }
      } finally {
        setIsSearchingCustomers(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, customerQuery, customerId]);

  useEffect(() => {
    if (!open) return;
    const query = productQuery.trim();

    if (!query) {
      setProductResults([]);
      setIsSearchingProducts(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingProducts(true);
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=30&salesOnly=1&branchId=${encodeURIComponent(branchId)}`, {
          signal: controller.signal,
          credentials: "same-origin"
        });
        if (!response.ok) {
          setProductResults([]);
          return;
        }

        const payload = (await response.json()) as Array<{
          id: string;
          label: string;
          sellingPrice?: number;
          currentStock?: number;
          meta?: string;
        }>;
        setProductResults(
          payload.map((item) => ({
            id: item.id,
            label: item.label,
            sellingPrice: Number(item.sellingPrice ?? 0),
            currentStock: Number(item.currentStock ?? 0),
            meta: item.meta
          }))
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setProductResults([]);
        }
      } finally {
        setIsSearchingProducts(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, productQuery, branchId]);

  function addProduct(product: ProductSuggestion) {
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.label,
        quantity: 1,
        unitPrice: product.sellingPrice,
        discountValue: 0
      }
    ]);
    setProductQuery("");
    setProductResults([]);
  }

  function selectCustomer(customer: { id: string; label: string }) {
    setCustomerId(customer.id);
    setCustomerQuery(customer.label);
    setCustomerResults([]);
  }

  function updateLine(index: number, key: "quantity" | "unitPrice", value: number) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function submit() {
    startTransition(async () => {
      try {
        if (!customerId) {
          pushToast({
            title: "Thiếu khách hàng",
            description: "Hãy chọn khách hàng từ gợi ý trước khi tạo hóa đơn",
            variant: "error"
          });
          return;
        }

        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            branchId,
            customerId,
            paymentMethod: "CASH",
            paidAmount: Math.max(paidAmount, 0),
            orderDiscount: 0,
            otherCharge: Math.max(otherCharge, 0),
            note,
            draftId,
            status: "COMPLETED",
            items: lines.map(({ productId, quantity, unitPrice, discountValue }) => ({
              productId,
              quantity,
              unitPrice,
              discountValue
            }))
          })
        });

        if (response.redirected) {
          window.location.href = response.url;
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : { error: (await response.text()).slice(0, 300) || "Phản hồi máy chủ không hợp lệ" };

        if (!response.ok) {
          pushToast({
            title: "Không thể tạo hóa đơn",
            description: payload.error ?? "Có lỗi xảy ra khi tạo hóa đơn",
            variant: "error"
          });
          return;
        }

        pushToast({ title: "Đã tạo hóa đơn", description: payload.order.code });
        if (payload.pdfWarning) {
          pushToast({
            title: "Hóa đơn đã tạo nhưng PDF chưa lưu",
            description: payload.pdfWarning,
            variant: "error"
          });
        }
        setOpen(false);
        resetForm();
        router.push(`/orders/${payload.order.id}?created=1`);
        router.refresh();
      } catch (error) {
        pushToast({
          title: "Không thể tạo hóa đơn",
          description: error instanceof Error ? error.message : "Lỗi mạng hoặc phiên đăng nhập đã hết hạn",
          variant: "error"
        });
      }
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
        }}
        className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-base font-semibold text-white shadow-soft sm:px-5 sm:py-3 sm:text-xl"
      >
        + Tạo HĐ
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[24px] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 sm:text-3xl">Tạo hóa đơn mới</h3>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  {saveStatus === "saving"
                    ? "Đang lưu nháp..."
                    : saveStatus === "saved" && lastSavedAt
                      ? `Đã lưu lúc ${new Date(lastSavedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                      : saveStatus === "error"
                        ? "Lưu nháp lỗi, hãy bấm Lưu nháp"
                        : "Bản nháp sẽ tự lưu khi bạn nhập."}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-3xl text-slate-500 sm:text-4xl"
              >
                ×
              </button>
            </div>
            {restoreDraft ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:p-4 sm:text-base">
                <p className="font-semibold">Bạn có bản nháp chưa hoàn tất. Tiếp tục chỉnh sửa?</p>
                <p className="mt-1 text-xs sm:text-sm">
                  Cập nhật lần cuối {new Date(restoreDraft.updatedAt).toLocaleString("vi-VN")}
                  {restoreDraft.customer?.name ? ` · ${restoreDraft.customer.name}` : ""}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="h-10 bg-amber-600 hover:bg-amber-700"
                    onClick={() => {
                      applyDraftData(restoreDraft);
                      setRestoreDraft(null);
                    }}
                  >
                    Tiếp tục bản nháp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      const id = restoreDraft.id;
                      resetForm();
                      setRestoreDraft(null);
                      void deleteDraft(id);
                    }}
                  >
                    Tạo hóa đơn mới
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-lg">Khách hàng</label>
                <input
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setCustomerId("");
                  }}
                  placeholder="Tìm khách hàng..."
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-lg"
                />
                {customerQuery ? (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {isSearchingCustomers ? (
                      <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">Đang tìm khách hàng...</div>
                    ) : customerResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">
                        {customerId ? "Đã chọn khách hàng." : "Không tìm thấy khách hàng phù hợp."}
                      </div>
                    ) : (
                      customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 sm:px-4 sm:py-2.5 sm:text-base"
                          onClick={() => selectCustomer(customer)}
                        >
                          <div className="font-semibold text-slate-900">{customer.label}</div>
                          {customer.meta ? <div className="mt-0.5 text-xs text-slate-500 sm:text-sm">{customer.meta}</div> : null}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-lg">Sản phẩm</label>
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="-- Chọn SP --"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-lg"
                />
                {productQuery ? (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {isSearchingProducts ? (
                      <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">Đang tìm sản phẩm...</div>
                    ) : productResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">Không tìm thấy sản phẩm phù hợp.</div>
                    ) : (
                      productResults.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 sm:px-4 sm:py-2.5 sm:text-base"
                          onClick={() => addProduct(product)}
                        >
                          <div className="font-semibold text-slate-900">{product.label}</div>
                          <div className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                            {product.meta ?? ""} · {product.sellingPrice.toLocaleString("vi-VN")} đ · Tồn: {product.currentStock.toLocaleString("vi-VN")}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                {lines.length === 0 ? (
                  <div className="h-28 rounded-2xl bg-slate-100" />
                ) : (
                  <div className="space-y-3 overflow-x-auto">
                    <div className="grid min-w-[660px] grid-cols-[minmax(0,2.2fr)_76px_110px_130px_36px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:min-w-0 sm:grid-cols-[minmax(0,2.2fr)_92px_132px_150px_40px] sm:text-xs">
                      <div>Sản phẩm</div>
                      <div>Số lượng</div>
                      <div>Giá</div>
                      <div>Tổng tiền</div>
                      <div></div>
                    </div>
                    {lines.map((line, index) => {
                      const lineTotal = line.quantity * line.unitPrice;
                      return (
                        <div key={`${line.productId}-${index}`} className="grid min-w-[660px] grid-cols-[minmax(0,2.2fr)_76px_110px_130px_36px] gap-2 sm:min-w-0 sm:grid-cols-[minmax(0,2.2fr)_92px_132px_150px_40px]">
                          <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm leading-5 sm:px-3 sm:py-2.5 sm:text-base sm:leading-6">{line.productName}</div>
                          <FormattedNumberInput
                            className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base"
                            min={1}
                            value={line.quantity}
                            onValueChange={(value) => updateLine(index, "quantity", value)}
                          />
                          <FormattedNumberInput
                            className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base"
                            min={0}
                            value={line.unitPrice}
                            onValueChange={(value) => updateLine(index, "unitPrice", value)}
                          />
                          <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-right text-sm font-semibold text-slate-900 sm:px-3 sm:py-2.5 sm:text-base">
                            {lineTotal.toLocaleString("vi-VN")} đ
                          </div>
                          <button type="button" className="rounded-xl border border-slate-200 text-sm sm:text-base" onClick={() => removeLine(index)}>×</button>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-end border-t border-slate-200 pt-3">
                      <div className="rounded-xl bg-white px-3 py-2 text-base font-bold text-slate-900 sm:px-4 sm:py-2.5 sm:text-xl">
                        Tổng tiền hàng: {merchandiseTotal.toLocaleString("vi-VN")} đ
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-lg">Ghi chú</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-20 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:h-24 sm:px-4 sm:py-3 sm:text-base"
                />
              </div>
              <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:gap-4 sm:p-4 md:grid-cols-[180px_180px_1fr_1fr]">
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-500">Thu khác</label>
                  <FormattedNumberInput
                    min={0}
                    value={otherCharge}
                    onValueChange={setOtherCharge}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-base"
                    placeholder="Phí ship, hàng mua hộ..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-500">Thanh toán</label>
                  <FormattedNumberInput
                    min={0}
                    value={paidAmount}
                    onValueChange={(value) => {
                      setPaymentTouched(true);
                      setPaidAmount(value);
                    }}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-base"
                    placeholder={orderTotal ? orderTotal.toString() : "0"}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tiền hàng</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{merchandiseTotal.toLocaleString("vi-VN")} đ</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng hóa đơn</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{orderTotal.toLocaleString("vi-VN")} đ</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 text-base sm:h-12"
                  onClick={() => void saveDraft(true)}
                  loading={isSavingDraft}
                >
                  Lưu nháp
                </Button>
                <Button className="h-11 w-full text-base sm:h-12 sm:text-xl" onClick={submit} loading={isPending} disabled={lines.length === 0}>
                  Tạo hóa đơn
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
