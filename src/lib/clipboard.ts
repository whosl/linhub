"use client";

export async function copyTextToClipboard(text: string) {
  let writeError: unknown;

  for (const candidate of getClipboardNavigators()) {
    try {
      await candidate.clipboard.writeText(text);
      return;
    } catch (error) {
      writeError = error;
    }
  }

  if (typeof document.execCommand !== "function") {
    throw writeError instanceof Error ? writeError : new Error("复制失败");
  }

  const textarea = document.createElement("textarea");
  const selection = document.getSelection();
  const selectedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    if (!copied) {
      throw writeError instanceof Error ? writeError : new Error("复制失败");
    }
  } finally {
    textarea.remove();
    if (selectedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  }
}

function getClipboardNavigators() {
  const candidates: Navigator[] = [];
  const seen = new Set<Navigator>();

  const add = (candidate: Navigator | undefined) => {
    if (!candidate?.clipboard?.writeText || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  add(window.navigator);

  try {
    add(window.parent?.navigator);
  } catch {
    // 跨域 frame 不能读取父级 navigator，忽略后继续尝试其它方案。
  }

  try {
    add(window.top?.navigator);
  } catch {
    // 同上。
  }

  return candidates;
}
