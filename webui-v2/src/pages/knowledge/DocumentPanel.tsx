import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDocument,
  knowledgeKeys,
  listDocuments,
  uploadDocumentWithProgress,
  type KnowledgeBase,
  type KnowledgeDocument,
} from "@/api/knowledge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageLoading, Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "./ConfirmDialog";
import { errorMessage, formatSize, formatTime } from "./utils";

const ACCEPT = ".pdf,.txt,.md,.docx,.xlsx,.pptx,.csv,.html,.json";
const POLL_INTERVAL_MS = 1500;

interface DocumentPanelProps {
  kb: KnowledgeBase;
}

/** 右侧文档面板:拖拽上传 + 文档列表 + 解析中轮询 */
export function DocumentPanel({ kb }: DocumentPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  /** 进行中的上传(本地态,XHR 上报真实百分比) */
  const [uploading, setUploading] = useState<
    Array<{ key: string; name: string; percent: number }>
  >([]);
  const [deletingDoc, setDeletingDoc] = useState<KnowledgeDocument | null>(null);

  const documentsQuery = useQuery({
    queryKey: knowledgeKeys.documents(kb.id),
    queryFn: () => listDocuments(kb.id),
    // 任一文档解析中时,每 1.5s 轮询;全部就绪/失败后自动停止
    refetchInterval: (query) =>
      (query.state.data ?? []).some((doc) => doc.status === "processing")
        ? POLL_INTERVAL_MS
        : false,
  });

  const documents = documentsQuery.data ?? [];

  const invalidateDocsAndBases = () => {
    void queryClient.invalidateQueries({
      queryKey: knowledgeKeys.documents(kb.id),
    });
    // documentCount / totalChunks 会变,知识库列表也要刷新
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.bases });
  };

  const uploadFiles = (files: File[]) => {
    for (const file of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploading((list) => [...list, { key, name: file.name, percent: 0 }]);
      uploadDocumentWithProgress(kb.id, file, (percent) => {
        setUploading((list) =>
          list.map((item) => (item.key === key ? { ...item, percent } : item)),
        );
      })
        .then(() => {
          toast.success(`「${file.name}」上传成功`);
          invalidateDocsAndBases();
        })
        .catch((err) => {
          toast.error(errorMessage(err, `「${file.name}」上传失败`));
        })
        .finally(() => {
          setUploading((list) => list.filter((item) => item.key !== key));
        });
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  };

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(kb.id, docId),
    onMutate: async (docId) => {
      await queryClient.cancelQueries({
        queryKey: knowledgeKeys.documents(kb.id),
      });
      const previous = queryClient.getQueryData<KnowledgeDocument[]>(
        knowledgeKeys.documents(kb.id),
      );
      queryClient.setQueryData<KnowledgeDocument[]>(
        knowledgeKeys.documents(kb.id),
        (old) => (old ?? []).filter((doc) => doc.id !== docId),
      );
      return { previous };
    },
    onError: (err, _docId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          knowledgeKeys.documents(kb.id),
          context.previous,
        );
      }
      toast.error(errorMessage(err, "删除文档失败"));
    },
    onSuccess: () => {
      toast.success("文档已删除");
    },
    onSettled: () => {
      invalidateDocsAndBases();
    },
  });

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 头部 */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-text">{kb.name}</h1>
        {kb.description && (
          <p className="mt-0.5 text-sm text-text-2">{kb.description}</p>
        )}
        <p className="mt-1 text-xs text-text-3">
          {kb.documentCount} 个文档 · {kb.totalChunks} 个片段
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 上传区 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary-soft"
              : "border-border bg-surface hover:border-text-3 hover:bg-surface-2",
          )}
        >
          <UploadIcon className="size-6 text-text-3" />
          <p className="text-sm text-text">
            拖拽文件到此处,或<span className="text-primary">点击选择文件</span>
          </p>
          <p className="text-xs text-text-3">
            支持 PDF、TXT、Markdown、Office、CSV、HTML、JSON,可多选
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) uploadFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 上传中进度行 */}
        {uploading.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {uploading.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Spinner className="size-3.5 text-text-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{item.name}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs text-text-3">
                  {item.percent >= 100 ? "处理中…" : `${item.percent}%`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 文档列表 */}
        <div className="mt-4">
          {documentsQuery.isLoading ? (
            <PageLoading text="加载文档中…" />
          ) : documentsQuery.isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-text-2">
              <p>文档列表加载失败</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void documentsQuery.refetch()}
              >
                重试
              </Button>
            </div>
          ) : documents.length === 0 && uploading.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-3">
              暂无文档,上传后 AI 即可基于这些内容回答问题
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  title={doc.status === "error" ? doc.errorMessage : undefined}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                >
                  <FileIcon className="size-4 shrink-0 text-text-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {doc.name}
                    </p>
                    <p className="mt-0.5 text-xs text-text-3">
                      {formatSize(doc.size)} · {formatTime(doc.createdAt)}
                    </p>
                  </div>
                  <StatusBadge doc={doc} />
                  <button
                    type="button"
                    aria-label={`删除 ${doc.name}`}
                    onClick={() => setDeletingDoc(doc)}
                    className="shrink-0 rounded-md p-1.5 text-text-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deletingDoc !== null}
        title="删除文档"
        description={`确定删除「${deletingDoc?.name ?? ""}」吗?其对应的解析片段将一并移除。`}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deletingDoc) {
            deleteMutation.mutate(deletingDoc.id);
            setDeletingDoc(null);
          }
        }}
        onClose={() => setDeletingDoc(null)}
      />
    </div>
  );
}

function StatusBadge({ doc }: { doc: KnowledgeDocument }) {
  if (doc.status === "processing") {
    return (
      <Badge tone="default">
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3" />
          解析中
        </span>
      </Badge>
    );
  }
  if (doc.status === "ready") {
    return <Badge tone="success">就绪 · {doc.chunkCount} 片段</Badge>;
  }
  return <Badge tone="danger">解析失败</Badge>;
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
