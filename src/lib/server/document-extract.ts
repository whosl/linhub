import "server-only";

import ExcelJS from "exceljs";
import {
  CODE_EXTS,
  DOCUMENT_EXTS,
  extOf,
  isImageExt,
  isLegacyDoc,
} from "@/lib/file-types";
import { extractPptxTextFromBuffer } from "@/lib/server/pptx";
import { describeImageFromBuffer } from "@/lib/server/vision-describe";

export type ExtractContext = "chat" | "knowledge";

export type ExtractMethod =
  | "text"
  | "code"
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "csv"
  | "vision"
  | "unsupported";

export interface SpreadsheetSheetSummary {
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
  stats: Record<string, { min?: number; max?: number; mean?: number; numericCount: number }>;
}

export interface ExtractMeta {
  pages?: number;
  slides?: number;
  sheets?: SpreadsheetSheetSummary[];
  ocr?: boolean;
}

export interface ExtractResult {
  text: string;
  method: ExtractMethod;
  meta?: ExtractMeta;
}

const CHAT_MAX = 100_000;
const KNOWLEDGE_MAX = 500_000;
const SAMPLE_ROWS = 15;
const MAX_SHEET_ROWS_FOR_STATS = 5_000;

/** 用 magic bytes 验证图片真实类型 */
export function sniffImageExt(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return ".jpg";
  if (buffer.subarray(0, 6).toString("latin1") === "GIF87a") return ".gif";
  if (buffer.subarray(0, 6).toString("latin1") === "GIF89a") return ".gif";
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return ".webp";
  return null;
}

export function mimeFromImageExt(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function clamp(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（内容已截断）`;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
    if ("result" in value) return cellToString((value as { result: ExcelJS.CellValue }).result);
    if ("richText" in value) {
      const rt = (value as { richText: { text: string }[] }).richText;
      return rt.map((t) => t.text).join("");
    }
  }
  return String(value);
}

function summarizeMatrix(sheetName: string, rows: string[][]): SpreadsheetSheetSummary {
  const headers = (rows[0] ?? []).map((h, i) => h.trim() || `列${i + 1}`);
  const dataRows = rows.slice(1);
  const stats: SpreadsheetSheetSummary["stats"] = {};
  for (let c = 0; c < headers.length; c++) {
    const nums: number[] = [];
    for (const row of dataRows.slice(0, MAX_SHEET_ROWS_FOR_STATS)) {
      const raw = (row[c] ?? "").replace(/,/g, "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) nums.push(n);
    }
    if (nums.length === 0) {
      stats[headers[c]] = { numericCount: 0 };
    } else {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      stats[headers[c]] = { min, max, mean, numericCount: nums.length };
    }
  }
  return {
    name: sheetName,
    headers,
    rowCount: dataRows.length,
    sampleRows: dataRows.slice(0, SAMPLE_ROWS),
    stats,
  };
}

function sheetSummaryToMarkdown(summary: SpreadsheetSheetSummary): string {
  const lines: string[] = [
    `## Sheet: ${summary.name}`,
    `行数（不含表头）: ${summary.rowCount}`,
    `列: ${summary.headers.join(" | ")}`,
  ];
  const numericStats = Object.entries(summary.stats).filter(
    ([, s]) => s.numericCount > 0
  );
  if (numericStats.length) {
    lines.push("数值列统计:");
    for (const [col, s] of numericStats) {
      lines.push(
        `- ${col}: min=${s.min?.toFixed?.(4) ?? s.min}, max=${s.max?.toFixed?.(4) ?? s.max}, mean=${s.mean?.toFixed?.(4) ?? s.mean} (n=${s.numericCount})`
      );
    }
  }
  if (summary.sampleRows.length) {
    lines.push("");
    lines.push("| " + summary.headers.join(" | ") + " |");
    lines.push("| " + summary.headers.map(() => "---").join(" | ") + " |");
    for (const row of summary.sampleRows) {
      const cells = summary.headers.map((_, i) =>
        (row[i] ?? "").replace(/\|/g, "\\|").slice(0, 80)
      );
      lines.push("| " + cells.join(" | ") + " |");
    }
  }
  return lines.join("\n");
}

async function extractWorkbook(buffer: Buffer): Promise<ExtractResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 对 xls 支持有限；xlsx 为主。失败时抛错由上层处理。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheets: SpreadsheetSheetSummary[] = [];
  workbook.eachSheet((worksheet) => {
    const matrix: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (values.length < colNumber - 1) values.push("");
        values[colNumber - 1] = cellToString(cell.value);
      });
      matrix.push(values);
    });
    if (matrix.length === 0) {
      sheets.push({
        name: worksheet.name,
        headers: [],
        rowCount: 0,
        sampleRows: [],
        stats: {},
      });
      return;
    }
    sheets.push(summarizeMatrix(worksheet.name, matrix));
  });
  const text = sheets.map(sheetSummaryToMarkdown).join("\n\n");
  return { text, method: "xlsx", meta: { sheets } };
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line) => {
    // 简易 CSV：支持引号包裹
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function extractCsvLike(raw: string, delimiter: string, label: string): ExtractResult {
  const matrix = parseDelimited(raw, delimiter);
  const summary = summarizeMatrix(label, matrix);
  return {
    text: sheetSummaryToMarkdown(summary),
    method: "csv",
    meta: { sheets: [summary] },
  };
}

/**
 * 统一文档/表格/图片文本抽取。
 * 图片需传 userId 以走识图计费；其它格式可不传。
 */
export async function extractDocumentText(
  name: string,
  mimeType: string,
  buffer: Buffer,
  opts: {
    context: ExtractContext;
    userId?: string;
    maxChars?: number;
  }
): Promise<ExtractResult> {
  const ext = extOf(name);
  const max =
    opts.maxChars ?? (opts.context === "chat" ? CHAT_MAX : KNOWLEDGE_MAX);

  if (isLegacyDoc(ext)) {
    throw new Error("不支持旧版 .doc，请另存为 .docx 后上传");
  }

  // 图片：magic bytes 优先
  const sniffed = sniffImageExt(buffer);
  if (sniffed || isImageExt(ext) || mimeType.startsWith("image/")) {
    const imageExt = sniffed ?? (isImageExt(ext) ? ext : null);
    if (!imageExt) throw new Error("无法识别的图片格式");
    if (!opts.userId) throw new Error("识图需要登录用户");
    const mime = mimeFromImageExt(imageExt);
    const text = await describeImageFromBuffer(opts.userId, buffer, mime);
    if (!text) throw new Error("无法识别图片文字或内容");
    return {
      text: clamp(text, max),
      method: "vision",
      meta: { ocr: true },
    };
  }

  const lower = name.toLowerCase();

  if (ext === ".pdf" || mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const data = await parser.getText();
    await parser.destroy();
    return {
      text: clamp(data.text ?? "", max),
      method: "pdf",
      meta: { pages: data.total },
    };
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: clamp(result.value ?? "", max), method: "docx" };
  }

  if (ext === ".pptx") {
    const result = await extractPptxTextFromBuffer(buffer);
    return {
      text: clamp(result.text, max),
      method: "pptx",
      meta: { slides: result.slideCount },
    };
  }

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const result = await extractWorkbook(buffer);
      return { ...result, text: clamp(result.text, max) };
    } catch (e) {
      if (ext === ".xls") {
        throw new Error(
          "无法解析 .xls，请另存为 .xlsx 后上传" +
            (e instanceof Error ? `（${e.message}）` : "")
        );
      }
      throw e;
    }
  }

  if (ext === ".csv" || mimeType === "text/csv") {
    const raw = buffer.toString("utf-8");
    const result = extractCsvLike(raw, ",", "CSV");
    return { ...result, text: clamp(result.text, max) };
  }

  if (ext === ".tsv" || mimeType === "text/tab-separated-values") {
    const raw = buffer.toString("utf-8");
    const result = extractCsvLike(raw, "\t", "TSV");
    return { ...result, text: clamp(result.text, max) };
  }

  const isTextish =
    mimeType.startsWith("text/") ||
    (DOCUMENT_EXTS as readonly string[]).includes(ext) ||
    (CODE_EXTS as readonly string[]).includes(ext) ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".json") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".log");

  if (isTextish) {
    const text = buffer.toString("utf-8");
    const method: ExtractMethod = (CODE_EXTS as readonly string[]).includes(ext)
      ? "code"
      : "text";
    return { text: clamp(text, max), method };
  }

  throw new Error(`不支持的文件类型「${ext || "无扩展名"}」`);
}

/** 仅解析表格（供 analyze_spreadsheet 工具） */
export async function analyzeSpreadsheetBuffer(
  name: string,
  buffer: Buffer
): Promise<{ sheets: SpreadsheetSheetSummary[]; text: string }> {
  const ext = extOf(name);
  if (ext === ".csv") {
    const result = extractCsvLike(buffer.toString("utf-8"), ",", "CSV");
    return { sheets: result.meta?.sheets ?? [], text: result.text };
  }
  if (ext === ".tsv") {
    const result = extractCsvLike(buffer.toString("utf-8"), "\t", "TSV");
    return { sheets: result.meta?.sheets ?? [], text: result.text };
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const result = await extractWorkbook(buffer);
    return { sheets: result.meta?.sheets ?? [], text: result.text };
  }
  throw new Error("仅支持 .xlsx / .xls / .csv / .tsv");
}
