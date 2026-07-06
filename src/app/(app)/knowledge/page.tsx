"use client";

import * as React from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { KnowledgeBase } from "@/lib/types";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<KnowledgeBase | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: kbs = [] } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => getDataService().listKnowledgeBases(),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["kb-documents", selected?.id],
    queryFn: () => getDataService().listDocuments(selected!.id),
    enabled: !!selected,
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === "processing") ? 1500 : false,
  });

  const create = async () => {
    if (!name.trim()) return;
    const kb = await getDataService().saveKnowledgeBase({
      name: name.trim(),
      description,
    });
    queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    setCreateOpen(false);
    setName("");
    setDescription("");
    setSelected(kb);
    toast.success("知识库已创建");
  };

  const upload = async (files: FileList | File[]) => {
    if (!selected || uploading) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        await getDataService().uploadDocument(selected.id, file);
      }
      queryClient.invalidateQueries({ queryKey: ["kb-documents", selected.id] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      toast.success("文档已上传，正在解析…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const dropHandlers = selected
    ? {
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget === e.target) setDragActive(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        },
      }
    : {};

  const openFilePicker = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const removeDoc = async (docId: string) => {
    if (!selected) return;
    await getDataService().deleteDocument(selected.id, docId);
    queryClient.invalidateQueries({ queryKey: ["kb-documents", selected.id] });
    queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
  };

  const removeKb = async (kb: KnowledgeBase) => {
    if (!window.confirm(`删除知识库「${kb.name}」及其全部文档？`)) return;
    await getDataService().deleteKnowledgeBase(kb.id);
    queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    if (selected?.id === kb.id) setSelected(null);
    toast.success("已删除");
  };

  return (
    <PageContainer wide>
      <PageHeader
        title="知识库"
        description="上传文档，会话中挂载后模型可检索引用"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon /> 新建知识库
          </Button>
        }
      />

      {kbs.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title="还没有知识库"
          description="上传 PDF、Word、Markdown 文档，模型在对话中会自动检索并标注引用来源。"
          action={<Button onClick={() => setCreateOpen(true)}>创建第一个知识库</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 知识库列表 */}
          <div className="space-y-2">
            {kbs.map((kb, i) => (
              <motion.div
                key={kb.id}
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelected(kb)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(kb);
                }}
                className={cn(
                  "group w-full cursor-pointer rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/40",
                  selected?.id === kb.id && "border-primary/60 ring-1 ring-primary/30"
                )}
              >
                <div className="flex items-start justify-between">
                  <BookOpenIcon className="mb-2 size-5 text-primary" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeKb(kb);
                    }}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-medium">{kb.name}</h3>
                {kb.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {kb.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {kb.documentCount} 个文档 · {kb.totalChunks} 个片段
                </p>
              </motion.div>
            ))}
          </div>

          {/* 文档面板 */}
          <div className="lg:col-span-2">
            {!selected ? (
              <EmptyState
                title="选择一个知识库"
                description="点击左侧知识库查看和管理文档。"
              />
            ) : (
              <Card
                className={cn(
                  "p-5 transition-colors",
                  dragActive && "border-primary/60 bg-primary/5"
                )}
                {...dropHandlers}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-medium">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      支持 PDF / Word / Markdown / TXT
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept=".pdf,.doc,.docx,.md,.txt"
                    onChange={(e) => {
                      if (e.target.files?.length) void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" onClick={openFilePicker} disabled={uploading}>
                    {uploading ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <UploadIcon />
                    )}
                    {uploading ? "上传中" : "上传文档"}
                  </Button>
                </div>

                {documents.length === 0 ? (
                  <div
                    onClick={openFilePicker}
                    className={cn(
                      "cursor-pointer rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30",
                      dragActive && "border-primary/60 bg-primary/5 text-foreground"
                    )}
                  >
                    {uploading ? "正在上传…" : "点击或拖拽文件到此处上传"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="group flex items-center gap-3 rounded-xl border px-3.5 py-3"
                      >
                        <FileTextIcon className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(doc.size)} · {formatRelativeTime(doc.createdAt)}
                            {doc.status === "ready" && ` · ${doc.chunkCount} 个片段`}
                          </p>
                        </div>
                        {doc.status === "processing" ? (
                          <Badge variant="warning">
                            <Loader2Icon className="size-3 animate-spin" /> 解析中
                          </Badge>
                        ) : doc.status === "error" ? (
                          <Badge variant="destructive">解析失败</Badge>
                        ) : (
                          <Badge variant="success">就绪</Badge>
                        )}
                        <button
                          onClick={() => removeDoc(doc.id)}
                          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="知识库名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={create} disabled={!name.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
