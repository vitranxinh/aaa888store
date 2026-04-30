#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from scripts.extract_xlsx import XlsxReader, build_seed


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "store.db"
DEFAULT_XLSX = Path("/Users/vitran/Downloads/302.xlsx")


def utc_now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class StoreDB:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS customers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    phone TEXT DEFAULT '',
                    address TEXT DEFAULT '',
                    note TEXT DEFAULT '',
                    opening_debt REAL DEFAULT 0,
                    lifetime_sales REAL DEFAULT 0,
                    source TEXT DEFAULT 'app',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT DEFAULT '',
                    price REAL DEFAULT 0,
                    stock REAL DEFAULT 0,
                    images_json TEXT DEFAULT '[]',
                    source TEXT DEFAULT 'app',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS invoices (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    total REAL DEFAULT 0,
                    paid_amount REAL DEFAULT 0,
                    note TEXT DEFAULT '',
                    status TEXT DEFAULT 'unpaid',
                    source TEXT DEFAULT 'app',
                    FOREIGN KEY (customer_id) REFERENCES customers(id)
                );

                CREATE TABLE IF NOT EXISTS invoice_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    quantity REAL DEFAULT 0,
                    price REAL DEFAULT 0,
                    line_total REAL DEFAULT 0,
                    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
                    FOREIGN KEY (product_id) REFERENCES products(id)
                );

                CREATE TABLE IF NOT EXISTS vouchers (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    customer_id TEXT DEFAULT '',
                    customer_name TEXT DEFAULT '',
                    invoice_id TEXT DEFAULT '',
                    amount REAL DEFAULT 0,
                    method TEXT DEFAULT 'Tiền mặt',
                    note TEXT DEFAULT ''
                );
                """
            )

    def is_seeded(self) -> bool:
        with self.connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM customers").fetchone()
        return bool(row["count"])

    def load_seed_from_excel(self, xlsx_path: Path = DEFAULT_XLSX) -> dict:
        seed = build_seed(XlsxReader(xlsx_path).load())
        with self.connect() as conn:
            conn.execute("DELETE FROM invoice_items")
            conn.execute("DELETE FROM invoices")
            conn.execute("DELETE FROM vouchers")
            conn.execute("DELETE FROM products")
            conn.execute("DELETE FROM customers")
            conn.execute("DELETE FROM settings")

            meta = seed["meta"]
            conn.executemany(
                "INSERT INTO settings(key, value) VALUES(?, ?)",
                [
                    ("store_name", meta["storeName"]),
                    ("store_address", meta["address"]),
                    ("store_phone", meta["phone"]),
                    ("generated_at", meta["generatedAt"]),
                    ("source_workbook", meta["sourceWorkbook"]),
                ],
            )

            conn.executemany(
                """
                INSERT INTO customers(id, name, phone, address, note, opening_debt, lifetime_sales, source, created_at)
                VALUES(:id, :name, :phone, :address, :note, :openingDebt, :lifetimeSales, :source, :created_at)
                """,
                [{**customer, "created_at": utc_now()} for customer in seed["customers"]],
            )
            conn.executemany(
                """
                INSERT INTO products(id, name, category, price, stock, images_json, source, created_at)
                VALUES(:id, :name, :category, :price, :stock, :images_json, :source, :created_at)
                """,
                [
                    {
                        **product,
                        "images_json": json.dumps(product.get("images", []), ensure_ascii=False),
                        "created_at": utc_now(),
                    }
                    for product in seed["products"]
                ],
            )
            conn.executemany(
                """
                INSERT INTO invoices(id, created_at, customer_id, customer_name, total, paid_amount, note, status, source)
                VALUES(:id, :createdAt, :customerId, :customerName, :total, :paidAmount, :note, :status, 'excel')
                """,
                seed["invoices"],
            )
            invoice_items = []
            for invoice in seed["invoices"]:
                for item in invoice["items"]:
                    invoice_items.append(
                        {
                            "invoice_id": invoice["id"],
                            "product_id": item["productId"],
                            "product_name": item["productName"],
                            "quantity": item["quantity"],
                            "price": item["price"],
                            "line_total": item["lineTotal"],
                        }
                    )
            conn.executemany(
                """
                INSERT INTO invoice_items(invoice_id, product_id, product_name, quantity, price, line_total)
                VALUES(:invoice_id, :product_id, :product_name, :quantity, :price, :line_total)
                """,
                invoice_items,
            )
            conn.executemany(
                """
                INSERT INTO vouchers(id, type, created_at, customer_id, customer_name, invoice_id, amount, method, note)
                VALUES(:id, :type, :createdAt, :customerId, :customerName, :invoiceId, :amount, :method, :note)
                """,
                seed["vouchers"],
            )
            conn.commit()

        return self.snapshot()

    def snapshot(self) -> dict:
        with self.connect() as conn:
            settings = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM settings")}
            customers = [dict(row) for row in conn.execute("SELECT * FROM customers ORDER BY name COLLATE NOCASE")]
            products = [dict(row) for row in conn.execute("SELECT * FROM products ORDER BY name COLLATE NOCASE")]
            invoices = [dict(row) for row in conn.execute("SELECT * FROM invoices ORDER BY datetime(created_at) DESC, id DESC")]
            invoice_items = [dict(row) for row in conn.execute("SELECT * FROM invoice_items ORDER BY id")]
            vouchers = [dict(row) for row in conn.execute("SELECT * FROM vouchers ORDER BY datetime(created_at) DESC, id DESC")]

        items_by_invoice: dict[str, list[dict]] = {}
        for item in invoice_items:
            items_by_invoice.setdefault(item["invoice_id"], []).append(
                {
                    "productId": item["product_id"],
                    "productName": item["product_name"],
                    "quantity": item["quantity"],
                    "price": item["price"],
                    "lineTotal": item["line_total"],
                }
            )

        for product in products:
            product["images"] = json.loads(product.pop("images_json") or "[]")
        for customer in customers:
            customer["openingDebt"] = customer.pop("opening_debt")
            customer["lifetimeSales"] = customer.pop("lifetime_sales")
            customer.pop("created_at", None)
        for invoice in invoices:
            invoice["customerId"] = invoice.pop("customer_id")
            invoice["customerName"] = invoice.pop("customer_name")
            invoice["createdAt"] = invoice.pop("created_at")
            invoice["paidAmount"] = invoice.pop("paid_amount")
            invoice["items"] = items_by_invoice.get(invoice["id"], [])
        for product in products:
            product.pop("created_at", None)
        for voucher in vouchers:
            voucher["createdAt"] = voucher.pop("created_at")
            voucher["customerId"] = voucher.pop("customer_id")
            voucher["customerName"] = voucher.pop("customer_name")
            voucher["invoiceId"] = voucher.pop("invoice_id")

        debts = [
            {
                "invoiceId": invoice["id"],
                "customerId": invoice["customerId"],
                "customerName": invoice["customerName"],
                "date": invoice["createdAt"],
                "amountDue": invoice["total"],
                "amountPaid": invoice["paidAmount"],
                "remaining": max(invoice["total"] - invoice["paidAmount"], 0),
                "note": invoice["note"],
            }
            for invoice in invoices
            if invoice["total"] - invoice["paidAmount"] > 0
        ]

        return {
            "meta": {
                "storeName": settings.get("store_name", "302 Store Manager"),
                "address": settings.get("store_address", ""),
                "phone": settings.get("store_phone", ""),
                "generatedAt": settings.get("generated_at", ""),
                "sourceWorkbook": settings.get("source_workbook", str(DEFAULT_XLSX)),
                "counts": {
                    "customers": len(customers),
                    "products": len(products),
                    "invoices": len(invoices),
                    "vouchers": len(vouchers),
                },
            },
            "customers": customers,
            "products": products,
            "invoices": invoices,
            "vouchers": vouchers,
            "debts": debts,
        }

    def next_code(self, prefix: str, table: str) -> str:
        with self.connect() as conn:
            rows = conn.execute(f"SELECT id FROM {table} WHERE id LIKE ?", (f"{prefix}%",)).fetchall()
        max_num = 0
        for row in rows:
            suffix = row["id"][len(prefix) :]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))
        width = 4 if prefix in {"HD", "PT", "PC"} else 6
        return f"{prefix}{max_num + 1:0{width}d}"

    def create_customer(self, payload: dict) -> dict:
        customer_id = payload.get("id") or self.next_code("KH", "customers")
        row = {
            "id": customer_id,
            "name": payload["name"].strip(),
            "phone": payload.get("phone", "").strip(),
            "address": payload.get("address", "").strip(),
            "note": payload.get("note", "").strip(),
            "opening_debt": float(payload.get("openingDebt") or 0),
            "lifetime_sales": float(payload.get("lifetimeSales") or 0),
            "source": "app",
            "created_at": utc_now(),
        }
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO customers(id, name, phone, address, note, opening_debt, lifetime_sales, source, created_at)
                VALUES(:id, :name, :phone, :address, :note, :opening_debt, :lifetime_sales, :source, :created_at)
                """,
                row,
            )
            conn.commit()
        return self.snapshot()

    def create_product(self, payload: dict) -> dict:
        product_id = payload.get("id") or self.next_code("SP", "products")
        images = payload.get("images", [])
        row = {
            "id": product_id,
            "name": payload["name"].strip(),
            "category": payload.get("category", "").strip(),
            "price": float(payload.get("price") or 0),
            "stock": float(payload.get("stock") or 0),
            "images_json": json.dumps(images, ensure_ascii=False),
            "source": "app",
            "created_at": utc_now(),
        }
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO products(id, name, category, price, stock, images_json, source, created_at)
                VALUES(:id, :name, :category, :price, :stock, :images_json, :source, :created_at)
                """,
                row,
            )
            conn.commit()
        return self.snapshot()

    def create_invoice(self, payload: dict) -> dict:
        invoice_id = self.next_code("HD", "invoices")
        items = payload["items"]
        created_at = utc_now()
        with self.connect() as conn:
            customer = conn.execute("SELECT * FROM customers WHERE id = ?", (payload["customerId"],)).fetchone()
            if customer is None:
                raise ValueError("Khách hàng không tồn tại.")
            total = 0.0
            prepared_items = []
            for item in items:
                product = conn.execute("SELECT * FROM products WHERE id = ?", (item["productId"],)).fetchone()
                if product is None:
                    raise ValueError(f"Hàng hóa {item['productId']} không tồn tại.")
                quantity = float(item["quantity"])
                price = float(item["price"])
                line_total = quantity * price
                total += line_total
                prepared_items.append(
                    {
                        "invoice_id": invoice_id,
                        "product_id": product["id"],
                        "product_name": product["name"],
                        "quantity": quantity,
                        "price": price,
                        "line_total": line_total,
                    }
                )
                conn.execute("UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?", (quantity, product["id"]))

            conn.execute(
                """
                INSERT INTO invoices(id, created_at, customer_id, customer_name, total, paid_amount, note, status, source)
                VALUES(?, ?, ?, ?, ?, 0, ?, 'unpaid', 'app')
                """,
                (invoice_id, created_at, customer["id"], customer["name"], total, payload.get("note", "").strip()),
            )
            conn.executemany(
                """
                INSERT INTO invoice_items(invoice_id, product_id, product_name, quantity, price, line_total)
                VALUES(:invoice_id, :product_id, :product_name, :quantity, :price, :line_total)
                """,
                prepared_items,
            )
            conn.execute(
                "UPDATE customers SET lifetime_sales = lifetime_sales + ? WHERE id = ?",
                (total, customer["id"]),
            )
            conn.commit()
        return self.snapshot()

    def create_voucher(self, payload: dict) -> dict:
        voucher_type = payload["type"]
        voucher_id = self.next_code("PT" if voucher_type == "receipt" else "PC", "vouchers")
        created_at = utc_now()
        amount = float(payload.get("amount") or 0)
        with self.connect() as conn:
            customer_name = ""
            if payload.get("customerId"):
                customer = conn.execute("SELECT name FROM customers WHERE id = ?", (payload["customerId"],)).fetchone()
                customer_name = customer["name"] if customer else ""
            conn.execute(
                """
                INSERT INTO vouchers(id, type, created_at, customer_id, customer_name, invoice_id, amount, method, note)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    voucher_id,
                    voucher_type,
                    created_at,
                    payload.get("customerId", ""),
                    customer_name,
                    payload.get("invoiceId", ""),
                    amount,
                    payload.get("method", "Tiền mặt").strip(),
                    payload.get("note", "").strip(),
                ),
            )
            if voucher_type == "receipt" and payload.get("invoiceId"):
                invoice = conn.execute("SELECT total, paid_amount FROM invoices WHERE id = ?", (payload["invoiceId"],)).fetchone()
                if invoice is None:
                    raise ValueError("Hóa đơn không tồn tại.")
                new_paid = min(invoice["paid_amount"] + amount, invoice["total"])
                status = "paid" if new_paid >= invoice["total"] else "partial"
                conn.execute(
                    "UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?",
                    (new_paid, status, payload["invoiceId"]),
                )
            conn.commit()
        return self.snapshot()


DB = StoreDB(DB_PATH)


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/bootstrap":
            self.send_json(DB.snapshot())
            return
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "time": utc_now()})
            return
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/api/customers":
                self.send_json(DB.create_customer(payload))
                return
            if parsed.path == "/api/products":
                self.send_json(DB.create_product(payload))
                return
            if parsed.path == "/api/invoices":
                self.send_json(DB.create_invoice(payload))
                return
            if parsed.path == "/api/vouchers":
                self.send_json(DB.create_voucher(payload))
                return
            if parsed.path == "/api/reset":
                workbook = payload.get("xlsxPath") or str(DEFAULT_XLSX)
                self.send_json(DB.load_seed_from_excel(Path(workbook)))
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Không tìm thấy endpoint")
        except ValueError as exc:
            self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except FileNotFoundError as exc:
            self.send_json({"error": f"Không tìm thấy file: {exc}"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.send_json({"error": f"Lỗi nội bộ: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        return


def ensure_seeded() -> None:
    if DB.is_seeded():
        return
    DB.load_seed_from_excel(DEFAULT_XLSX)


def main() -> int:
    ensure_seeded()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AppHandler)
    print("302 Store Manager running at http://127.0.0.1:8000")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
