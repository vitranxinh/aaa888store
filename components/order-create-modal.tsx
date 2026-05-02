"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  branchId: string;
  defaultCustomer: { id: string; name: string } | null;
};

type ProductSuggestion = {
  id: string;
  label: string;
  sellingPrice: number;
  meta?: string;
};

type OrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountValue: number;
};

export function OrderCreateModal({ branchId, defaultCustomer }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState(defaultCustomer?.id ?? "");
  const [customerQuery, setCustomerQuery] = useState(defaultCustomer?.name ?? "");
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
  const pushToast = useToastStore((state) => state.push);

  const merchandiseTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines]);
  const orderTotal = useMemo(() => merchandiseTotal + otherCharge, [merchandiseTotal, otherCharge]);

  useEffect(() => {
    if (!open) return;
    setCustomerId(defaultCustomer?.id ?? "");
    setCustomerQuery(defaultCustomer?.name ?? "");
    setCustomerResults([]);
    setProductQuery("");
  }, [defaultCustomer?.id, defaultCustomer?.name, open]);

  useEffect(() => {
    if (!paymentTouched) {
      setPaidAmount(orderTotal);
    }
  }, [orderTotal, paymentTouched]);

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
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=30`, {
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
          meta?: string;
        }>;
        setProductResults(
          payload.map((item) => ({
            id: item.id,
            label: item.label,
            sellingPrice: Number(item.sellingPrice ?? 0),
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
        setOpen(false);
        setLines([]);
        setNote("");
        setOtherCharge(0);
        setPaidAmount(0);
        setPaymentTouched(false);
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
          setOtherCharge(0);
          setPaymentTouched(false);
        }}
        className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-base font-semibold text-white shadow-soft sm:px-5 sm:py-3 sm:text-xl"
      >
        + Tạo HĐ
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[24px] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-bold text-slate-900 sm:text-3xl">Tạo hóa đơn mới</h3>
              <button
                onClick={() => {
                  setOpen(false);
                  setPaymentTouched(false);
                }}
                className="text-3xl text-slate-500 sm:text-4xl"
              >
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
                {defaultCustomer ? (
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
                    onClick={() => selectCustomer({ id: defaultCustomer.id, label: defaultCustomer.name })}
                  >
                    Chọn {defaultCustomer.name}
                  </button>
                ) : null}
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
                            {product.meta ?? ""} · {product.sellingPrice.toLocaleString("vi-VN")} đ
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
                          <input
                            className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base"
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, "quantity", Number(e.target.value))}
                          />
                          <input
                            className="rounded-xl border border-slate-200 px-2 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base"
                            type="number"
                            min="0"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, "unitPrice", Number(e.target.value))}
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
                  <input
                    type="number"
                    min="0"
                    value={otherCharge}
                    onChange={(e) => setOtherCharge(Number(e.target.value))}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-base"
                    placeholder="Phí ship, hàng mua hộ..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-500">Thanh toán</label>
                  <input
                    type="number"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => {
                      setPaymentTouched(true);
                      setPaidAmount(Number(e.target.value));
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
              <Button className="h-11 w-full text-base sm:h-12 sm:text-xl" onClick={submit} disabled={isPending || lines.length === 0}>
                {isPending ? "Đang tạo..." : "Tạo hóa đơn"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
