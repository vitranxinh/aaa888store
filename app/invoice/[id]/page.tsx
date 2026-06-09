import { notFound } from "next/navigation";
import { InvoiceAutoPrint } from "@/components/invoice-auto-print";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoicePrintToolbar } from "@/components/invoice-print-toolbar";
import { requireSession } from "@/lib/auth";
import { getOrderDetail } from "@/lib/order-detail";
import { formatDate } from "@/lib/utils";

export default async function InvoicePage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { autoprint?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const order = await getOrderDetail(params.id);

  if (!order || (session.branchId && order.branchId !== session.branchId)) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      {searchParams?.autoprint === "1" ? <InvoiceAutoPrint /> : null}
      <div className="invoice-sheet mx-auto max-w-6xl rounded-3xl bg-white p-5 shadow-soft sm:p-6 print:max-w-none print:rounded-none print:p-4 print:shadow-none">
        <InvoicePrintToolbar code={order.code} />
        <InvoiceDocument
          branchName={order.branch.name}
          branchAddress={order.branch.address || ""}
          branchPhone={order.branch.phone || ""}
          createdAt={order.createdAt}
          printedAt={new Date()}
          createdByName={order.createdBy.name}
          code={order.code}
          customerCode={order.customer.code}
          customerName={order.customer.name}
          customerAddress={order.customer.address || "-"}
          customerPhone={order.customer.phone || "-"}
          paymentMethodLabel={
            order.paymentMethod === "BANK_TRANSFER" ? "Chuyển khoản" : order.paymentMethod === "MIXED" ? "Hỗn hợp" : "Tiền mặt"
          }
          subtotal={Number(order.subtotal)}
          discountTotal={Number(order.discountTotal)}
          otherCharge={Number(order.otherCharge)}
          paidAmount={Number(order.paidAmount)}
          debtAmount={Number(order.debtAmount)}
          grandTotal={Number(order.grandTotal)}
          oldDebtAmount={Number(order.oldDebtAmount ?? 0)}
          note={order.note || ""}
          items={order.items.map((item) => ({
            id: item.id,
            sku: item.product.sku,
            name: item.product.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total)
          }))}
          minRows={4}
        />
      </div>
    </main>
  );
}
