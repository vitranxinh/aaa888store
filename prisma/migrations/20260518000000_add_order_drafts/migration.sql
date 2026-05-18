-- CreateEnum
CREATE TYPE "OrderDraftStatus" AS ENUM ('DRAFT', 'COMPLETED', 'DELETED');

-- CreateTable
CREATE TABLE "OrderDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "draftData" JSONB NOT NULL,
    "status" "OrderDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "completedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderDraft_userId_status_updatedAt_idx" ON "OrderDraft"("userId", "status", "updatedAt");
CREATE INDEX "OrderDraft_branchId_status_updatedAt_idx" ON "OrderDraft"("branchId", "status", "updatedAt");
CREATE INDEX "OrderDraft_customerId_idx" ON "OrderDraft"("customerId");
CREATE INDEX "OrderDraft_completedOrderId_idx" ON "OrderDraft"("completedOrderId");

-- AddForeignKey
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_completedOrderId_fkey" FOREIGN KEY ("completedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
