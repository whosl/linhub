import crypto from "node:crypto";

const keyHex = process.env.ENCRYPTION_KEY;

function getKey(): Buffer {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY 必须是 32 字节 hex（64 个字符）");
  }
  return Buffer.from(keyHex, "hex");
}

/** AES-256-GCM 加密（供应商密钥落库用） */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(secret: string): string {
  return secret.length <= 8
    ? "****"
    : `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
