const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const THEMATIC_BREAK = /^ {0,3}-{3,}[\t ]*$/;
const EXPLICIT_BLOCKQUOTE = /^ {0,3}>/;
const FRONTMATTER_FIELD = /^[A-Za-z0-9_-]+:[\t ]*/;
const SANDBOX_ATTACHMENT_URL = /^sandbox:(\/api\/attachments\/att-[a-z0-9]{16})$/u;

/** 只把 LinHub 自己生成的附件伪协议收敛为同源下载地址。 */
export function normalizeTrustedLinHubUrl(source: string): string {
  return SANDBOX_ATTACHMENT_URL.exec(source)?.[1] ?? source;
}

/**
 * LinHub 的 Markdown 产品约定：正文中的独占连字符线始终表示分隔线，
 * 只有显式以 `>` 开头的行属于引用块。
 *
 * CommonMark 会把紧贴上一段的 `---` 当作 Setext 二级标题下划线，
 * 导致模型少输出一个空行时整段文字意外放大。这里仅在围栏代码块外
 * 为这些容易误合并的块边界补上必要空行；表格、代码和 frontmatter 保持不变。
 */
export function normalizeMarkdownBlockBoundaries(source: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const normalized: string[] = [];
  const possibleFrontmatterEnd =
    lines[0]?.trim() === "---"
      ? lines.slice(1).findIndex((line) => line.trim() === "---") + 1
      : -1;
  const firstFrontmatterField = lines
    .slice(1, possibleFrontmatterEnd)
    .find((line) => line.trim() && !line.trimStart().startsWith("#"));
  const frontmatterEnd =
    possibleFrontmatterEnd > 1 &&
    !!firstFrontmatterField &&
    FRONTMATTER_FIELD.test(firstFrontmatterField)
      ? possibleFrontmatterEnd
      : -1;
  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;
  let previousWasExplicitBlockquote = false;

  for (const [index, line] of lines.entries()) {
    if (index <= frontmatterEnd) {
      normalized.push(line);
      previousWasExplicitBlockquote = false;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fenceMarker) {
      normalized.push(line);
      previousWasExplicitBlockquote = false;
      const trimmed = line.trim();
      if (
        trimmed.length >= fenceLength &&
        trimmed.split("").every((char) => char === fenceMarker)
      ) {
        fenceMarker = null;
        fenceLength = 0;
      }
      continue;
    }

    const isExplicitBlockquote = EXPLICIT_BLOCKQUOTE.test(line);
    if (!isExplicitBlockquote && line.trim() && previousWasExplicitBlockquote) {
      normalized.push("");
    }

    if (fence) {
      const marker = fence[1];
      fenceMarker = marker[0] as "`" | "~";
      fenceLength = marker.length;
      normalized.push(line);
      previousWasExplicitBlockquote = false;
      continue;
    }

    if (THEMATIC_BREAK.test(line) && normalized.at(-1)?.trim()) {
      normalized.push("");
    }
    normalized.push(line);
    previousWasExplicitBlockquote = isExplicitBlockquote;
  }

  return normalized.join(newline);
}
