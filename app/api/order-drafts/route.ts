import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DraftPayload = {
  id?: string;
  branchId?: string;
  customerId?: string | null;
  draftData?: unknown;
};

function serializeDraft(draft: {
  id: string;
  branchId: string;
  customerId: string | null;
  draftData: Prisma.JsonValue;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; name: string; email: string } | null;
  branch?: { id: string; name: string } | null;
  customer?: { id: string; name: string; phone: string } | null;
}) {
  return {
    id: draft.id,
    branchId: draft.branchId,
    customerId: draft.customerId,
    draftData: draft.draftData,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    user: draft.user ?? null,
    branch: draft.branch ?? null,
    customer: draft.customer ?? null
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const { searchParams } = new URL(request.url);
    const latest = searchParams.get("latest") === "1";
    const includeBranch = searchParams.get("scope") === "branch" && (session.role === "ADMIN" || session.role === "MANAGER");
    const branchId = searchParams.get("branchId")?.trim() || session.branchId || undefined;
    const take = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

    const where: Prisma.OrderDraftWhereInput = {
      status: "DRAFT",
      ...(includeBranch ? { branchId: branchId ?? undefined } : { userId: actorUserId })
    };

    const drafts = await prisma.orderDraft.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        customerId: true,
        draftData: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: latest ? 1 : take
    });

    if (latest) {
      return NextResponse.json(drafts[0] ? serializeDraft(drafts[0]) : null);
    }

    return NextResponse.json(drafts.map(serializeDraft));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Bạn không có quyền thao tác" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể tải bản nháp" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const body = (await request.json()) as DraftPayload;
    const branchId = body.branchId?.trim() || session.branchId || "";

    if (!branchId) {
      return NextResponse.json({ error: "Thiếu chi nhánh để lưu nháp" }, { status: 400 });
    }

    const data = (body.draftData ?? {}) as Prisma.InputJsonValue;
    const customerId = body.customerId?.trim() || null;

    if (body.id) {
      const existing = await prisma.orderDraft.findUnique({
        where: { id: body.id },
        select: { userId: true, status: true }
      });
      if (!existing || existing.status !== "DRAFT") {
        return NextResponse.json({ error: "Không tìm thấy bản nháp" }, { status: 404 });
      }
      if (existing.userId !== actorUserId && session.role !== "ADMIN" && session.role !== "MANAGER") {
        return NextResponse.json({ error: "Bạn không có quyền sửa bản nháp này" }, { status: 403 });
      }

      const draft = await prisma.orderDraft.update({
        where: { id: body.id },
        data: { branchId, customerId, draftData: data },
        select: {
          id: true,
          branchId: true,
          customerId: true,
          draftData: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } }
        }
      });
      return NextResponse.json(serializeDraft(draft));
    }

    const draft = await prisma.orderDraft.create({
      data: {
        userId: actorUserId,
        branchId,
        customerId,
        draftData: data,
        status: "DRAFT"
      },
      select: {
        id: true,
        branchId: true,
        customerId: true,
        draftData: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } }
      }
    });

    return NextResponse.json(serializeDraft(draft));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Bạn không có quyền thao tác" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể lưu bản nháp" },
      { status: 500 }
    );
  }
}
