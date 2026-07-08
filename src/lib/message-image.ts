import type { MessagePart } from "@/lib/types";

const EDITED_IMAGE_CAPTION_PREFIX = "图片已按你的描述编辑：";

function isImageCaptionText(text: string) {
  const value = text.trim();
  if (!value) return false;
  if (value.startsWith(EDITED_IMAGE_CAPTION_PREFIX)) return true;
  return /^(已生成|已为你生成|已经生成|图片已生成).*(图|图片|图像|图标|插画|海报|照片)/.test(
    value
  );
}

function editedImageCaption(editPrompt?: string) {
  const prompt = editPrompt?.trim();
  return prompt ? `${EDITED_IMAGE_CAPTION_PREFIX}${prompt}` : undefined;
}

export function replaceMessageImageParts(
  parts: MessagePart[],
  oldUrl: string,
  newUrl: string,
  editPrompt?: string
): { parts: MessagePart[]; replaced: boolean } {
  const imageIndex = parts.findIndex((part) => part.type === "image" && part.url === oldUrl);
  if (imageIndex === -1) return { parts, replaced: false };

  const caption = editedImageCaption(editPrompt);
  const next = parts.map((part, index) =>
    index === imageIndex && part.type === "image"
      ? { ...part, url: newUrl, alt: "编辑后的图片" }
      : part
  );

  if (!caption) return { parts: next, replaced: true };

  const nextPart = next[imageIndex + 1];
  if (nextPart?.type === "text" && isImageCaptionText(nextPart.text)) {
    return {
      parts: next.map((part, index) =>
        index === imageIndex + 1 && part.type === "text"
          ? { ...part, text: caption }
          : part
      ),
      replaced: true,
    };
  }

  const previousPart = next[imageIndex - 1];
  if (previousPart?.type === "text" && isImageCaptionText(previousPart.text)) {
    return {
      parts: next.map((part, index) =>
        index === imageIndex - 1 && part.type === "text"
          ? { ...part, text: caption }
          : part
      ),
      replaced: true,
    };
  }

  return {
    parts: [
      ...next.slice(0, imageIndex + 1),
      { type: "text", text: caption },
      ...next.slice(imageIndex + 1),
    ],
    replaced: true,
  };
}
