import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ requireApiSession: vi.fn().mockResolvedValue({ role: "ADMIN" }) }));
vi.mock("node:child_process", () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: async () => ({ stdout: JSON.stringify({
      source: "test.xlsx", count: 1,
      customers: [{ code: "KH001", name: "Imported customer", phone: "", address: "", note: "", openingDebt: 999999 }]
    }) })
  })
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: async (callback: (tx: unknown) => unknown) => callback({ customer: mocks })
} }));
import { POST } from "@/app/api/customers/import/route";

beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue(null); });
function request() {
  return new Request("http://localhost/api/customers/import", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xlsxPath: "/tmp/test.xlsx" })
  });
}

describe("Excel import cannot adjust customer debt", () => {
  it("updates an existing customer without resetting or importing debt", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing", code: "KH001" });
    expect((await POST(request())).status).toBe(200);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data.name).toBe("Imported customer");
    expect(data).not.toHaveProperty("openingDebt");
    expect(data).not.toHaveProperty("receivableDebt");
  });

  it("starts a new customer at zero regardless of spreadsheet debt", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ openingDebt: 0, receivableDebt: 0 });
  });
});
