#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_to_index(ref: str) -> int:
    col = 0
    for char in ref:
        if not char.isalpha():
            break
        col = col * 26 + ord(char.upper()) - 64
    return max(col - 1, 0)


def excel_date_to_iso(raw: Any) -> str | None:
    if raw in (None, ""):
        return None
    try:
        serial = float(str(raw).replace(",", ""))
    except ValueError:
        return str(raw)

    base = datetime(1899, 12, 30)
    whole_days = int(serial)
    seconds = round((serial - whole_days) * 86400)
    return (base + timedelta(days=whole_days, seconds=seconds)).isoformat(timespec="seconds")


def parse_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace(",", "")
    if text in {"#NUM!", "#VALUE!", "#N/A"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1].strip()
    return text


@dataclass
class WorkbookData:
    sheets: dict[str, list[list[Any]]]


class XlsxReader:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> WorkbookData:
        with zipfile.ZipFile(self.path) as archive:
            shared_strings = self._load_shared_strings(archive)
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
            sheets: dict[str, list[list[Any]]] = {}

            for sheet in workbook.find("main:sheets", NS):
                name = sheet.attrib["name"]
                rel_id = sheet.attrib[f"{{{REL_NS}}}id"]
                target = "xl/" + rel_map[rel_id].lstrip("/")
                target = target.replace("xl//", "xl/")
                xml = ET.fromstring(archive.read(target))
                sheets[name] = self._load_sheet(xml, shared_strings)

        return WorkbookData(sheets=sheets)

    def _load_shared_strings(self, archive: zipfile.ZipFile) -> list[str]:
        if "xl/sharedStrings.xml" not in archive.namelist():
            return []
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        values: list[str] = []
        for item in root.findall("main:si", NS):
            values.append("".join(node.text or "" for node in item.iterfind(".//main:t", NS)))
        return values

    def _load_sheet(self, xml: ET.Element, shared_strings: list[str]) -> list[list[Any]]:
        sheet_data = xml.find("main:sheetData", NS)
        rows: list[list[Any]] = []
        if sheet_data is None:
            return rows

        for row in sheet_data.findall("main:row", NS):
            cells: dict[int, Any] = {}
            max_index = -1
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "")
                idx = col_to_index(ref)
                max_index = max(max_index, idx)
                value = self._get_cell_value(cell, shared_strings)
                cells[idx] = value
            if max_index < 0:
                rows.append([])
                continue
            rows.append([cells.get(i) for i in range(max_index + 1)])
        return rows

    def _get_cell_value(self, cell: ET.Element, shared_strings: list[str]) -> Any:
        value_node = cell.find("main:v", NS)
        cell_type = cell.attrib.get("t")
        if cell_type == "s" and value_node is not None:
            return shared_strings[int(value_node.text)]
        if cell_type == "inlineStr":
            inline = cell.find("main:is", NS)
            if inline is None:
                return None
            return "".join(node.text or "" for node in inline.iterfind(".//main:t", NS))
        if value_node is None:
            return None
        return value_node.text


def rows_to_dicts(rows: list[list[Any]]) -> list[dict[str, Any]]:
    headers = [clean_text(item) for item in rows[0]]
    items: list[dict[str, Any]] = []
    for row in rows[1:]:
        if not any(value not in (None, "") for value in row):
            continue
        entry: dict[str, Any] = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            entry[header] = row[idx] if idx < len(row) else None
        items.append(entry)
    return items


def normalize_phone(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    num = parse_number(text)
    if num is None:
        return text
    if num.is_integer():
        return str(int(num))
    return text


def build_seed(book: WorkbookData) -> dict[str, Any]:
    customer_rows = rows_to_dicts(book.sheets["KHÁCH HÀNG"])
    debt_rows = rows_to_dicts(book.sheets["CÔNG NỢ THEO HÓA ĐƠN"])
    invoice_rows = rows_to_dicts(book.sheets["CHI TIẾT HÓA ĐƠN"])
    product_rows = rows_to_dicts(book.sheets["Hàng Q302"])
    backup_product_rows = rows_to_dicts(book.sheets["HÀNG HÓA"])

    customers = []
    for row in customer_rows:
        customers.append(
            {
                "id": clean_text(row.get("Mã khách hàng")),
                "name": clean_text(row.get("Tên khách hàng")),
                "phone": normalize_phone(row.get("Điện thoại")),
                "address": clean_text(row.get("Địa chỉ")),
                "note": clean_text(row.get("Ghi chú")),
                "openingDebt": parse_number(row.get("Nợ cần thu hiện tại")) or 0,
                "lifetimeSales": parse_number(row.get("Tổng bán")) or 0,
                "source": "KHÁCH HÀNG",
            }
        )

    product_map: dict[str, dict[str, Any]] = {}
    for source_name, rows in (("HÀNG HÓA", backup_product_rows), ("Hàng Q302", product_rows)):
        for row in rows:
            code = clean_text(row.get("Mã hàng"))
            if not code:
                continue
            current = product_map.get(code, {})
            images = clean_text(row.get("Hình ảnh (url1,url2...)"))
            image_list = [item.strip() for item in images.split(",") if item.strip()]
            product_map[code] = {
                "id": code,
                "name": clean_text(row.get("Tên hàng")) or current.get("name", ""),
                "category": clean_text(row.get("Nhóm hàng")) or clean_text(row.get("Nhóm hàng(3 Cấp)")) or current.get("category", ""),
                "price": parse_number(row.get("Giá bán")) or parse_number(row.get("Gía bán")) or current.get("price") or 0,
                "stock": parse_number(row.get("Tồn kho")) if row.get("Tồn kho") not in (None, "") else current.get("stock", 0),
                "images": image_list or current.get("images", []),
                "source": source_name,
            }

    invoice_groups: dict[str, dict[str, Any]] = {}
    for row in invoice_rows:
        invoice_id = clean_text(row.get("Mã hóa đơn"))
        if not invoice_id:
            continue
        invoice = invoice_groups.setdefault(
            invoice_id,
            {
                "id": invoice_id,
                "createdAt": excel_date_to_iso(row.get("Ngày giờ")),
                "customerId": clean_text(row.get("Mã khách hàng")),
                "customerName": clean_text(row.get("Tên Khách hàng")),
                "items": [],
                "total": parse_number(row.get("Tổng tiền hóa đơn")) or 0,
                "note": "",
                "status": "unpaid",
                "paidAmount": 0,
            },
        )
        invoice["items"].append(
            {
                "productId": clean_text(row.get("Mã Sản phẩm")),
                "productName": clean_text(row.get("Tên sản phẩm")),
                "quantity": parse_number(row.get("Số lượng")) or 0,
                "price": parse_number(row.get("Đơn giá")) or 0,
                "lineTotal": parse_number(row.get("Thành tiền")) or 0,
            }
        )
        if not invoice["total"]:
            invoice["total"] = sum(item["lineTotal"] for item in invoice["items"])

    debt_by_invoice = {}
    for row in debt_rows:
        invoice_id = clean_text(row.get("Mã Hóa đơn"))
        if not invoice_id:
            continue
        debt_by_invoice[invoice_id] = {
            "invoiceId": invoice_id,
            "date": excel_date_to_iso(row.get("Ngày")),
            "customerId": clean_text(row.get("Mã khách hàng")),
            "customerName": clean_text(row.get("Tên khách")),
            "phone": normalize_phone(row.get("SĐT")),
            "note": clean_text(row.get("Ghi chú")),
            "amountDue": parse_number(row.get("Khách cần trả")) or 0,
            "amountPaid": parse_number(row.get("Khách đã trả")) or 0,
        }

    for invoice in invoice_groups.values():
        debt = debt_by_invoice.get(invoice["id"])
        if debt:
            invoice["note"] = debt["note"]
            invoice["paidAmount"] = debt["amountPaid"]
            invoice["status"] = "paid" if math.isclose(debt["amountDue"], debt["amountPaid"]) else "partial" if debt["amountPaid"] > 0 else "unpaid"

    vouchers = []
    voucher_counter = 1
    for debt in debt_by_invoice.values():
        if debt["amountPaid"] <= 0:
            continue
        vouchers.append(
            {
                "id": f"PT{voucher_counter:04d}",
                "type": "receipt",
                "createdAt": debt["date"],
                "customerId": debt["customerId"],
                "customerName": debt["customerName"],
                "invoiceId": debt["invoiceId"],
                "amount": debt["amountPaid"],
                "method": "Tiền mặt",
                "note": f"Thu tiền cho hóa đơn {debt['invoiceId']}",
            }
        )
        voucher_counter += 1

    meta = {
        "storeName": "Quầy 302 Hapulico",
        "address": "Tòa nhà Hapulico, Thanh Xuân, Hà Nội",
        "phone": "0918377022",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceWorkbook": str(Path("/Users/vitran/Downloads/302.xlsx")),
        "counts": {
            "customers": len(customers),
            "products": len(product_map),
            "invoices": len(invoice_groups),
            "vouchers": len(vouchers),
        },
    }

    return {
        "meta": meta,
        "customers": customers,
        "products": list(product_map.values()),
        "invoices": sorted(invoice_groups.values(), key=lambda item: item["id"]),
        "vouchers": vouchers,
        "debts": list(debt_by_invoice.values()),
    }


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/vitran/Downloads/302.xlsx")
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/seed.json")
    output.parent.mkdir(parents=True, exist_ok=True)

    book = XlsxReader(source).load()
    seed = build_seed(book)
    output.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "output": str(output),
                "counts": seed["meta"]["counts"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
