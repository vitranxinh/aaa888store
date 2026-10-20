import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ requireApiSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: {
  findUnique: mocks.findUnique, findFirst: mocks.findFirst,
  update: mocks.update, create: mocks.create
} } }));
vi.mock("@/lib/order-service", () => ({ nextCode: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { PUT, PATCH } from "@/app/api/customers/[id]/route";
import { POST } from "@/app/api/customers/route";

function request(body: unknown, method = "PUT") {
  return new Request("http://localhost/api/customers/customer-1", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "ADMIN" });
  mocks.findUnique.mockResolvedValue({ id: "customer-1" });
  mocks.findFirst.mockResolvedValue(null);
  mocks.update.mockResolvedValue({ id: "customer-1", name: "Updated customer" });
});

describe("customer debt editing is locked", () => {
  it.each(["openingDebt", "receivableDebt", "currentDebt", "oldDebt", "debtAmount"])(
    "rejects %s on update, including zero and null, before any database access", async (field) => {
      for (const value of [0, 1000, -1000, null]) {
        const response = await PUT(request({ name: "Customer", [field]: value }), { params: { id: "customer-1" } });
        expect(response.status).toBe(403);
      }
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it("blocks debt through PATCH and customer creation", async () => {
    expect((await PATCH(request({ isActive: true, openingDebt: 1 }, "PATCH"), { params: { id: "customer-1" } })).status).toBe(403);
    expect((await POST(request({ name: "Customer", openingDebt: 1 }, "POST"))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("still saves profile information without writing either debt field", async () => {
    const response = await PUT(request({ code: "KH001", name: "Updated customer" }), { params: { id: "customer-1" } });
    expect(response.status).toBe(200);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data.name).toBe("Updated customer");
    expect(data).not.toHaveProperty("openingDebt");
    expect(data).not.toHaveProperty("receivableDebt");
  });

  it("still allows hiding a customer", async () => {
    const response = await PATCH(request({ isActive: false }, "PATCH"), { params: { id: "customer-1" } });
    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });
});
