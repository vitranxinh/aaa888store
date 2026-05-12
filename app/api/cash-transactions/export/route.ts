import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { formatVietnamDateTime, resolveVietnamDateRange, type TimeFilterRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCell(value: string | number) {
  const type = typeof value === "number" ? "Number" : "String";
  return `<Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>`;
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    if (session.role === "CASHIER") {
      return NextResponse.json({ error: "Tài khoản nhân viên không được tải Excel" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const range = (searchParams.get("range") as TimeFilterRange) || "all";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const createdAt = resolveVietnamDateRange(range, dateFrom ?? undefined, dateTo ?? undefined);

    const transactions = await prisma.cashTransaction.findMany({
      where: {
        branchId: session.branchId ?? undefined,
        ...(createdAt ? { createdAt } : {})
      },
      include: {
        customer: true,
        supplier: true,
        order: true,
        purchaseOrder: true,
        createdBy: true
      },
      orderBy: { createdAt: "desc" }
    });

    const rows = transactions
      .map((item) => [
        item.code,
        formatVietnamDateTime(item.createdAt),
        item.createdBy?.name ?? "",
        item.type === "RECEIPT" ? "Thu khách hàng" : "Chi",
        item.customer?.name ?? (item.type === "PAYMENT" ? "Chi nội bộ" : ""),
        item.order?.code ?? "",
        Number(item.amount),
        item.note ?? ""
      ])
      .map((row) => `<Row>${row.map((value) => buildCell(value)).join("")}</Row>`)
      .join("");

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="ThuChi">
    <Table>
      <Row>
        ${[
          "Mã phiếu",
          "Ngày",
          "Người tạo",
          "Loại",
          "Đối tượng",
          "Liên kết",
          "Số tiền",
          "Ghi chú"
        ]
          .map((label) => buildCell(label))
          .join("")}
      </Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`;

    const fileDate = new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh"
    }).format(new Date());

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="thu-chi-${fileDate}.xls"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xuất Excel thu chi" },
      { status: 500 }
    );
  }
}
