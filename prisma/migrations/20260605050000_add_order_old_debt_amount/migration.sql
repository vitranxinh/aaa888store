ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "oldDebtAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

UPDATE "Order"
SET "oldDebtAmount" = GREATEST("paidAmount" + "debtAmount" - "grandTotal", 0)
WHERE "oldDebtAmount" = 0
  AND ("paidAmount" + "debtAmount") > "grandTotal";
