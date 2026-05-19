"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { useToastStore } from "@/store/toast-store";

type OrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountValue: number;
};

type Props = {
  orderId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  note: string;
  otherCharge: number;
  paidAmount: number;
  lines: OrderLine[];
};

type ProductSuggestion = {
  id: string;
  label: string;
  sellingPrice: number;
  currentStock: number;
  meta?: string;
};

export function OrderEditModal({
  orderId,
  branchId,
  customerId: initialCustomerId,
  customerName: initialCustomerName,
  note: initialNote,
  otherCharge: initialOtherCharge,
  paidAmount: initialPaidAmount,
  lines: initialLines
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [customerQuery, setCustomerQuery] = useState(initialCustomerName);
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; label: string; meta?: string }>>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductSuggestion[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [otherCharge, setOtherCharge] = useState(initialOtherCharge);
  const [paidAmount, setPaidAmount] = useState(initialPaidAmount);
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>(initialLines);
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
    if (open) {
      setCustomerId(initialCustomerId);
      setCustomerQuery(initialCustomerName);
      setCustomerResults([]);
      setNote(initialNote);
      setOtherCharge(initialOtherCharge);
      setPaidAmount(initialPaidAmount);
      setLines(initialLines);
      setPaymentTouched(false);
      setProductQuery("");
    }
  }, [open, initialCustomerId, initialCustomerName, initialNote, initialOtherCharge, initialPaidAmount, initialLines]);

  const merchandiseTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines]);
  const orderTotal = useMemo(() => merchandiseTotal + otherCharge, [merchandiseTotal, otherCharge]);
  
  useEffect(() => {
    if (!paymentTouched && open) {
      setPaidAmount(Math.min(initialPaidAmount, orderTotal));
    }
  }, [orderTotal, paymentTouched, open, initialPaidAmount]);

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
  }, [open, productQuery]);

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
    setLines((prev) =>
      prev.map((line, idx) =>
        idx === index
          ? {
              ...line,
              [key]: value
            }
          : line
      )
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
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
            status: "COMPLETED",
            items: lines.map(({ productId, quantity, unitPrice, discountValue }) => ({
              productId,
              quantity,
              unitPrice,
              discountValue
            }))
          })
        });

        const payload = await response.json();
        if (!response.ok) {
          pushToast({
            title: "Không thể cập nhật hóa đơn",
            description: payload.error ?? "Có lỗi xảy ra khi sửa hóa đơn",
            variant: "error"
          });
          return;
        }

        pushToast({
          title: "Đã cập nhật hóa đơn",
          description: payload.order.code
        });
        setOpen(false);
        router.refresh();
      } catch (error) {
        pushToast({
          title: "Không thể cập nhật hóa đơn",
          description: error instanceof Error ? error.message : "Lỗi mạng khi sửa hóa đơn",
          variant: "error"
        });
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sửa hóa đơn
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[24px] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-bold text-slate-900 sm:text-3xl">Sửa hóa đơn</h3>
              <button onClick={() => setOpen(false)} className="text-3xl text-slate-500 sm:text-4xl">
                ×
              </button>
            </div>

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
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {isSearchingCustomers ? (
                      <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">Đang tìm khách hàng...</div>
                    ) : customerResults.length === 0 ? (
                      customerId ? null : <div className="px-3 py-3 text-sm text-slate-500 sm:px-4">Không tìm thấy khách hàng phù hợp.</div>
                    ) : (
                      customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 sm:px-4 sm:py-2.5 sm:text-base"
                          onClick={() => selectCustomer(customer)}
                        >
                          <div className="font-semibold text-slate-900">{customer.label}</div>
                          <div className="mt-0.5 text-xs text-slate-500 sm:text-sm">{customer.meta ?? ""}</div>
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
                        <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm leading-5 sm:px-3 sm:py-2.5 sm:text-base sm:leading-6">
                          <div className="font-semibold text-slate-900">{line.productName}</div>
                        </div>
                        <FormattedNumberInput className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base" min={1} value={line.quantity} onValueChange={(value) => updateLine(index, "quantity", value)} />
                        <FormattedNumberInput className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base" min={0} value={line.unitPrice} onValueChange={(value) => updateLine(index, "unitPrice", value)} />
                        <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-right text-sm font-semibold text-slate-900 sm:px-3 sm:py-2.5 sm:text-base">
                          {lineTotal.toLocaleString("vi-VN")} đ
                        </div>
                        <button type="button" className="rounded-xl border border-slate-200 text-sm sm:text-base" onClick={() => removeLine(index)}>
                          ×
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-end border-t border-slate-200 pt-3">
                    <div className="rounded-xl bg-white px-3 py-2 text-base font-bold text-slate-900 sm:px-4 sm:py-2.5 sm:text-xl">
                      Tổng tiền hàng: {merchandiseTotal.toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                </div>
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

              <Button className="h-11 w-full text-base sm:h-12 sm:text-xl" onClick={submit} loading={isPending} disabled={lines.length === 0}>
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
