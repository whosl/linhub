// Composer 待发送附件:选择/拖入即上传,维护每项的状态机(uploading → done | error)
// 图片项用 URL.createObjectURL 本地预览;发送时把 done 项转成 SendPayload 的 images/attachments

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile, type UploadedAttachment } from "@/api/upload";
import type { FilePart, ImagePart } from "@/api/types";
import { toast } from "@/components/ui/toast";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export interface PendingAttachment {
  key: string;
  file: File;
  /** 图片本地预览 object URL(仅 image/*) */
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  uploaded?: UploadedAttachment;
}

export interface AttachmentsPayload {
  images?: ImagePart[];
  attachments?: FilePart[];
}

let nextKey = 1;

export function useAttachments(projectId?: string) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  // 卸载/清空时统一 revoke 预览 URL;事件回调里通过 ref 读最新值
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((key: string, partial: Partial<PendingAttachment>) => {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...partial } : it)),
    );
  }, []);

  const startUpload = useCallback(
    (key: string, file: File) => {
      patch(key, { status: "uploading", uploaded: undefined });
      uploadFile(file, projectId)
        .then((uploaded) => patch(key, { status: "done", uploaded }))
        .catch((err: unknown) => {
          patch(key, { status: "error" });
          toast.error(
            `${file.name} 上传失败:${err instanceof Error ? err.message : "请稍后重试"}`,
          );
        });
    },
    [patch, projectId],
  );

  const add = useCallback(
    (files: Iterable<File>) => {
      const accepted: PendingAttachment[] = [];
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} 超过 20MB 限制,未添加`);
          continue;
        }
        accepted.push({
          key: `att-${nextKey++}`,
          file,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
          status: "uploading",
        });
      }
      if (accepted.length === 0) return;
      setItems((prev) => [...prev, ...accepted]);
      for (const item of accepted) {
        startUpload(item.key, item.file);
      }
    },
    [startUpload],
  );

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (!item || item.status !== "error") return;
      startUpload(key, item.file);
    },
    [startUpload],
  );

  const remove = useCallback((key: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    for (const it of itemsRef.current) {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    }
    setItems([]);
  }, []);

  /** 已上传成功项 → 发送 payload(图片走 images,其余走 attachments) */
  const toPayload = useCallback((): AttachmentsPayload => {
    const done = itemsRef.current.filter(
      (it): it is PendingAttachment & { uploaded: UploadedAttachment } =>
        it.status === "done" && !!it.uploaded,
    );
    const images: ImagePart[] = done
      .filter((it) => it.uploaded.mimeType.startsWith("image/") && !!it.uploaded.url)
      .map((it) => ({
        type: "image",
        url: it.uploaded.url!,
        mediaAssetId: it.uploaded.mediaAssetId,
      }));
    const attachments: FilePart[] = done
      .filter((it) => !(it.uploaded.mimeType.startsWith("image/") && !!it.uploaded.url))
      .map((it) => ({
        type: "file",
        attachmentId: it.uploaded.id,
        name: it.uploaded.name,
        mimeType: it.uploaded.mimeType,
        size: it.uploaded.size,
        url: it.uploaded.url,
      }));
    return {
      images: images.length > 0 ? images : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }, []);

  const uploading = items.some((it) => it.status === "uploading");

  return { items, uploading, add, retry, remove, clear, toPayload };
}
