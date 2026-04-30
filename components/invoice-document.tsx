import { formatCurrency, formatDate } from "@/lib/utils";

function displayDate(value: Date | string | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed);
  }
  return formatDate(value);
}

function formatInvoiceAmount(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

type InvoiceDocumentItem = {
  id?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type InvoiceDocumentProps = {
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  createdAt: Date | string;
  printedAt?: Date | string;
  createdByName: string;
  code: string;
  customerCode: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  paymentMethodLabel: string;
  subtotal: number;
  discountTotal?: number;
  otherCharge?: number;
  paidAmount: number;
  debtAmount: number;
  grandTotal: number;
  note: string;
  items: InvoiceDocumentItem[];
  mode?: "screen" | "pdf";
  minRows?: number;
};

export function InvoiceDocument({
  branchName,
  branchAddress,
  branchPhone,
  createdAt,
  printedAt,
  createdByName,
  code,
  customerCode,
  customerName,
  customerAddress,
  customerPhone,
  paymentMethodLabel,
  subtotal,
  discountTotal = 0,
  otherCharge = 0,
  paidAmount,
  debtAmount,
  grandTotal,
  note,
  items,
  mode = "screen",
  minRows
}: InvoiceDocumentProps) {
  const rows = [...items];
  const targetRows = minRows ?? (mode === "pdf" ? 0 : 7);
  while (rows.length < targetRows) {
    rows.push({
      id: `blank-${rows.length}`,
      sku: "",
      name: "",
      quantity: 0,
      unitPrice: 0,
      total: 0
    });
  }

  const isPdf = mode === "pdf";

  return (
    <div
      className={
        isPdf
          ? "grid gap-2 bg-white p-3 text-[12px] leading-snug text-black"
          : "grid gap-3 text-[13px] leading-snug text-slate-700 sm:text-[14px] print:gap-2 print:text-[10px] print:leading-tight"
      }
      style={isPdf ? { fontFamily: "Arial, Helvetica, sans-serif" } : undefined}
    >
      <div className="border-y border-slate-400 py-1.5 text-center">
        <h1 className={isPdf ? "text-[24px] font-extrabold uppercase tracking-wide text-black" : "text-[28px] font-extrabold uppercase tracking-wide text-slate-900 sm:text-[32px] print:text-[22px]"}>
          Đơn đặt hàng
        </h1>
        <p className={isPdf ? "mt-0.5 text-[13px] font-semibold text-black" : "mt-1 text-lg font-semibold text-slate-600 sm:text-xl print:text-[12px]"}>{code}</p>
      </div>

      <div className={isPdf ? "grid gap-2 border border-slate-400 p-2 text-[11px]" : "grid gap-4 border border-slate-400 p-4 text-[14px] text-slate-700 sm:text-[15px] print:gap-2 print:p-2 print:text-[10px]"}>
        <div className="space-y-1.5">
          <p>
            <span className="font-semibold text-slate-900">Mã khách hàng:</span> {customerCode}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Khách hàng:</span> {customerName}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Địa chỉ:</span> {customerAddress}
          </p>
          <p>
            <span className="font-semibold text-slate-900">SĐT:</span> {customerPhone}
          </p>
        </div>
      </div>

      <div className={isPdf ? "" : "mx-auto w-full max-w-[980px]"}>
        <div className={isPdf ? "overflow-hidden border border-slate-400 bg-white" : "w-full overflow-hidden border border-slate-400 bg-white"}>
          {isPdf ? (
            <table className="w-full table-fixed border-collapse text-[11px] text-black">
              <colgroup>
                <col style={{ width: "66%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-center font-semibold text-slate-900">
                  <th className="border border-slate-400 px-1 py-1">Sản phẩm</th>
                  <th className="border border-slate-400 px-1 py-1 whitespace-nowrap">SL</th>
                  <th className="border border-slate-400 px-1 py-1 whitespace-nowrap">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) =>
                  item.sku || item.name ? (
                    <tr key={item.id || `${item.sku}-${index}`} className="align-top">
                      <td className="border border-slate-400 px-1 py-1 leading-4">
                        <p className="text-[9px] font-medium text-slate-500">{item.sku}</p>
                        <p
                          className="font-semibold text-slate-900"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden"
                          }}
                        >
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-600">Đơn giá: {formatInvoiceAmount(item.unitPrice)}</p>
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-center text-[11px] font-semibold whitespace-nowrap">
                        {item.quantity}
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-right align-top text-[14px] font-extrabold whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[72px] text-right">{formatInvoiceAmount(item.total)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Tổng cộng
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[13px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(subtotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Giảm giá
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[13px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(discountTotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Thu khác
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[13px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(otherCharge)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Số tiền đã trả
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[13px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(paidAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Còn nợ
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[13px] font-bold text-red-600 whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(debtAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-slate-400 px-1 py-1 text-right text-sm font-bold uppercase">
                    Tổng thanh toán
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[14px] font-extrabold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(grandTotal)}</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="invoice-table w-full table-fixed border-collapse text-[10px] text-slate-700 sm:text-[11px] print:text-[10px]">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "46%" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-center font-semibold text-slate-900">
                  <th className="border border-slate-400 px-0.5 py-1">Sản phẩm</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">SL</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">Đơn giá</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) =>
                  item.sku || item.name ? (
                    <tr key={item.id || `${item.sku}-${index}`} className="align-top">
                      <td className="border border-slate-400 px-0.5 py-1 leading-[1.2]">
                        <p className="text-[9px] font-medium text-slate-500">{item.sku}</p>
                        <p
                          className="font-semibold text-slate-900"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden"
                          }}
                        >
                          {item.name}
                        </p>
                      </td>
                      <td className="border border-slate-400 px-0.5 py-1 text-center whitespace-nowrap">{item.quantity}</td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right whitespace-nowrap">{formatInvoiceAmount(item.unitPrice)}</td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[72px] text-right">{formatInvoiceAmount(item.total)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id || `blank-${index}`} className="hidden align-top print:table-row">
                      <td className="border border-slate-400 px-0.5 py-2"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-center"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-right"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-right"></td>
                    </tr>
                  )
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Tổng cộng
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(subtotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Giảm giá
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(discountTotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Thu khác
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(otherCharge)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Số tiền đã trả
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(paidAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Còn nợ
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold text-red-600 whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(debtAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-0.5 py-1 text-right text-sm font-bold uppercase print:text-[10px]">
                    Tổng thanh toán
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-extrabold whitespace-nowrap print:text-[11px]">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(grandTotal)}</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <div className={isPdf ? "space-y-1.5 border-t border-slate-400 pt-1.5 text-[11px]" : "space-y-4 border-t border-slate-400 pt-4 text-[14px] text-slate-700 sm:text-[15px] print:space-y-2 print:pt-2 print:text-[10px]"}>
        <div className={isPdf ? "rounded-lg border border-slate-300 bg-slate-50 px-3 py-2" : "rounded-2xl bg-slate-50 px-4 py-3 print:rounded-none print:bg-transparent print:px-0 print:py-0"}>
          <p className={isPdf ? "text-[12px] font-bold text-slate-900" : "text-base font-bold text-slate-900 sm:text-lg print:text-[11px]"}>Ghi chú:</p>
          <p className={isPdf ? "mt-1 min-h-[24px] whitespace-pre-line leading-4.5" : "mt-2 whitespace-pre-line leading-6 print:mt-1 print:leading-tight"}>
            {note || "Không có ghi chú."}
          </p>
        </div>
        <div className="space-y-1 text-center">
          <p className={isPdf ? "text-[10px] font-bold uppercase text-slate-900" : "text-sm font-bold uppercase text-slate-900 print:text-[11px]"}>
            Không nhận trả hàng trừ trường hợp lỗi từ nhà sản xuất và quầy
          </p>
          <p>Quý khách vui lòng quay video khi nhận hàng để giải quyết khiếu nại nếu phát sinh.</p>
          <p>Mọi khiếu nại xin phản hồi trong vòng 7 ngày kể từ ngày nhận hàng.</p>
          <p>Sau thời gian này Quầy xin phép không giải quyết.</p>
        </div>
      </div>
    </div>
  );
}
