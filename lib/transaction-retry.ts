import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function isRetryablePrismaTransactionError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeCode = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const maybeMessage = error instanceof Error ? error.message : String(error);

  return (
    maybeCode === "P2028" ||
    /Transaction already closed/i.test(maybeMessage) ||
    /expired transaction/i.test(maybeMessage) ||
    /timed out/i.test(maybeMessage)
  );
}

export async function runTransactionWithRetry<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait?: number; timeout?: number } = { maxWait: 10000, timeout: 30000 },
  maxAttempts = 2
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryablePrismaTransactionError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}
