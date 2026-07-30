import "server-only";

import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertUploadEnvelope,
  persistUploadedAttachment,
  UploadFileError,
  type UploadEnvelope,
} from "@/lib/server/upload";

export const UPLOAD_CHUNK_BYTES = 1024 * 1024;
const ID_PATTERN = /^upl-[a-f0-9]{16}$/u;
const STALE_UPLOAD_MILLIS = 24 * 60 * 60 * 1000;

interface ChunkedUploadManifest extends UploadEnvelope {
  id: string;
  chunkSize: number;
  chunkCount: number;
  createdAt: string;
}

function uploadRoot() {
  return path.resolve(process.cwd(), "data", "upload-chunks");
}

function uploadDirectory(id: string) {
  if (!ID_PATTERN.test(id)) throw new UploadFileError(404, "上传任务不存在");
  return path.join(uploadRoot(), id);
}

async function readOwnedManifest(id: string, ownerId: string) {
  const raw = await readFile(path.join(uploadDirectory(id), "manifest.json"), "utf8")
    .catch(() => null);
  if (!raw) throw new UploadFileError(404, "上传任务不存在");
  const manifest = JSON.parse(raw) as ChunkedUploadManifest;
  if (manifest.id !== id || manifest.ownerId !== ownerId) {
    throw new UploadFileError(404, "上传任务不存在");
  }
  return manifest;
}

async function cleanupStaleUploads() {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(
    entries.slice(0, 100).map(async (entry) => {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) return;
      const directory = uploadDirectory(entry.name);
      const raw = await readFile(path.join(directory, "manifest.json"), "utf8")
        .catch(() => null);
      let createdAt = Number.NaN;
      if (raw) {
        try {
          createdAt = Date.parse(
            (JSON.parse(raw) as Partial<ChunkedUploadManifest>).createdAt ?? ""
          );
        } catch {
          // 损坏的清单无法恢复，按陈旧任务清理，不能阻塞新的上传。
        }
      }
      if (!Number.isFinite(createdAt) || now - createdAt > STALE_UPLOAD_MILLIS) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      }
    })
  );
}

export async function beginChunkedUpload(input: UploadEnvelope) {
  await assertUploadEnvelope(input);
  await cleanupStaleUploads();
  const id = `upl-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const manifest: ChunkedUploadManifest = {
    ...input,
    id,
    chunkSize: UPLOAD_CHUNK_BYTES,
    chunkCount: Math.max(1, Math.ceil(input.size / UPLOAD_CHUNK_BYTES)),
    createdAt: new Date().toISOString(),
  };
  const directory = uploadDirectory(id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest),
    { flag: "wx" }
  );
  return { id, chunkSize: manifest.chunkSize, chunkCount: manifest.chunkCount };
}

export async function writeUploadChunk(
  id: string,
  ownerId: string,
  index: number,
  bytes: Buffer
) {
  const manifest = await readOwnedManifest(id, ownerId);
  if (!Number.isInteger(index) || index < 0 || index >= manifest.chunkCount) {
    throw new UploadFileError(400, "分块序号无效");
  }
  const expected = index === manifest.chunkCount - 1
    ? manifest.size - index * manifest.chunkSize
    : manifest.chunkSize;
  if (bytes.length !== expected) {
    throw new UploadFileError(400, "分块大小不正确");
  }
  const directory = uploadDirectory(id);
  const target = path.join(directory, `${index}.part`);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
  return { ok: true };
}

export async function completeChunkedUpload(id: string, ownerId: string) {
  const manifest = await readOwnedManifest(id, ownerId);
  const directory = uploadDirectory(id);
  const chunks = await Promise.all(
    Array.from({ length: manifest.chunkCount }, (_, index) =>
      readFile(path.join(directory, `${index}.part`)).catch(() => null)
    )
  );
  if (chunks.some((chunk) => chunk === null)) {
    throw new UploadFileError(409, "上传尚未完成，请重试缺失分块");
  }
  const bytes = Buffer.concat(chunks as Buffer[]);
  if (bytes.length !== manifest.size) {
    throw new UploadFileError(409, "上传文件大小校验失败");
  }
  try {
    return await persistUploadedAttachment({ ...manifest, bytes });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function cancelChunkedUpload(id: string, ownerId: string) {
  await readOwnedManifest(id, ownerId);
  await rm(uploadDirectory(id), { recursive: true, force: true });
  return { ok: true };
}
