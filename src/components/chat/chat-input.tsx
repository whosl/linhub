"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  ArrowUpIcon,
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  StarIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { FILE_ACCEPT } from "@/lib/file-types";
import type {
  ChatStyle,
  ChatToolToggles,
  FilePart,
  ImagePart,
  KnowledgeBase,
  McpServer,
  Model,
  Project,
  Skill,
} from "@/lib/types";
import { getDataService } from "@/lib/data";
import { ImageMaskEditor } from "./image-mask-editor";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { toast } from "sonner";

export interface ComposerState {
  modelId: string;
  styleId: string;
  extendedThinking: boolean;
  tools: ChatToolToggles;
}

/** 模型选择器里的供应商分组标签 */
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  zhipu: "智谱",
  deepseek: "DeepSeek",
  xiaomi: "小米",
  "xiaomi-token-plan": "小米 (Token Plan)",
};

export function ChatInput({
  models,
  styles,
  composer,
  onComposerChange,
  quotedText,
  onClearQuote,
  isStreaming,
  onSend,
  onStop,
  autoFocus,
  defaultModelId,
  onSetDefaultModel,
  knowledgeBases = [],
  activeProject,
  activeSkill,
}: {
  models: Model[];
  styles: ChatStyle[];
  knowledgeBases?: KnowledgeBase[];
  activeProject?: Project | null;
  composer: ComposerState;
  onComposerChange: (patch: Partial<ComposerState>) => void;
  quotedText?: string;
  onClearQuote?: () => void;
  isStreaming: boolean;
  onSend: (text: string, images: ImagePart[], files: FilePart[]) => void;
  onStop: () => void;
  autoFocus?: boolean;
  /** 当前用户的默认模型 id（用于在选择器里标记 + 设为默认） */
  defaultModelId?: string;
  /** 把指定模型设为用户默认 */
  onSetDefaultModel?: (modelId: string) => void;
  activeSkill?: Skill;
}) {
  const [text, setText] = React.useState("");
  const [images, setImages] = React.useState<ImagePart[]>([]);
  const [files, setFiles] = React.useState<FilePart[]>([]);
  const [recording, setRecording] = React.useState(false);
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false);
  const [pendingUploadCount, setPendingUploadCount] = React.useState(0);
  // 图片编辑器：记录当前要编辑的图片 URL。
  const [editingImage, setEditingImage] = React.useState<string | null>(null);
  const knowledgeScopeHintId = React.useId();
  const mcpScopeHintId = React.useId();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageEditInputRef = React.useRef<HTMLInputElement>(null);
  const pendingUploadCountRef = React.useRef(0);
  // C4: 追踪本地创建的 blob URL（服务端返回的 url 不应 revoke），卸载时统一释放。
  const localBlobUrls = React.useRef<Set<string>>(new Set());
  const [mcpServers, setMcpServers] = React.useState<McpServer[]>([]);
  const hasPptxFile = files.some((file) => file.name.toLowerCase().endsWith(".pptx"));
  const isPptxSkill =
    activeSkill?.id === "skill-pptx-native" ||
    !!activeSkill?.requiredTools.some((tool) => String(tool).startsWith("pptx_"));
  const revokeUrl = React.useCallback((url?: string) => {
    if (url && localBlobUrls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);
  const revokeAllUrls = React.useCallback(() => {
    localBlobUrls.current.forEach((u) => URL.revokeObjectURL(u));
    localBlobUrls.current.clear();
  }, []);
  React.useEffect(() => () => revokeAllUrls(), [revokeAllUrls]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ds = getDataService();
        const [userServers, globalServers] = await Promise.all([
          ds.listMcpServers("user"),
          ds.listMcpServers("global"),
        ]);
        if (!cancelled) {
          setMcpServers(
            [...globalServers, ...userServers].filter((s) => s.enabled)
          );
        }
      } catch {
        // MCP 列表拉取失败时静默忽略，工具面板仍可用
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));
  const currentModel =
    chatModels.find((m) => m.id === composer.modelId) ??
    (defaultModelId ? chatModels.find((m) => m.id === defaultModelId) : undefined);
  const currentStyle = styles.find((s) => s.id === composer.styleId);
  const knowledgeSearchEnabled = composer.tools.knowledgeSearch ?? true;
  const selectedKnowledgeBaseIds = composer.tools.knowledgeBaseIds ?? [];
  const projectKnowledgeBaseCount = activeProject?.knowledgeBaseIds.length ?? 0;
  const projectFileCount = activeProject?.files.length ?? 0;
  const selectedMcpServerIds = composer.tools.mcpServerIds ?? [];
  const knowledgeScopeText = !knowledgeSearchEnabled
    ? "已关闭"
    : selectedKnowledgeBaseIds.length > 0
      ? projectKnowledgeBaseCount > 0
        ? `项目 ${projectKnowledgeBaseCount} + 已选 ${selectedKnowledgeBaseIds.length}`
        : `已选 ${selectedKnowledgeBaseIds.length} 个`
      : projectKnowledgeBaseCount > 0
        ? `项目 ${projectKnowledgeBaseCount} 个`
        : "全部资料";
  const knowledgeScopeHint = !knowledgeSearchEnabled
    ? "关闭后模型不会检索知识库。"
    : selectedKnowledgeBaseIds.length > 0
      ? projectKnowledgeBaseCount > 0
        ? "本轮会检索项目关联知识库和已勾选知识库。"
        : "取消全部选择后恢复检索全部知识库。"
      : projectKnowledgeBaseCount > 0
        ? "本轮默认检索项目关联知识库。"
        : "当前未限定范围，模型会默认检索全部知识库。可勾选具体知识库来限定检索范围。";
  const mcpScopeText =
    selectedMcpServerIds.length > 0
      ? `已选 ${selectedMcpServerIds.length} 个`
      : "未启用";
  const mcpScopeHint =
    selectedMcpServerIds.length > 0
      ? "已勾选的 MCP 服务器会在本轮对话中挂载。"
      : "勾选后模型可调用对应 MCP 工具；默认不自动挂载全局服务器。";

  const toggleKnowledgeBase = (id: string, checked: boolean) => {
    onComposerChange({
      tools: {
        ...composer.tools,
        knowledgeSearch: true,
        knowledgeBaseIds: checked
          ? Array.from(new Set([...selectedKnowledgeBaseIds, id]))
          : selectedKnowledgeBaseIds.filter((kbId) => kbId !== id),
      },
    });
  };

  const toggleMcpServer = (id: string, checked: boolean) => {
    onComposerChange({
      tools: {
        ...composer.tools,
        mcpServerIds: checked
          ? Array.from(new Set([...selectedMcpServerIds, id]))
          : selectedMcpServerIds.filter((serverId) => serverId !== id),
      },
    });
  };

  const resize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  React.useEffect(resize, [text, resize]);

  const isUploading = pendingUploadCount > 0;
  const canSend =
    (text.trim().length > 0 || images.length > 0 || files.length > 0) &&
    !isStreaming &&
    !isUploading;

  const doSend = () => {
    if (pendingUploadCountRef.current > 0) {
      toast.warning("附件还在上传，完成后再发送");
      return;
    }
    if (!canSend) return;
    const sentLocalUrls = images
      .map((img) => img.url)
      .filter((url) => localBlobUrls.current.has(url));
    onSend(text.trim(), images, files);
    setText("");
    // mock/offline 模式下，已发送消息仍引用本地 blob URL，不能立刻 revoke。
    // 从待清理集合移交给消息历史；未发送/被移除的预览仍由 revokeUrl/卸载清理。
    sentLocalUrls.forEach((url) => localBlobUrls.current.delete(url));
    setImages([]);
    setFiles([]);
  };

  const useRealApi = process.env.NEXT_PUBLIC_DATA_SOURCE === "api";
  const beginUpload = React.useCallback(() => {
    pendingUploadCountRef.current += 1;
    setPendingUploadCount(pendingUploadCountRef.current);
  }, []);
  const finishUpload = React.useCallback(() => {
    pendingUploadCountRef.current = Math.max(0, pendingUploadCountRef.current - 1);
    setPendingUploadCount(pendingUploadCountRef.current);
  }, []);

  const handleFiles = async (
    fileList: FileList | File[],
    options?: { openFirstImageEditor?: boolean }
  ) => {
    let openedEditor = false;
    for (const file of Array.from(fileList)) {
      const isImage = file.type.startsWith("image/");
      if (options?.openFirstImageEditor && !isImage) {
        toast.warning("请选择图片文件进行编辑");
        continue;
      }
      // 真实模式：先上传到服务端拿到可持久访问的 URL / 附件 id
      let uploaded: {
        id: string;
        url?: string;
        hasText?: boolean;
      } | null = null;
      if (useRealApi) {
        beginUpload();
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/upload", { method: "POST", body: form });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(err?.error ?? "上传失败");
          }
          uploaded = (await res.json()) as { id: string; url?: string; hasText?: boolean };
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "上传失败");
          continue;
        } finally {
          finishUpload();
        }
      }
      if (isImage) {
        let url: string;
        if (uploaded?.url) {
          url = uploaded.url;
        } else {
          url = URL.createObjectURL(file);
          localBlobUrls.current.add(url); // C4: 标记为本地创建，需手动 revoke
        }
        setImages((prev) => [...prev, { type: "image", url, alt: file.name }]);
        if (options?.openFirstImageEditor && !openedEditor) {
          openedEditor = true;
          setEditingImage(url);
        }
      } else {
        if (useRealApi && !uploaded?.hasText) {
          toast.warning(
            `「${file.name}」未能提取文本，模型将只能看到文件名。若为旧版 Word，请另存为 .docx 后重试`
          );
        }
        setFiles((prev) => [
          ...prev,
          {
            type: "file",
            attachmentId: uploaded?.id ?? Math.random().toString(36).slice(2),
            name: file.name,
            mimeType: file.type,
            size: file.size,
          },
        ]);
      }
    }
  };

  // WAV 录音：AudioContext + ScriptProcessor 录 PCM16，编码成 WAV（MiMo ASR 只支持 wav/mp3）
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = React.useRef<Float32Array[]>([]);
  const audioStreamRef = React.useRef<MediaStream | null>(null);
  const cancelRecordingRef = React.useRef(false);

  const stopAudioStream = React.useCallback(() => {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      cancelRecordingRef.current = true;
      // 清理 WAV 录音资源
      if (processorRef.current) processorRef.current.disconnect();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
      stopAudioStream();
    },
    [stopAudioStream]
  );

  const toggleRecording = async () => {
    if (recording) {
      cancelRecordingRef.current = false;
      setRecording(false);
      // 停止录音：断开 processor，触发 oncomplete 编码 WAV
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.suspend();
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      cancelRecordingRef.current = false;
      pcmChunksRef.current = [];

      // 用 Web Audio API 录 PCM（MiMo ASR 只支持 wav/mp3，不支持浏览器默认的 webm）
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      // 4096 buffer, 单声道, 16kHz（MiMo 推荐采样率）
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // 拷贝一份（buffer 会被复用）
        pcmChunksRef.current.push(new Float32Array(input));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      // 录音停止后的处理：PCM → WAV → 转写
      const finishRecording = async () => {
        stopAudioStream();
        if (audioCtxRef.current) {
          audioCtxRef.current.close();
          audioCtxRef.current = null;
        }
        processorRef.current = null;
        if (cancelRecordingRef.current) return;

        // PCM chunks → WAV Blob
        const pcm = mergeFloat32(pcmChunksRef.current);
        const wavBlob = encodeWav(pcm, ctx.sampleRate);
        if (wavBlob.size === 0) return;

        const toastId = toast.loading("正在转写…");
        try {
          const { getDataService } = await import("@/lib/data");
          const { text: transcript } = await getDataService().transcribeAudio(wavBlob);
          if (transcript) {
            setText((t) => t + (t ? " " : "") + transcript);
            toast.success("转写完成", { id: toastId });
          } else {
            toast.warning("没有识别到语音", { id: toastId });
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "转写失败", { id: toastId });
        }
      };

      // processor disconnect 后延迟一帧让最后的数据进来，再编码
      const origDisconnect = processor.disconnect.bind(processor);
      processor.disconnect = () => {
        origDisconnect();
        setTimeout(() => void finishRecording(), 100);
      };

      setRecording(true);
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <motion.div
        layout
        className={cn(
          "rounded-3xl border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.05)] transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_2px_24px_rgba(201,100,66,0.08)]"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        {/* 引用条 */}
        {quotedText && (
          <div className="flex items-start gap-2 border-b px-4 pb-2 pt-3">
            <div className="min-w-0 flex-1 border-l-2 border-primary/50 pl-2.5">
              <p className="text-xs font-medium text-muted-foreground">引用回复</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{quotedText}</p>
            </div>
            <button
              type="button"
              onClick={onClearQuote}
              aria-label="取消引用"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}

        {/* 附件预览 */}
        {(images.length > 0 || files.length > 0) && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {images.map((img, i) => (
              <div key={i} className="group/att relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? ""} className="size-16 rounded-xl border object-cover" />
                {/* 编辑 mask 按钮 */}
                <Tooltip label="编辑图片">
                  <button
                    type="button"
                    onClick={() => setEditingImage(img.url)}
                    aria-label="编辑图片"
                    className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => {
                    revokeUrl(img.url); // C4
                    if (editingImage === img.url) setEditingImage(null);
                    setImages((prev) => prev.filter((_, j) => j !== i));
                  }}
                  aria-label="移除图片"
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
            {files.map((f, i) => (
              <div key={f.attachmentId} className="group/att relative flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 pr-8">
                <PaperclipIcon className="size-4 text-primary" />
                <div>
                  <p className="max-w-36 truncate text-xs font-medium">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="移除文件"
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {isPptxSkill && hasPptxFile && (
          <div className="px-4 pt-2 text-xs text-muted-foreground">
            PPT 技能已识别附件，可直接让它总结、改写或基于模板生成新版。
          </div>
        )}

        {/* 输入区 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              doSend();
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              handleFiles(e.clipboardData.files);
            }
          }}
          placeholder={recording ? "正在聆听…" : "给 LinHub 发消息…"}
          autoFocus={autoFocus}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={FILE_ACCEPT}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={imageEditInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFiles([file], { openFirstImageEditor: true });
              e.target.value = "";
            }}
          />
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip label="上传文件或图片">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="上传文件或图片"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PaperclipIcon className="size-4" />
              </button>
            </Tooltip>
            <Tooltip label="选择图片并编辑">
              <button
                type="button"
                onClick={() => imageEditInputRef.current?.click()}
                aria-label="编辑图片"
                className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PencilIcon className="size-4" />
                <span className="hidden sm:inline">编辑图片</span>
              </button>
            </Tooltip>

          {/* 工具开关 */}
          <Popover>
            <Tooltip label="工具">
              <PopoverTrigger asChild>
                <button type="button" aria-label="工具" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <SlidersHorizontalIcon className="size-4" />
                </button>
              </PopoverTrigger>
            </Tooltip>
            <PopoverContent align="start" className="w-64 p-2">
              <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
                模型可自主调用的工具
              </p>
              <ToolToggleRow
                icon={GlobeIcon}
                label="联网搜索"
                checked={composer.tools.webSearch}
                onChange={(v) =>
                  onComposerChange({ tools: { ...composer.tools, webSearch: v } })
                }
              />
              <ToolToggleRow
                icon={ImageIcon}
                label="生成图片 / 编辑图片"
                checked={composer.tools.imageGeneration}
                onChange={(v) =>
                  onComposerChange({ tools: { ...composer.tools, imageGeneration: v } })
                }
              />
              <ToolToggleRow
                icon={TerminalIcon}
                label="代码运行"
                checked={composer.tools.codeRunner}
                onChange={(v) =>
                  onComposerChange({ tools: { ...composer.tools, codeRunner: v } })
                }
              />
              {knowledgeBases.length > 0 && (
                <ToolToggleRow
                  icon={BookOpenIcon}
                  label="资料检索"
                  checked={knowledgeSearchEnabled}
                  onChange={(v) =>
                    onComposerChange({ tools: { ...composer.tools, knowledgeSearch: v } })
                  }
                />
              )}
              {knowledgeBases.length > 0 && (
                <fieldset
                  aria-describedby={knowledgeScopeHintId}
                  disabled={!knowledgeSearchEnabled}
                  className="mt-1 border-t pt-1.5 disabled:opacity-60"
                >
                  <legend className="flex w-full items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground">
                    <BookOpenIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">资料检索</span>
                    <span className="shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                      {knowledgeScopeText}
                    </span>
                  </legend>
                  {activeProject && (projectFileCount > 0 || projectKnowledgeBaseCount > 0) && (
                    <p className="px-2 pb-1 text-[11px] leading-4 text-muted-foreground">
                      {activeProject.name}：{projectFileCount} 个项目资料
                      {projectKnowledgeBaseCount > 0
                        ? ` · ${projectKnowledgeBaseCount} 个关联知识库`
                        : ""}
                    </p>
                  )}
                  <p
                    id={knowledgeScopeHintId}
                    className="px-2 pb-1.5 text-[11px] leading-4 text-muted-foreground"
                  >
                    {knowledgeScopeHint}
                  </p>
                  <div className="max-h-40 overflow-y-auto pr-1">
                    {knowledgeBases.map((kb) => {
                      const checked = selectedKnowledgeBaseIds.includes(kb.id);
                      return (
                        <label
                          key={kb.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleKnowledgeBase(kb.id, event.target.checked)}
                            aria-describedby={knowledgeScopeHintId}
                            disabled={!knowledgeSearchEnabled}
                            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{kb.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {kb.documentCount} 个文档 · {kb.totalChunks} 个片段
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              {mcpServers.length > 0 && (
                <fieldset
                  aria-describedby={mcpScopeHintId}
                  className="mt-1 border-t pt-1.5"
                >
                  <legend className="flex w-full items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground">
                    <PlugIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">MCP 服务器</span>
                    <span className="shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                      {mcpScopeText}
                    </span>
                  </legend>
                  <p
                    id={mcpScopeHintId}
                    className="px-2 pb-1.5 text-[11px] leading-4 text-muted-foreground"
                  >
                    {mcpScopeHint}
                  </p>
                  <div className="max-h-40 overflow-y-auto pr-1">
                    {mcpServers.map((server) => {
                      const checked = selectedMcpServerIds.includes(server.id);
                      return (
                        <label
                          key={server.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              toggleMcpServer(server.id, event.target.checked)
                            }
                            aria-describedby={mcpScopeHintId}
                            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{server.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {server.scope === "global" ? "全局" : "我的"} ·{" "}
                              {server.tools.length} 个工具
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </PopoverContent>
          </Popover>

          {/* Extended thinking */}
          <Tooltip label={composer.extendedThinking ? "深度思考：开" : "深度思考：关"}>
            <button
              type="button"
              onClick={() =>
                onComposerChange({ extendedThinking: !composer.extendedThinking })
              }
              aria-label={composer.extendedThinking ? "关闭深度思考" : "开启深度思考"}
              className={cn(
                "flex items-center gap-1 rounded-lg p-2 text-sm transition-colors",
                composer.extendedThinking
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <BrainIcon className="size-4" />
            </button>
          </Tooltip>

          </div>
          <div className="ml-auto flex min-w-fit items-center gap-1">

          {/* 风格选择 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`回复风格：${currentStyle?.name ?? "标准"}`}
                className="flex max-w-[5.5rem] items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:max-w-[10rem]"
              >
                <span className="min-w-0 truncate">{currentStyle?.name ?? "标准"}</span>
                <ChevronDownIcon className="size-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[45dvh] w-52 overflow-y-auto">
              <DropdownMenuLabel>回复风格</DropdownMenuLabel>
              {styles.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => onComposerChange({ styleId: s.id })}
                >
                  <span className="flex-1">
                    <span className="block text-sm">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                  {composer.styleId === s.id && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 模型选择 */}
          <DropdownMenu open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`当前模型：${currentModel?.displayName ?? "未选择"}`}
                className="flex max-w-[4.5rem] items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent sm:max-w-[7rem]"
              >
                <span className="min-w-0 truncate">{currentModel?.displayName}</span>
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[45dvh] w-72 overflow-y-auto">
              <DropdownMenuLabel>选择模型</DropdownMenuLabel>
              {/* 按 providerKind 分组展示 */}
              {Object.entries(
                chatModels.reduce<Record<string, typeof chatModels>>((acc, m) => {
                  const key = m.providerKind;
                  (acc[key] ??= []).push(m);
                  return acc;
                }, {})
              ).map(([kind, group]) => (
                <React.Fragment key={kind}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {PROVIDER_LABELS[kind] ?? kind}
                  </DropdownMenuLabel>
                  {group.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => {
                        onComposerChange({ modelId: m.id });
                        setModelMenuOpen(false);
                      }}
                    >
                      <span className="flex-1">
                        <span className="flex items-center gap-1.5 text-sm">
                          {m.displayName}
                          {m.capabilities.includes("vision") && (
                            <ImageIcon className="size-3 text-muted-foreground" />
                          )}
                          {m.capabilities.includes("reasoning") && (
                            <BrainIcon className="size-3 text-muted-foreground" />
                          )}
                          {m.capabilities.includes("web-search-native") && (
                            <GlobeIcon className="size-3 text-muted-foreground" />
                          )}
                        </span>
                        {m.description && (
                          <span className="block text-xs text-muted-foreground">
                            {m.description}
                          </span>
                        )}
                      </span>
                      {/* 设为默认 */}
                      {onSetDefaultModel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetDefaultModel(m.id);
                          }}
                          className={cn(
                            "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                            defaultModelId === m.id && "text-amber-500"
                          )}
                          aria-label={defaultModelId === m.id ? "默认模型" : "设为默认"}
                          title={defaultModelId === m.id ? "默认模型" : "设为默认"}
                        >
                          <StarIcon className="size-3.5" />
                        </button>
                      )}
                      {composer.modelId === m.id && <CheckIcon className="size-4" />}
                    </DropdownMenuItem>
                  ))}
                </React.Fragment>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal">
                生图由模型自动调用 GPT Image 2
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 语音输入 */}
          <Tooltip label={recording ? "停止录音" : "语音输入"}>
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? "停止录音" : "语音输入"}
              className={cn(
                "rounded-lg p-2 transition-colors",
                recording
                  ? "animate-pulse bg-destructive/10 text-destructive"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <MicIcon className="size-4" />
            </button>
          </Tooltip>

          {/* 发送 / 停止 */}
          {isStreaming ? (
            <Tooltip label="停止生成">
              <button
                type="button"
                onClick={onStop}
                aria-label="停止生成"
                className="rounded-full bg-foreground p-2 text-background transition-transform hover:scale-105 active:scale-95"
              >
                <SquareIcon className="size-4 fill-current" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={doSend}
              disabled={!canSend}
              aria-label={isUploading ? "附件上传中" : "发送"}
              className={cn(
                "rounded-full p-2 transition-all",
                canSend
                  ? "bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 active:scale-95"
                : "bg-muted text-muted-foreground"
              )}
            >
              {isUploading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </button>
          )}
          </div>
        </div>
      </motion.div>
      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        LinHub 可能会出错，请核查重要信息。
      </p>

      {/* 图片编辑器（mask 涂抹 → /images/edits） */}
      <ImageMaskEditor
        imageUrl={editingImage ?? ""}
        open={!!editingImage}
        onOpenChange={(o) => !o && setEditingImage(null)}
        onEdited={(newUrl) => {
          if (editingImage) {
            revokeUrl(editingImage);
            setImages((prev) =>
              prev.map((img) => (img.url === editingImage ? { ...img, url: newUrl, alt: "编辑后的图片" } : img))
            );
          }
        }}
      />
    </div>
  );
}

function ToolToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1 text-sm">{label}</span>
      <Switch
        aria-label={checked ? `关闭${label}` : `开启${label}`}
        checked={checked}
        onCheckedChange={onChange}
      />
    </label>
  );
}

// ---------- WAV 录音辅助函数（MiMo ASR 需要 wav/mp3，不支持 webm）----------

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const result = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

/** 把 Float32 PCM 编码成 16-bit WAV Blob */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // WAV header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  // PCM samples (float32 → int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
