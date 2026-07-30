"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpIcon,
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
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
import { clientRandomUUID } from "@/lib/client-id";
import { FILE_ACCEPT } from "@/lib/file-types";
import type {
  ChatToolToggles,
  FilePart,
  ImagePart,
  KnowledgeBase,
  McpServer,
  Model,
  Project,
  Skill,
  ThinkingEffort,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getRecommendedThinkingEffort,
  getThinkingEffortOptionsForModel,
  modelSupportsThinking,
  modelSupportsThinkingEffort,
  resolveModelThinkingEffort,
  THINKING_EFFORT_LABELS,
} from "@/lib/model-thinking";

export interface ComposerState {
  modelId: string;
  styleId: string;
  extendedThinking: boolean;
  thinkingEffort: ThinkingEffort;
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

type ModelMenuView = "root" | "models" | "thinking";
type ToolMenuView = "root" | "knowledge" | "tools";
type ScopeChoiceState = "default" | "selected" | "off" | "locked";

type ComposerUpload = {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl?: string;
  status: "uploading" | "failed";
  error?: string;
};

function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    [query]
  );
  const getSnapshot = React.useCallback(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
    [query]
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function ChatInput({
  models,
  composer,
  onComposerChange,
  modelThinkingEfforts = {},
  onSetModelThinkingEffort,
  onResetModelThinkingEffort,
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
  pendingProject,
  activeSkill,
  isAdmin = false,
}: {
  models: Model[];
  knowledgeBases?: KnowledgeBase[];
  activeProject?: Project | null;
  /** 新对话 URL 预选的项目；用于项目内输入提示 */
  pendingProject?: Project | null;
  composer: ComposerState;
  onComposerChange: (patch: Partial<ComposerState>) => void;
  modelThinkingEfforts?: Record<string, ThinkingEffort>;
  onSetModelThinkingEffort?: (modelId: string, effort: ThinkingEffort) => void;
  onResetModelThinkingEffort?: (modelId: string) => void;
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
  /** 管理员可查看全局 MCP；普通用户仅看到自己的服务器。 */
  isAdmin?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [images, setImages] = React.useState<ImagePart[]>([]);
  const [files, setFiles] = React.useState<FilePart[]>([]);
  const [pendingUploads, setPendingUploads] = React.useState<ComposerUpload[]>([]);
  const [recording, setRecording] = React.useState(false);
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false);
  const [modelMenuView, setModelMenuView] = React.useState<ModelMenuView>("root");
  const [toolMenuOpen, setToolMenuOpen] = React.useState(false);
  const [toolMenuView, setToolMenuView] = React.useState<ToolMenuView>("root");
  const [pendingUploadCount, setPendingUploadCount] = React.useState(0);
  // 图片编辑器：记录当前要编辑的图片 URL。
  const [editingImage, setEditingImage] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pendingUploadCountRef = React.useRef(0);
  const cancelledUploadIdsRef = React.useRef<Set<string>>(new Set());
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
          isAdmin ? ds.listMcpServers("global") : Promise.resolve([]),
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
  }, [isAdmin]);

  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));
  // 两列 Radix 子菜单至少需要约 680px；窄屏和平板统一在单个弹层内切换。
  const compactModelMenu = useMediaQuery("(max-width: 767px)");
  const prefersReducedMotion = useReducedMotion();
  const nestedMenuTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.145, ease: [0.2, 0.82, 0.18, 1] as const };
  const modelGroups = React.useMemo(
    () =>
      Object.entries(
        chatModels.reduce<Record<string, Model[]>>((acc, m) => {
          const key = m.providerKind;
          (acc[key] ??= []).push(m);
          return acc;
        }, {})
      ),
    [chatModels]
  );
  const currentModel =
    chatModels.find((m) => m.id === composer.modelId) ??
    (defaultModelId ? chatModels.find((m) => m.id === defaultModelId) : undefined);
  const currentModelSupportsThinking = modelSupportsThinking(currentModel);
  const currentRecommendedThinkingEffort =
    getRecommendedThinkingEffort(currentModel);
  const currentModelThinkingEffort =
    currentModel ? resolveModelThinkingEffort(currentModel, modelThinkingEfforts) : composer.thinkingEffort;
  const currentEffectiveThinkingEffort =
    currentModel && modelSupportsThinkingEffort(currentModel, composer.thinkingEffort)
      ? composer.thinkingEffort
      : currentModelThinkingEffort;
  const currentThinkingLabel =
    THINKING_EFFORT_LABELS[currentEffectiveThinkingEffort];
  const thinkingEffortOptions = getThinkingEffortOptionsForModel(currentModel);
  const currentModelThinkingOverridden =
    !!currentModel &&
    modelThinkingEfforts[currentModel.id] !== undefined &&
    modelSupportsThinkingEffort(currentModel, modelThinkingEfforts[currentModel.id]) &&
    modelThinkingEfforts[currentModel.id] !== currentRecommendedThinkingEffort;
  const showModelMenuView = React.useCallback((view: ModelMenuView) => {
    setModelMenuView(view);
  }, []);

  React.useEffect(() => {
    if (composer.thinkingEffort === currentEffectiveThinkingEffort) return;
    onComposerChange({ thinkingEffort: currentEffectiveThinkingEffort });
  }, [composer.thinkingEffort, currentEffectiveThinkingEffort, onComposerChange]);

  const selectModel = (model: Model) => {
    const thinkingEffort = resolveModelThinkingEffort(model, modelThinkingEfforts);
    onComposerChange({
      modelId: model.id,
      extendedThinking: modelSupportsThinking(model),
      thinkingEffort,
    });
    setModelMenuOpen(false);
  };

  const selectThinkingEffort = (effort: ThinkingEffort) => {
    if (currentModel) onSetModelThinkingEffort?.(currentModel.id, effort);
    onComposerChange({
      extendedThinking: currentModelSupportsThinking,
      thinkingEffort: effort,
    });
    setModelMenuOpen(false);
  };

  const resetThinkingEffort = () => {
    if (!currentModel) return;
    onResetModelThinkingEffort?.(currentModel.id);
    onComposerChange({
      extendedThinking: currentModelSupportsThinking,
      thinkingEffort: currentRecommendedThinkingEffort,
    });
    setModelMenuOpen(false);
  };
  const knowledgeSearchEnabled = composer.tools.knowledgeSearch ?? true;
  const selectedKnowledgeBaseIds = composer.tools.knowledgeBaseIds ?? [];
  const projectKnowledgeBaseIds = activeProject?.knowledgeBaseIds ?? [];
  const projectKnowledgeBaseIdSet = new Set(projectKnowledgeBaseIds);
  const selectedExtraKnowledgeBaseIds = selectedKnowledgeBaseIds.filter(
    (id) => !projectKnowledgeBaseIdSet.has(id)
  );
  const projectKnowledgeBaseCount = activeProject?.knowledgeBaseIds.length ?? 0;
  const projectFileCount = activeProject?.files.length ?? 0;
  const selectedMcpServerIds = composer.tools.mcpServerIds ?? [];
  const selectedMcpServerIdSet = new Set(selectedMcpServerIds);
  const userMcpServers = mcpServers.filter((server) => server.scope === "user");
  const globalMcpServers = mcpServers.filter((server) => server.scope === "global");
  const knowledgeScopeText = !knowledgeSearchEnabled
    ? "已关闭"
    : activeProject
      ? selectedExtraKnowledgeBaseIds.length > 0
        ? `项目 + ${selectedExtraKnowledgeBaseIds.length}`
        : "项目资料"
      : selectedKnowledgeBaseIds.length > 0
        ? `已选 ${selectedKnowledgeBaseIds.length} 个`
        : "全部知识库";
  const mcpScopeText =
    selectedMcpServerIds.length > 0
      ? mcpServers.find((server) => selectedMcpServerIdSet.has(server.id))?.name ??
        `已选 ${selectedMcpServerIds.length} 个`
      : "全部工具";

  const selectKnowledgeBase = (id: string) => {
    if (projectKnowledgeBaseIdSet.has(id)) return;
    const restoreDefault =
      selectedExtraKnowledgeBaseIds.length === 1 &&
      selectedExtraKnowledgeBaseIds[0] === id;
    onComposerChange({
      tools: {
        ...composer.tools,
        knowledgeSearch: true,
        // 空数组是默认范围；单独点选时只保留当前知识库。
        knowledgeBaseIds: restoreDefault ? [] : [id],
      },
    });
  };

  const selectMcpServer = (id: string) => {
    const server = userMcpServers.find((item) => item.id === id);
    if (!server) return;
    const restoreDefault =
      selectedMcpServerIds.length === 1 && selectedMcpServerIds[0] === id;
    onComposerChange({
      tools: {
        ...composer.tools,
        // 空数组表示默认挂载全部个人 MCP；点选后只挂载当前服务器。
        mcpServerIds: restoreDefault ? [] : [id],
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

  const processComposerUpload = async (
    item: ComposerUpload,
    options?: { openEditor?: boolean }
  ) => {
      const { file, isImage } = item;
      cancelledUploadIdsRef.current.delete(item.id);
      setPendingUploads((current) =>
        current.map((upload) =>
          upload.id === item.id
            ? { ...upload, status: "uploading", error: undefined }
            : upload
        )
      );
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
          const message = e instanceof Error ? e.message : "上传失败";
          setPendingUploads((current) =>
            current.map((upload) =>
              upload.id === item.id
                ? { ...upload, status: "failed", error: message }
                : upload
            )
          );
          toast.error(`${file.name}：${message}`);
          return;
        } finally {
          finishUpload();
        }
      }
      if (cancelledUploadIdsRef.current.has(item.id)) {
        revokeUrl(item.previewUrl);
        setPendingUploads((current) =>
          current.filter((upload) => upload.id !== item.id)
        );
        return;
      }
      if (isImage) {
        let url: string;
        if (uploaded?.url) {
          url = uploaded.url;
          revokeUrl(item.previewUrl);
        } else {
          url = item.previewUrl ?? URL.createObjectURL(file);
          localBlobUrls.current.add(url);
        }
        setImages((prev) => [...prev, { type: "image", url, alt: file.name }]);
        if (options?.openEditor) {
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
      setPendingUploads((current) =>
        current.filter((upload) => upload.id !== item.id)
      );
  };

  const handleFiles = async (
    fileList: FileList | File[],
    options?: { openFirstImageEditor?: boolean }
  ) => {
    let editorAssigned = false;
    const queued: Array<{ item: ComposerUpload; openEditor: boolean }> = [];
    for (const file of Array.from(fileList)) {
      const isImage = file.type.startsWith("image/");
      if (options?.openFirstImageEditor && !isImage) {
        toast.warning("请选择图片文件进行编辑");
        continue;
      }
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      if (previewUrl) localBlobUrls.current.add(previewUrl);
      const openEditor: boolean =
        !!options?.openFirstImageEditor && !editorAssigned;
      editorAssigned ||= openEditor;
      const item: ComposerUpload = {
        id: `composer-upload-${clientRandomUUID()}`,
        file,
        isImage,
        previewUrl,
        status: "uploading",
      };
      queued.push({ item, openEditor });
      if (openEditor && previewUrl) setEditingImage(previewUrl);
    }
    if (queued.length === 0) return;
    setPendingUploads((current) => [
      ...current,
      ...queued.map(({ item }) => item),
    ]);
    await Promise.all(
      queued.map(({ item, openEditor }) =>
        processComposerUpload(item, { openEditor })
      )
    );
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

  const renderModelMenuItems = () => (
    <>
      <DropdownMenuLabel>选择模型</DropdownMenuLabel>
      {modelGroups.map(([kind, group]) => (
        <React.Fragment key={kind}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {PROVIDER_LABELS[kind] ?? kind}
          </DropdownMenuLabel>
          {group.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => selectModel(m)}
              className="min-h-12"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="min-w-0 truncate">{m.displayName}</span>
                  {m.capabilities.includes("vision") && (
                    <ImageIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  {m.capabilities.includes("reasoning") && (
                    <BrainIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  {m.capabilities.includes("web-search-native") && (
                    <GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                </span>
                {m.description && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {m.description}
                  </span>
                )}
              </span>
              {onSetDefaultModel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
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
              {composer.modelId === m.id && <CheckIcon className="size-4 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </React.Fragment>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="font-normal">
        生图由工具菜单中的图像能力自动调用
      </DropdownMenuLabel>
    </>
  );

  const renderThinkingMenuItems = () => (
    <>
      <DropdownMenuLabel>选择思考强度</DropdownMenuLabel>
      <DropdownMenuLabel className="font-normal leading-5">
        {currentModelSupportsThinking
          ? `当前模型：${currentModel?.displayName ?? "未选择"}`
          : "当前模型没有声明推理能力，偏好会保存；发送时不启用思考。"}
      </DropdownMenuLabel>
      {thinkingEffortOptions.map((option) => {
        const selected = currentEffectiveThinkingEffort === option.value;
        return (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => selectThinkingEffort(option.value)}
            className="min-h-11"
          >
            <span className="min-w-0 flex-1">
              <span className="block">{option.label}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
            {selected && <CheckIcon className="size-4 shrink-0" />}
          </DropdownMenuItem>
        );
      })}
      {currentModel && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!currentModelThinkingOverridden}
            onSelect={resetThinkingEffort}
          >
            恢复模型默认（{THINKING_EFFORT_LABELS[currentRecommendedThinkingEffort]}）
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  const renderCompactModelMenu = () => {
    let content: React.ReactNode;

    if (modelMenuView === "models") {
      content = (
        <div
          className="overflow-y-auto overscroll-contain"
          style={{
            maxHeight:
              "min(31rem, calc(100dvh - 7rem), calc(var(--radix-dropdown-menu-content-available-height) - 0.5rem))",
          }}
        >
          <NestedMenuHeader label="选择模型" onBack={() => showModelMenuView("root")} />
          <DropdownMenuSeparator />
          {renderModelMenuItems()}
        </div>
      );
    } else if (modelMenuView === "thinking") {
      content = (
        <div
          className="overflow-y-auto overscroll-contain"
          style={{
            maxHeight:
              "min(31rem, calc(100dvh - 7rem), calc(var(--radix-dropdown-menu-content-available-height) - 0.5rem))",
          }}
        >
          <NestedMenuHeader
            label="选择思考强度"
            onBack={() => showModelMenuView("root")}
          />
          <DropdownMenuSeparator />
          {renderThinkingMenuItems()}
        </div>
      );
    } else {
      content = (
        <>
          <DropdownMenuLabel>模型与思考</DropdownMenuLabel>
          <DropdownMenuItem
            className="py-2.5"
            onSelect={(event) => {
              event.preventDefault();
              showModelMenuView("models");
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm">选择模型</span>
              <span className="block truncate text-xs text-muted-foreground">
                {currentModel?.displayName ?? "未选择"}
              </span>
            </span>
            <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2.5"
            onSelect={(event) => {
              event.preventDefault();
              showModelMenuView("thinking");
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm">选择思考强度</span>
              <span className="block truncate text-xs text-muted-foreground">
                {currentModelSupportsThinking
                  ? `${currentThinkingLabel}${currentModelThinkingOverridden ? " · 已自定义" : " · 模型默认"}`
                  : `${currentThinkingLabel} · 不启用`}
              </span>
            </span>
            <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuItem>
        </>
      );
    }

    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={modelMenuView}
          layout
          initial={{
            opacity: 0,
            scale: prefersReducedMotion ? 1 : 0.992,
            filter: prefersReducedMotion ? "none" : "blur(2px)",
          }}
          animate={{
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
          }}
          exit={{
            opacity: 0,
            scale: prefersReducedMotion ? 1 : 0.992,
            filter: prefersReducedMotion ? "none" : "blur(1px)",
          }}
          transition={nestedMenuTransition}
          className="min-w-0 will-change-transform"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  const renderKnowledgeSettings = (showBack: boolean) => (
    <>
      {showBack && (
        <NestedMenuHeader label="资料检索" onBack={() => setToolMenuView("root")} />
      )}
      <ToolToggleRow
        icon={BookOpenIcon}
        label="开启资料检索"
        checked={knowledgeSearchEnabled}
        onChange={(v) =>
          onComposerChange({ tools: { ...composer.tools, knowledgeSearch: v } })
        }
      />
      {activeProject && (projectFileCount > 0 || projectKnowledgeBaseCount > 0) && (
        <p className="px-2 pb-1 pt-1 text-[11px] leading-4 text-muted-foreground">
          {activeProject.name}：{projectFileCount} 个项目文件
          {projectKnowledgeBaseCount > 0
            ? ` · ${projectKnowledgeBaseCount} 个关联知识库`
            : ""}
        </p>
      )}
      <div className="mt-1 max-h-[min(19rem,55dvh)] overflow-y-auto border-t pt-1 pr-1">
        {knowledgeBases.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            暂无可检索的知识库
          </p>
        ) : (
          knowledgeBases.map((kb) => {
            const projectMounted = projectKnowledgeBaseIdSet.has(kb.id);
            const specificallySelected = selectedExtraKnowledgeBaseIds.includes(kb.id);
            const choiceState: ScopeChoiceState = projectMounted
              ? "locked"
              : selectedExtraKnowledgeBaseIds.length === 0
                ? activeProject
                  ? "off"
                  : "default"
                : specificallySelected
                  ? "selected"
                  : "off";
            return (
              <ScopeChoiceRow
                key={kb.id}
                title={kb.name}
                subtitle={`${kb.documentCount} 个文档 · ${kb.totalChunks} 个片段`}
                state={choiceState}
                disabled={!knowledgeSearchEnabled || projectMounted}
                badge={projectMounted ? "项目" : undefined}
                onSelect={() => selectKnowledgeBase(kb.id)}
                reducedMotion={!!prefersReducedMotion}
              />
            );
          })
        )}
      </div>
    </>
  );

  const renderToolSettings = (showBack: boolean) => (
    <>
      {showBack && (
        <NestedMenuHeader label="工具设置" onBack={() => setToolMenuView("root")} />
      )}
      <ToolToggleRow
        icon={TerminalIcon}
        label="开启代码运行"
        checked={composer.tools.codeRunner}
        onChange={(v) =>
          onComposerChange({ tools: { ...composer.tools, codeRunner: v } })
        }
      />
      <div className="mt-1 max-h-[min(19rem,55dvh)] overflow-y-auto border-t pt-1 pr-1">
        {isAdmin && globalMcpServers.map((server) => (
          <ScopeChoiceRow
            key={server.id}
            title={server.name}
            subtitle={`全局自动启用 · ${server.tools.length} 个工具`}
            state="locked"
            disabled
            onSelect={() => undefined}
            reducedMotion={!!prefersReducedMotion}
          />
        ))}
        {userMcpServers.map((server) => {
          const state: ScopeChoiceState = selectedMcpServerIds.length === 0
            ? "default"
            : selectedMcpServerIdSet.has(server.id)
              ? "selected"
              : "off";
          return (
            <ScopeChoiceRow
              key={server.id}
              title={server.name}
              subtitle={`我的 · ${server.tools.length} 个工具`}
              state={state}
              onSelect={() => selectMcpServer(server.id)}
              reducedMotion={!!prefersReducedMotion}
            />
          );
        })}
        {globalMcpServers.length === 0 && userMcpServers.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            暂无可配置的个人 MCP 服务器
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <motion.div
        layout
        className={cn(
          "glass rounded-3xl transition-shadow duration-300 focus-within:shadow-[var(--glow-primary)]"
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
        {(images.length > 0 || files.length > 0 || pendingUploads.length > 0) && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pendingUploads.map((upload) => (
              <div
                key={upload.id}
                className={cn(
                  "group/att relative flex min-h-16 items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 pr-8",
                  upload.status === "failed" && "border-destructive/40 bg-destructive/5"
                )}
              >
                {upload.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={upload.previewUrl}
                    alt={upload.file.name}
                    className="size-11 rounded-lg object-cover opacity-80"
                  />
                ) : (
                  <PaperclipIcon className="size-4 text-primary" />
                )}
                <div className="min-w-0">
                  <p className="max-w-36 truncate text-xs font-medium">
                    {upload.file.name}
                  </p>
                  <p
                    className={cn(
                      "max-w-44 truncate text-[10px] text-muted-foreground",
                      upload.status === "failed" && "text-destructive"
                    )}
                    title={upload.error}
                  >
                    {upload.status === "uploading"
                      ? "上传中…"
                      : upload.error ?? "上传失败"}
                  </p>
                  {upload.status === "failed" && (
                    <button
                      type="button"
                      className="mt-0.5 text-[10px] font-medium text-primary hover:underline"
                      onClick={() => void processComposerUpload(upload)}
                    >
                      重试
                    </button>
                  )}
                </div>
                {upload.status === "uploading" && (
                  <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    cancelledUploadIdsRef.current.add(upload.id);
                    revokeUrl(upload.previewUrl);
                    if (editingImage === upload.previewUrl) setEditingImage(null);
                    setPendingUploads((current) =>
                      current.filter((item) => item.id !== upload.id)
                    );
                  }}
                  aria-label={`移除上传「${upload.file.name}」`}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
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
          placeholder={
            recording
              ? "正在聆听…"
              : pendingProject
                ? `在「${pendingProject.name}」中发消息…`
                : "给 LinHub 发消息…"
          }
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

          {/* 工具开关 */}
          <DropdownMenu
            dir="rtl"
            open={toolMenuOpen}
            onOpenChange={(open) => {
              setToolMenuOpen(open);
              if (open) setToolMenuView("root");
            }}
          >
            <Tooltip label="工具">
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="工具" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <SlidersHorizontalIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent
              align={compactModelMenu ? "center" : "end"}
              collisionPadding={compactModelMenu ? 20 : 12}
              className="w-[min(calc(100vw-2.5rem),20rem)] max-w-[calc(100vw-2.5rem)] overflow-hidden p-1"
              style={{ direction: "ltr" }}
            >
              {compactModelMenu ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={toolMenuView}
                    layout
                    initial={{
                      opacity: 0,
                      scale: prefersReducedMotion ? 1 : 0.992,
                      filter: prefersReducedMotion ? "none" : "blur(2px)",
                    }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{
                      opacity: 0,
                      scale: prefersReducedMotion ? 1 : 0.992,
                      filter: prefersReducedMotion ? "none" : "blur(1px)",
                    }}
                    transition={nestedMenuTransition}
                    className="min-w-0 will-change-transform"
                  >
                    {toolMenuView === "root" && (
                      <>
                        <DropdownMenuLabel>模型可自主调用的工具</DropdownMenuLabel>
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
                        <DropdownMenuItem
                          className="py-2.5"
                          onSelect={(event) => {
                            event.preventDefault();
                            setToolMenuView("knowledge");
                          }}
                        >
                          <BookOpenIcon />
                          <span className="min-w-0 flex-1">资料检索</span>
                          <span className="max-w-28 truncate text-[11px] text-muted-foreground">
                            {knowledgeScopeText}
                          </span>
                          <ChevronUpIcon />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="py-2.5"
                          onSelect={(event) => {
                            event.preventDefault();
                            setToolMenuView("tools");
                          }}
                        >
                          <PlugIcon />
                          <span className="min-w-0 flex-1">工具设置</span>
                          <span className="max-w-28 truncate text-[11px] text-muted-foreground">
                            {mcpScopeText}
                          </span>
                          <ChevronUpIcon />
                        </DropdownMenuItem>
                      </>
                    )}
                    {toolMenuView === "knowledge" && renderKnowledgeSettings(true)}
                    {toolMenuView === "tools" && renderToolSettings(true)}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <>
                  <DropdownMenuLabel>模型可自主调用的工具</DropdownMenuLabel>
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
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger arrowDirection="left" className="py-2">
                      <BookOpenIcon />
                      <span className="min-w-0 flex-1">资料检索</span>
                      <span className="max-w-28 truncate text-[11px] text-muted-foreground">
                        {knowledgeScopeText}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={12}
                      collisionPadding={12}
                      className="w-[min(calc(100vw-1rem),20rem)] p-1 text-left"
                      style={{ direction: "ltr" }}
                    >
                      {renderKnowledgeSettings(false)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger arrowDirection="left" className="py-2">
                      <PlugIcon />
                      <span className="min-w-0 flex-1">工具设置</span>
                      <span className="max-w-28 truncate text-[11px] text-muted-foreground">
                        {mcpScopeText}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={12}
                      collisionPadding={12}
                      className="w-[min(calc(100vw-1rem),20rem)] p-1 text-left"
                      style={{ direction: "ltr" }}
                    >
                      {renderToolSettings(false)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          </div>
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-1">

            {/* 模型选择 */}
            <DropdownMenu
              dir="rtl"
              open={modelMenuOpen}
              onOpenChange={(open) => {
                setModelMenuOpen(open);
                if (open) showModelMenuView("root");
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`当前模型：${currentModel?.displayName ?? "未选择"}`}
                  className="flex min-w-0 max-w-[calc(100vw-9rem)] items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs font-medium leading-4 text-foreground transition-colors hover:bg-accent sm:max-w-[16rem]"
                >
                  <span className="min-w-0 whitespace-normal break-words">
                    {currentModel?.displayName ?? "未选择"}
                  </span>
                  <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={compactModelMenu ? "center" : "end"}
              collisionPadding={compactModelMenu ? 20 : 8}
              className="w-[min(calc(100vw-2.5rem),22rem)] max-w-[calc(100vw-2.5rem)] overflow-hidden p-1 sm:w-[18rem] sm:max-w-[calc(100vw-1rem)]"
              style={{
                direction: "ltr",
                maxHeight: compactModelMenu
                  ? "min(34rem, calc(100dvh - 4rem), var(--radix-dropdown-menu-content-available-height))"
                  : "min(78dvh, var(--radix-dropdown-menu-content-available-height))",
              }}
            >
                {compactModelMenu ? (
                  renderCompactModelMenu()
                ) : (
                  <>
                    <DropdownMenuLabel>模型与思考</DropdownMenuLabel>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger arrowDirection="left" className="py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">选择模型</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {currentModel?.displayName ?? "未选择"}
                          </span>
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        sideOffset={12}
                        collisionPadding={12}
                        className="w-[min(calc(100vw-1rem),22rem)] overflow-y-auto overscroll-contain p-1 text-left"
                        style={{
                          direction: "ltr",
                          maxHeight:
                            "min(72dvh, var(--radix-dropdown-menu-content-available-height))",
                        }}
                      >
                        {renderModelMenuItems()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger arrowDirection="left" className="py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">选择思考强度</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {currentModelSupportsThinking
                              ? `${currentThinkingLabel}${currentModelThinkingOverridden ? " · 已自定义" : " · 模型默认"}`
                              : `${currentThinkingLabel} · 不启用`}
                          </span>
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        sideOffset={12}
                        className="w-[min(calc(100vw-1rem),18rem)] p-1 text-left"
                        style={{ direction: "ltr" }}
                      >
                        {renderThinkingMenuItems()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
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
                    ? "btn-brand hover:scale-105 active:scale-95"
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

function NestedMenuHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 px-1 pb-1.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回工具菜单"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function ScopeChoiceRow({
  title,
  subtitle,
  state,
  disabled = false,
  badge,
  onSelect,
  reducedMotion,
}: {
  title: string;
  subtitle: string;
  state: ScopeChoiceState;
  disabled?: boolean;
  badge?: string;
  onSelect: () => void;
  reducedMotion: boolean;
}) {
  const checked = state !== "off";
  const highlighted = state === "selected";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
        disabled ? "cursor-default" : "hover:bg-accent"
      )}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={
          reducedMotion
            ? undefined
            : highlighted
              ? { scale: [0.82, 1.16, 1] }
              : { scale: 1 }
        }
        transition={{ duration: 0.28, ease: "easeOut" }}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200",
          highlighted
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : checked
              ? "border-border bg-muted text-muted-foreground"
              : "border-border bg-transparent text-transparent"
        )}
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="block min-w-0 flex-1 truncate text-sm">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {badge}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
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
