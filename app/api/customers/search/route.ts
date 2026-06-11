import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareSearchResults, getSearchScore } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayCustomerPhone(phone: string | null) {
  return phone?.startsWith("AUTO_PHONE_") ? "" : phone;
}

type CustomerCandidate = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  receivableDebt: unknown;
};

function buildCustomerSuggestions(customers: CustomerCandidate[], query: string) {
  return customers
    .map((customer) => {
      const phone = displayCustomerPhone(customer.phone);
      return {
        customer: { ...customer, phone },
        score: getSearchScore(`${customer.name} ${customer.code} ${phone ?? ""}`, query)
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      compareSearchResults(
        { label: a.customer.name, score: a.score, searchText: `${a.customer.name} ${a.customer.code} ${a.customer.phone ?? ""}` },
        { label: b.customer.name, score: b.score, searchText: `${b.customer.name} ${b.customer.code} ${b.customer.phone ?? ""}` },
        query
      )
    );
}

export async function GET(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

    if (!query) {
      return NextResponse.json([]);
    }

    const customers = await prisma.customer.findMany({
      where: {
        NOT: { code: "KH000000" },
        isActive: true,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { code: { contains: query, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        name: true,
        code: true,
        phone: true,
        receivableDebt: true
      },
      orderBy: { name: "asc" },
      take: 200
    });

    let rankedCustomers = buildCustomerSuggestions(customers, query);

    if (rankedCustomers.length < limit) {
      const fallbackCustomers = await prisma.customer.findMany({
        where: {
          NOT: { code: "KH000000" },
          isActive: true
        },
        select: {
          id: true,
          name: true,
          code: true,
          phone: true,
          receivableDebt: true
        },
        orderBy: { name: "asc" },
        take: 1000
      });

      const uniqueCustomers = Array.from(
        new Map(
          [...customers, ...fallbackCustomers].map((customer) => [
            customer.id,
            customer
          ])
        ).values()
      );

      rankedCustomers = buildCustomerSuggestions(uniqueCustomers, query);
    }

    const results = rankedCustomers
      .slice(0, limit)
      .map((entry) => ({
        id: entry.customer.id,
        label: entry.customer.name,
        value: entry.customer.name,
        receivableDebt: Number(entry.customer.receivableDebt ?? 0),
        meta: [entry.customer.code, entry.customer.phone].filter(Boolean).join(" • "),
        accent: entry.customer.code,
        searchText: entry.customer.name
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
