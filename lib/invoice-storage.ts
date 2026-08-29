import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { put } from "@vercel/blob";
import { formatInvoiceBlobDateFolder } from "@/lib/utils";

type UploadInvoicePdfInput = {
  orderId: string;
  orderCode: string;
  createdAt: Date;
  pdfBuffer: Buffer;
  pdfFileName: string;
  generatedAt: Date;
};

type ReadInvoicePdfInput = {
  orderId: string;
  orderCode: string;
  createdAt: Date;
  pdfFileName: string;
};

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function getR2Config() {
  const accountId = envValue("CLOUDFLARE_R2_ACCOUNT_ID", "R2_ACCOUNT_ID");
  const bucket = envValue("CLOUDFLARE_R2_BUCKET", "R2_BUCKET");
  const accessKeyId = envValue("CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = envValue("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const publicBaseUrl = envValue("CLOUDFLARE_R2_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const endpoint = envValue("CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const hasAny = Boolean(accountId || bucket || accessKeyId || secretAccessKey || endpoint);
  const isComplete = Boolean(bucket && endpoint && accessKeyId && secretAccessKey);

  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint, publicBaseUrl, hasAny, isComplete };
}

function shouldUseR2() {
  const provider = envValue("INVOICE_STORAGE_PROVIDER", "INVOICE_OBJECT_STORAGE").toLowerCase();
  const r2 = getR2Config();
  return provider === "r2" || (!provider && r2.isComplete);
}

function getR2Client() {
  const config = getR2Config();
  if (!config.isComplete) {
    throw new Error("Thiếu cấu hình Cloudflare R2 cho lưu trữ PDF hóa đơn");
  }

  return {
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
    client: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: true
    })
  };
}

export function getInvoiceStorageKey(input: ReadInvoicePdfInput) {
  return `invoices/${formatInvoiceBlobDateFolder(input.createdAt)}/${input.orderId}-${input.pdfFileName}`;
}

export async function uploadInvoicePdf(input: UploadInvoicePdfInput) {
  const key = getInvoiceStorageKey(input);

  if (shouldUseR2()) {
    const r2 = getR2Client();
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: input.pdfBuffer,
        ContentType: "application/pdf",
        CacheControl: "private, max-age=60"
      })
    );

    return {
      url: r2.publicBaseUrl ? `${r2.publicBaseUrl}/${key}?v=${input.generatedAt.getTime()}` : `/api/orders/${input.orderId}/pdf/file?v=${input.generatedAt.getTime()}`,
      storageProvider: "r2" as const
    };
  }

  const r2 = getR2Config();
  if (r2.hasAny) {
    throw new Error("Cấu hình Cloudflare R2 chưa đủ, chưa thể lưu PDF hóa đơn");
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[PDF] Skipping PDF upload because no invoice object storage is configured.");
    return null;
  }

  const blob = await put(key, input.pdfBuffer, {
    access: "private",
    contentType: "application/pdf",
    allowOverwrite: true,
    cacheControlMaxAge: 60
  });

  return {
    url: `${blob.url}?v=${input.generatedAt.getTime()}`,
    storageProvider: "vercel-blob" as const
  };
}

export async function readInvoicePdf(input: ReadInvoicePdfInput) {
  const r2 = getR2Client();
  const object = await r2.client.send(
    new GetObjectCommand({
      Bucket: r2.bucket,
      Key: getInvoiceStorageKey(input)
    })
  );

  const body = object.Body;
  if (!body) {
    throw new Error("Không đọc được file PDF hóa đơn từ R2");
  }

  const bytes = await body.transformToByteArray();
  return {
    bytes,
    contentType: object.ContentType || "application/pdf",
    contentLength: object.ContentLength ?? bytes.byteLength
  };
}
