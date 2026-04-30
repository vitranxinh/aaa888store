#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

from extract_xlsx import XlsxReader, build_seed


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/vitran/Downloads/302.xlsx")
    seed = build_seed(XlsxReader(source).load())
    customers = []

    for item in seed["customers"]:
        customers.append(
            {
                "code": item.get("id") or "",
                "name": item.get("name") or "",
                "phone": item.get("phone") or "",
                "address": item.get("address") or "",
                "note": item.get("note") or "",
                "openingDebt": item.get("openingDebt") or 0,
            }
        )

    sys.stdout.write(json.dumps({"source": str(source), "count": len(customers), "customers": customers}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
