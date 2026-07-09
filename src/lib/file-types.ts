/**
 * 客户端/服务端共享的文件类型白名单（对齐 ChatGPT 网页常见格式）。
 * 不含 .doc（老 Word）：解析器不支持，避免假支持。
 */

export const IMAGE_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
] as const;

export const DOCUMENT_EXTS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
] as const;

export const CODE_EXTS = [
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".css",
  ".sql",
  ".sh",
  ".rb",
  ".php",
  ".vue",
  ".svelte",
] as const;

export const ALL_UPLOAD_EXTS = [
  ...IMAGE_EXTS,
  ...DOCUMENT_EXTS,
  ...CODE_EXTS,
] as const;

/** <input accept="..."> 字符串 */
export const FILE_ACCEPT = ALL_UPLOAD_EXTS.join(",");

export const FILE_ACCEPT_LABEL =
  "支持 PDF / Word / PPT / Excel / CSV / 文本 / 代码 / 图片";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

export function isImageExt(ext: string): boolean {
  return (IMAGE_EXTS as readonly string[]).includes(ext.toLowerCase());
}

export function isDocumentExt(ext: string): boolean {
  return (DOCUMENT_EXTS as readonly string[]).includes(ext.toLowerCase());
}

export function isCodeExt(ext: string): boolean {
  return (CODE_EXTS as readonly string[]).includes(ext.toLowerCase());
}

export function isAllowedUploadExt(ext: string): boolean {
  return (ALL_UPLOAD_EXTS as readonly string[]).includes(ext.toLowerCase());
}

/** 老 .doc 明确拒绝 */
export function isLegacyDoc(ext: string): boolean {
  return ext.toLowerCase() === ".doc";
}
