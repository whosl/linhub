import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";

export async function persistGeneratedAttachment(input: {
  ownerId: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
  extractedText?: string;
}) {
  const root = path.resolve(process.cwd(), "data", "uploads");
  await mkdir(root, { recursive: true });
  const id = `att-${uid()}`;
  const safeName = sanitizeFilename(input.name);
  const storedName = `${id}-${safeName}`;
  const target = path.join(root, storedName);
  await writeFile(target, input.bytes, { flag: "wx" });
  await db.insert(schema.attachments).values({
    id,
    ownerId: input.ownerId,
    name: safeName,
    mimeType: input.mimeType,
    size: input.bytes.length,
    storagePath: `data/uploads/${storedName}`,
    extractedText: input.extractedText?.slice(0, 100_000),
  });
  return {
    id,
    name: safeName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
    url: `/api/attachments/${id}`,
  };
}

function sanitizeFilename(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|\u0000-\u001F]+/gu, "-")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 120) || "generated-file"
  );
}

function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
