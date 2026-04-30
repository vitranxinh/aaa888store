#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

from extract_xlsx import XlsxReader, build_seed


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/vitran/Downloads/302.xlsx")
    seed = build_seed(XlsxReader(source).load())
    products = []
    for item in seed["products"]:
        products.append(
            {
                "sku": item["id"],
                "name": item["name"],
                "category": item.get("category") or "",
                "sellingPrice": item.get("price") or 0,
                "stock": item.get("stock") or 0,
                "imageUrl": item.get("images", [""])[0] if item.get("images") else "",
                "status": "ACTIVE",
                "description": f"Import từ Excel {source.name}",
            }
        )
    sys.stdout.write(json.dumps({"source": str(source), "count": len(products), "products": products}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
