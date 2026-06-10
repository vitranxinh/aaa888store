

import { formatDate } from "@/lib/utils";
import { calculateInvoiceDebtBreakdown } from "@/lib/invoice-totals";

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
  createdAt: Date | string | null;
  printedAt?: Date | string | null;
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
  oldDebtAmount?: number | null;
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
  otherCharge = 0,
  paidAmount,
  debtAmount,
  grandTotal,
  oldDebtAmount,
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
  const createdAtLabel = formatDate(createdAt);
  const debtBreakdown = calculateInvoiceDebtBreakdown({ grandTotal, paidAmount, debtAmount, oldDebtAmount });
  const shouldShowOldDebt = debtBreakdown.oldDebt > 0;

  return (
    <div
      className={
        isPdf
          ? "grid gap-2 bg-white p-3 text-[20px] leading-tight text-black"
          : "grid gap-3 text-[13px] leading-snug text-slate-700 sm:text-[14px] print:gap-2 print:text-[20px] print:leading-tight print:w-full"
      }
      style={isPdf ? { fontFamily: "Arial, Helvetica, sans-serif" } : undefined}
    >
      <div className="border-y border-slate-400 py-1.5 text-center">
        <h1 className={isPdf ? "text-[30px] font-extrabold uppercase tracking-wide text-black" : "text-[28px] font-extrabold uppercase tracking-wide text-slate-900 sm:text-[32px] print:text-[30px]"}>
          Đơn đặt hàng
        </h1>
        <p className={isPdf ? "mt-0.5 text-[18px] font-semibold text-black" : "mt-1 text-lg font-semibold text-slate-600 sm:text-xl print:text-[18px]"}>{code}</p>
      </div>

      <div className={isPdf ? "grid gap-2 border border-slate-400 p-2 text-[20px]" : "grid gap-4 border border-slate-400 p-4 text-[14px] text-slate-700 sm:text-[15px] print:gap-2 print:p-2 print:text-[20px]"}>
        <div className={isPdf ? "grid gap-2 md:grid-cols-[1.5fr,1fr]" : "grid gap-4 md:grid-cols-[1.5fr,1fr]"}>
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
          <div
            className={
              isPdf
                ? "rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-[20px]"
                : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 print:rounded-none print:border-slate-400 print:bg-transparent print:px-2 print:py-2"
            }
          >
            <div className="space-y-1.5">
              <p>
                <span className="font-semibold text-slate-900">Ngày tạo:</span> {createdAtLabel}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={isPdf ? "" : "mx-auto w-full max-w-[980px] print:max-w-none"}>
        <div className={isPdf ? "overflow-hidden border border-slate-400 bg-white" : "w-full overflow-hidden border border-slate-400 bg-white print:overflow-visible"}>
          {isPdf ? (
            <table className="w-full table-fixed border-collapse text-[20px] text-black">
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "60%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-center font-semibold text-slate-900">
                  <th className="border border-slate-400 px-1 py-1 whitespace-nowrap">STT</th>
                  <th className="border border-slate-400 px-1 py-1">Sản phẩm</th>
                  <th className="border border-slate-400 px-1 py-1 whitespace-nowrap">SL</th>
                  <th className="border border-slate-400 px-1 py-1 whitespace-nowrap">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) =>
                  item.name ? (
                    <tr key={item.id || `${item.name}-${index}`} className="align-top">
                      <td className="border border-slate-400 px-1 py-1 text-center text-[20px] font-semibold whitespace-nowrap">
                        {index + 1}
                      </td>
                      <td className="border border-slate-400 px-1.5 py-1.5 leading-[1.25]">
                        <p className="break-words font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[20px] text-slate-600">Đơn giá: {formatInvoiceAmount(item.unitPrice)}</p>
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-center text-[20px] font-semibold whitespace-nowrap">
                        {item.quantity}
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-right align-top text-[20px] font-extrabold whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[72px] text-right">{formatInvoiceAmount(item.total)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
              <tbody>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Tổng cộng
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(subtotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Thu khác
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(otherCharge)}</span>
                    </div>
                  </td>
                </tr>
                {shouldShowOldDebt ? (
                  <>
                    <tr>
                      <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                        Tổng cần thanh toán
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-bold text-emerald-700 whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[72px] text-right">{formatInvoiceAmount(debtBreakdown.totalPayable)}</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                        Nợ cũ
                      </td>
                      <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-bold whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[72px] text-right">{formatInvoiceAmount(debtBreakdown.oldDebt)}</span>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : null}
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right font-semibold">
                    Số tiền đã trả
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-bold whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(paidAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="border border-slate-400 px-1 py-1 text-right text-sm font-bold uppercase">
                    Còn nợ sau hóa đơn
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right text-[20px] font-extrabold text-red-600 whitespace-nowrap">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[72px] text-right">{formatInvoiceAmount(debtBreakdown.remainingDebt)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="invoice-table w-full table-fixed border-collapse text-[10px] text-slate-700 sm:text-[11px] print:text-[20px]">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "23%" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-center font-semibold text-slate-900">
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">STT</th>
                  <th className="border border-slate-400 px-0.5 py-1">Sản phẩm</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">SL</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">Đơn giá</th>
                  <th className="border border-slate-400 px-0.5 py-1 whitespace-nowrap">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) =>
                  item.name ? (
                    <tr key={item.id || `${item.name}-${index}`} className="align-top">
                      <td className="border border-slate-400 px-0.5 py-1 text-center whitespace-nowrap">{index + 1}</td>
                      <td className="border border-slate-400 px-1 py-1.5 leading-[1.25]">
                        <p className="break-words font-semibold text-slate-900">
                          {item.name}
                        </p>
                      </td>
                      <td className="border border-slate-400 px-0.5 py-1 text-center whitespace-nowrap">{item.quantity}</td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right whitespace-nowrap">{formatInvoiceAmount(item.unitPrice)}</td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(item.total)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id || `blank-${index}`} className="hidden align-top print:table-row">
                      <td className="border border-slate-400 px-0.5 py-2 text-center"></td>
                      <td className="border border-slate-400 px-0.5 py-2"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-center"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-right"></td>
                      <td className="border border-slate-400 px-0.5 py-2 text-right"></td>
                    </tr>
                  )
                )}
              </tbody>
              <tbody>
                <tr>
                  <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Tổng cộng
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap print:text-[20px]">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(subtotal)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Thu khác
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap print:text-[20px]">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(otherCharge)}</span>
                    </div>
                  </td>
                </tr>
                {shouldShowOldDebt ? (
                  <>
                    <tr>
                      <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                        Tổng cần thanh toán
                      </td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold text-emerald-700 whitespace-nowrap print:text-[20px]">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(debtBreakdown.totalPayable)}</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                        Nợ cũ
                      </td>
                      <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap print:text-[20px]">
                        <div className="flex w-full justify-end text-right">
                          <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(debtBreakdown.oldDebt)}</span>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : null}
                <tr>
                  <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right font-semibold">
                    Số tiền đã trả
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-bold whitespace-nowrap print:text-[20px]">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(paidAmount)}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="border border-slate-400 px-0.5 py-1 text-right text-sm font-bold uppercase print:text-[20px]">
                    Còn nợ sau hóa đơn
                  </td>
                  <td className="border border-slate-400 px-0.5 py-1 text-right text-[12px] font-extrabold text-red-600 whitespace-nowrap print:text-[20px]">
                    <div className="flex w-full justify-end text-right">
                      <span className="min-w-[60px] text-right print:min-w-0">{formatInvoiceAmount(debtBreakdown.remainingDebt)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={isPdf ? "space-y-1.5 border-t border-slate-400 pt-1.5 text-[17px]" : "space-y-4 border-t border-slate-400 pt-4 text-[14px] text-slate-700 sm:text-[15px] print:space-y-2 print:pt-2 print:text-[17px]"}>
        <div className={isPdf ? "rounded-lg border border-slate-300 bg-slate-50 px-3 py-2" : "rounded-2xl bg-slate-50 px-4 py-3 print:rounded-none print:bg-transparent print:px-0 print:py-0"}>
          <p className={isPdf ? "text-[17px] font-bold text-slate-900" : "text-base font-bold text-slate-900 sm:text-lg print:text-[17px]"}>Ghi chú:</p>
          <p className={isPdf ? "mt-1 min-h-[24px] whitespace-pre-line leading-4.5" : "mt-2 whitespace-pre-line leading-6 print:mt-1 print:leading-tight"}>
            {note || "Không có ghi chú."}
          </p>
        </div>
        <div className="space-y-1 text-center">
          <p className={isPdf ? "text-[17px] font-bold uppercase text-slate-900" : "text-sm font-bold uppercase text-slate-900 print:text-[17px]"}>
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
