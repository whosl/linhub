import "server-only";

import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { db, schema } from "@/lib/server/db";

export interface PptxSlideText {
  index: number;
  title?: string;
  texts: string[];
  notes: string[];
}

export interface PptxCreateSlide {
  title: string;
  bullets?: string[];
  body?: string;
  notes?: string;
}

const DATA_UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export function localAttachmentPath(storagePath: string) {
  const filename = path.basename(storagePath);
  if (!filename || filename === "." || filename === "..") return null;
  if (storagePath.startsWith("data/uploads/")) return path.join(DATA_UPLOADS_DIR, filename);
  if (storagePath.startsWith("/uploads/")) {
    return path.join(process.cwd(), "public", "uploads", filename);
  }
  return null;
}

export async function extractPptxTextFromBuffer(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(comparePptxPartNames);
  const slides: PptxSlideText[] = [];
  for (const slideName of slideNames) {
    const slideXml = await zip.files[slideName].async("string");
    const texts = extractTextRuns(slideXml);
    const index = slides.length + 1;
    const notes = await extractNotesForSlide(zip, index);
    slides.push({
      index,
      title: inferSlideTitle(texts),
      texts,
      notes,
    });
  }
  return {
    slideCount: slides.length,
    slides,
    text: formatPptxSlides(slides),
  };
}

export async function analyzePptxTemplate(buffer: Buffer) {
  const extracted = await extractPptxTextFromBuffer(buffer);
  const layouts = extracted.slides.map((slide) => ({
    index: slide.index,
    title: slide.title ?? `第 ${slide.index} 页`,
    textBlockCount: slide.texts.length,
    hasNotes: slide.notes.length > 0,
    sampleText: slide.texts.slice(0, 5).join(" / ").slice(0, 200),
  }));
  return {
    slideCount: extracted.slideCount,
    layouts,
    text: [
      `模板共 ${extracted.slideCount} 页。`,
      ...layouts.map(
        (slide) =>
          `第 ${slide.index} 页：${slide.title}；文本块 ${slide.textBlockCount} 个${slide.hasNotes ? "；含备注" : ""}`
      ),
    ].join("\n"),
  };
}

export async function createPptxDeck(options: {
  ownerId: string;
  title: string;
  slides: PptxCreateSlide[];
}) {
  const pptxModule = await import("pptxgenjs");
  const PptxGenJS = pptxModule.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "LinHub";
  pptx.subject = options.title;
  pptx.title = options.title;
  pptx.company = "LinHub";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  const slides = options.slides.length > 0 ? options.slides : [{ title: options.title }];
  slides.slice(0, 80).forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: index === 0 ? "F7FAFC" : "FFFFFF" };
    slide.addText(item.title || `第 ${index + 1} 页`, {
      x: 0.55,
      y: 0.38,
      w: 12.2,
      h: 0.55,
      fontFace: "Aptos Display",
      fontSize: index === 0 ? 30 : 24,
      bold: true,
      color: "14213D",
      margin: 0,
      breakLine: false,
    });
    const bullets = normalizeBullets(item);
    if (bullets.length > 0) {
      slide.addText(
        bullets.map((text) => ({ text, options: { bullet: { indent: 18 }, hanging: 4 } })),
        {
          x: 0.82,
          y: index === 0 ? 1.55 : 1.25,
          w: 11.2,
          h: 4.7,
          fontSize: 17,
          color: "27364A",
          breakLine: false,
          fit: "shrink",
          valign: "top",
          paraSpaceAfter: 10,
        }
      );
    } else if (index === 0) {
      slide.addText("由 LinHub 生成", {
        x: 0.65,
        y: 1.45,
        w: 7,
        h: 0.4,
        fontSize: 16,
        color: "52616F",
      });
    }
    slide.addShape(pptx.ShapeType.line, {
      x: 0.55,
      y: 6.82,
      w: 12.2,
      h: 0,
      line: { color: "D8DEE9", width: 1 },
    });
    slide.addText(`${index + 1}`, {
      x: 12.1,
      y: 6.9,
      w: 0.5,
      h: 0.2,
      fontSize: 8,
      color: "718096",
      align: "right",
      margin: 0,
    });
    if (item.notes?.trim()) slide.addNotes(item.notes.trim());
  });

  await mkdir(DATA_UPLOADS_DIR, { recursive: true });
  const id = `att-${uid()}`;
  const safeTitle = options.title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "") || "linhub-presentation";
  const filename = `${id}-${safeTitle}.pptx`;
  const outPath = path.join(DATA_UPLOADS_DIR, filename);
  await pptx.writeFile({ fileName: outPath });
  const size = (await stat(outPath)).size;
  await db.insert(schema.attachments).values({
    id,
    ownerId: options.ownerId,
    name: `${safeTitle}.pptx`,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size,
    storagePath: `data/uploads/${filename}`,
    extractedText: formatPptxSlides(
      slides.map((slide, index) => ({
        index: index + 1,
        title: slide.title,
        texts: [slide.title, ...normalizeBullets(slide)].filter(Boolean),
        notes: slide.notes ? [slide.notes] : [],
      }))
    ),
  });
  return {
    id,
    name: `${safeTitle}.pptx`,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size,
    url: `/api/attachments/${id}`,
    slideCount: slides.length,
  };
}

export async function extractPptxAttachmentText(storagePath: string) {
  const filePath = localAttachmentPath(storagePath);
  if (!filePath) throw new Error("附件路径不可读取");
  return extractPptxTextFromBuffer(await readFile(filePath));
}

function normalizeBullets(slide: PptxCreateSlide) {
  const fromBullets = (slide.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const fromBody = slide.body
    ? slide.body
        .split(/\n+/)
        .map((b) => b.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
    : [];
  return [...fromBullets, ...fromBody].slice(0, 10);
}

function extractNotesForSlide(zip: JSZip, slideIndex: number) {
  const notesFile = zip.files[`ppt/notesSlides/notesSlide${slideIndex}.xml`];
  if (!notesFile) return Promise.resolve<string[]>([]);
  return notesFile.async("string").then(extractTextRuns).catch(() => []);
}

function extractTextRuns(xml: string) {
  const runs = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (match) =>
    decodeXml(match[1]).trim()
  ).filter(Boolean);
  return runs.length > 0
    ? runs
    : Array.from(xml.matchAll(/<[^:>]*:t>([\s\S]*?)<\/[^:>]*:t>/g), (match) =>
        decodeXml(match[1]).trim()
      ).filter(Boolean);
}

function inferSlideTitle(texts: string[]) {
  return texts.find((text) => text.length > 0 && text.length <= 90) ?? texts[0];
}

function formatPptxSlides(slides: PptxSlideText[]) {
  return slides
    .map((slide) => {
      const title = slide.title ? `：${slide.title}` : "";
      const body = slide.texts.map((text) => `- ${text}`).join("\n");
      const notes =
        slide.notes.length > 0 ? `\n备注：\n${slide.notes.map((n) => `- ${n}`).join("\n")}` : "";
      return `## 第 ${slide.index} 页${title}\n${body}${notes}`;
    })
    .join("\n\n");
}

function comparePptxPartNames(a: string, b: string) {
  return partNumber(a) - partNumber(b);
}

function partNumber(name: string) {
  return Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}
