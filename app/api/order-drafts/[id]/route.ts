import { NextResponse } from "next/server";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertDraftAccess(id: string, actorUserId: string, role: string) {
  const draft = await prisma.orderDraft.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
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

  if (!draft || draft.status !== "DRAFT") return null;
  if (draft.userId !== actorUserId && role !== "ADMIN" && role !== "MANAGER") {
    throw new Error("FORBIDDEN");
  }
  return draft;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const draft = await assertDraftAccess(params.id, actorUserId, session.role);
    if (!draft) return NextResponse.json({ error: "Không tìm thấy bản nháp" }, { status: 404 });
    return NextResponse.json({
      ...draft,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Bạn không có quyền xem bản nháp này" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể tải bản nháp" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const draft = await prisma.orderDraft.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, status: true }
    });

    if (!draft) return NextResponse.json({ ok: true, alreadyDeleted: true });
    if (draft.userId !== actorUserId && session.role !== "ADMIN" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Bạn không có quyền xóa bản nháp này" }, { status: 403 });
    }
    if (draft.status !== "DRAFT") {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    await prisma.orderDraft.update({
      where: { id: params.id },
      data: { status: "DELETED" }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Bạn không có quyền xóa bản nháp này" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể xóa bản nháp" }, { status: 500 });
  }
}
