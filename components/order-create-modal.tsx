"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { compareSearchResults, getSearchScore } from "@/lib/search";
import { useToastStore } from "@/store/toast-store";

type Props = {
  customers: { id: string; name: string }[];
  products: { id: string; name: string; sellingPrice: number }[];
  branchId: string;
};

export function OrderCreateModal({ customers, products, branchId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [note, setNote] = useState("");
  const [otherCharge, setOtherCharge] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [lines, setLines] = useState<Array<{ productId: string; quantity: number; unitPrice: number; discountValue: number }>>([]);
  const pushToast = useToastStore((state) => state.push);

  const matchedProducts = useMemo(() => {
    return products
      .map((item) => ({ item, score: getSearchScore(item.name, productQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        compareSearchResults(
          { label: a.item.name, score: a.score, searchText: a.item.name },
          { label: b.item.name, score: b.score, searchText: b.item.name },
          productQuery
        )
      )
      .map((entry) => entry.item)
      .slice(0, 100);
  }, [productQuery, products]);

  const merchandiseTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines]);
  const orderTotal = useMemo(() => merchandiseTotal + otherCharge, [merchandiseTotal, otherCharge]);
  useEffect(() => {
    if (!paymentTouched) {
      setPaidAmount(orderTotal);
    }
  }, [orderTotal, paymentTouched]);

  function addProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setLines((prev) => [...prev, { productId, quantity: 1, unitPrice: product.sellingPrice, discountValue: 0 }]);
    setProductQuery("");
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
            items: lines
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
        window.location.href = `/orders/${payload.order.id}?created=1`;
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
                <select
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:h-12 sm:px-4 sm:text-lg"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
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
                    {matchedProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 sm:px-4 sm:py-2.5 sm:text-base"
                        onClick={() => addProduct(product.id)}
                      >
                        {product.name}
                      </button>
                    ))}
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
                      const product = products.find((item) => item.id === line.productId);
                      const lineTotal = line.quantity * line.unitPrice;
                      return (
                        <div key={`${line.productId}-${index}`} className="grid min-w-[660px] grid-cols-[minmax(0,2.2fr)_76px_110px_130px_36px] gap-2 sm:min-w-0 sm:grid-cols-[minmax(0,2.2fr)_92px_132px_150px_40px]">
                          <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm leading-5 sm:px-3 sm:py-2.5 sm:text-base sm:leading-6">{product?.name}</div>
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
