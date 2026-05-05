CREATE TABLE "CodeSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSequence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CodeSequence_model_prefix_idx" ON "CodeSequence"("model", "prefix");
