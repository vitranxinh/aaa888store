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
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ tài khoản sếp được tải Excel hóa đơn" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const range = (searchParams.get("range") as TimeFilterRange) || "all";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const createdAt = resolveVietnamDateRange(range, dateFrom ?? undefined, dateTo ?? undefined);

    const orderWhere = {
      branchId: session.branchId ?? undefined,
      ...(createdAt ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { customer: { name: { contains: q, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };

    const orders = await prisma.order.findMany({
      where: orderWhere,
      include: {
        customer: true
      },
      orderBy: { createdAt: "desc" }
    });

    const rows = orders
      .map((order) => {
        const createdAtLabel = formatVietnamDateTime(order.createdAt);

        return [
          order.code,
          createdAtLabel,
          order.customer.name,
          order.status,
          Number(order.grandTotal),
          Number(order.paidAmount),
          Number(order.debtAmount),
          order.paymentMethod,
          order.note ?? ""
        ];
      })
      .map(
        (row) =>
          `<Row>${row
            .map((value) => buildCell(value))
            .join("")}</Row>`
      )
      .join("");

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="HoaDon">
    <Table>
      <Row>
        ${[
          "Mã hóa đơn",
          "Ngày tạo",
          "Khách hàng",
          "Trạng thái",
          "Tổng tiền",
          "Đã trả",
          "Còn nợ",
          "Phương thức",
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
        "Content-Disposition": `attachment; filename="hoa-don-${fileDate}.xls"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xuất Excel hóa đơn" },
      { status: 500 }
    );
  }
}
