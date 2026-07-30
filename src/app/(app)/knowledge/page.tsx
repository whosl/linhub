"use client";

import * as React from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { clientRandomUUID } from "@/lib/client-id";
import { FILE_ACCEPT, FILE_ACCEPT_LABEL } from "@/lib/file-types";
import type { KnowledgeBase, KnowledgeDocument } from "@/lib/types";
import {
  optimisticInsertRecord,
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

type DeleteTarget =
  | {
      kind: "document";
      kbId: string;
      docId: string;
      name: string;
    }
  | {
      kind: "knowledge-base";
      kbId: string;
      name: string;
    };

function formatUploadFailures(failures: string[]) {
  const visible = failures.slice(0, 3).join("\n");
  return failures.length > 3
    ? `${visible}\n另有 ${failures.length - 3} 个失败`
    : visible;
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<KnowledgeBase | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(
    null
  );
  const [deleting, setDeleting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInFlightRef = React.useRef(false);

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
    const cleanName = name.trim();
    if (!cleanName) return;
    const now = new Date().toISOString();
    const temporary: KnowledgeBase = {
      id: `optimistic-kb-${clientRandomUUID()}`,
      name: cleanName,
      description: description.trim() || undefined,
      documentCount: 0,
      totalChunks: 0,
      createdAt: now,
      updatedAt: now,
      clientMutationState: "pending",
    };
    const optimistic = optimisticInsertRecord<KnowledgeBase>(
      queryClient,
      [["knowledge-bases"]],
      temporary
    );
    setCreateOpen(false);
    setName("");
    setDescription("");
    setSelected(null);
    try {
      const kb = await getDataService().saveKnowledgeBase({
        name: cleanName,
        description,
      });
      optimistic.reconcile(kb);
      setSelected(kb);
      toast.success("知识库已创建");
    } catch (error) {
      optimistic.rollback();
      setSelected(null);
      toast.error(error instanceof Error ? error.message : "知识库创建失败");
    }
  };

  const upload = async (files: FileList | File[]) => {
    const selectedKb = selected;
    if (!selectedKb || uploadInFlightRef.current) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    let successCount = 0;
    const failures: string[] = [];
    const optimisticCount = optimisticPatchRecords<KnowledgeBase>(
      queryClient,
      [["knowledge-bases"]],
      selectedKb.id,
      { documentCount: selectedKb.documentCount + list.length }
    );
    try {
      for (const file of list) {
        const temporary: KnowledgeDocument = {
          id: `optimistic-kb-document-${clientRandomUUID()}`,
          knowledgeBaseId: selectedKb.id,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          status: "processing",
          chunkCount: 0,
          createdAt: new Date().toISOString(),
          clientMutationState: "pending",
        };
        const optimisticDocument = optimisticInsertRecord<KnowledgeDocument>(
          queryClient,
          [["kb-documents", selectedKb.id]],
          temporary,
          documents.length
        );
        try {
          const saved = await getDataService().uploadDocument(selectedKb.id, file);
          optimisticDocument.reconcile(saved);
          successCount += 1;
        } catch (e) {
          const message = e instanceof Error ? e.message : "上传失败";
          failures.push(`${file.name}：${message}`);
          optimisticDocument.reconcile({
            ...temporary,
            status: "error",
            errorMessage: message,
            clientMutationState: "failed",
            clientMutationError: message,
          });
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kb-documents", selectedKb.id] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }),
      ]);
      if (failures.length === 0) {
        toast.success("文档已上传，正在解析…");
      } else if (successCount > 0) {
        queryClient.setQueryData<KnowledgeBase[]>(["knowledge-bases"], (current) =>
          current?.map((kb) =>
            kb.id === selectedKb.id
              ? { ...kb, documentCount: selectedKb.documentCount + successCount }
              : kb
          )
        );
        toast.warning(`已上传 ${successCount} 个文档，${failures.length} 个失败`, {
          description: formatUploadFailures(failures),
        });
      } else {
        optimisticCount.rollback();
        toast.error(`${failures.length} 个文档上传失败`, {
          description: formatUploadFailures(failures),
        });
      }
    } finally {
      uploadInFlightRef.current = false;
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

  const requestRemoveDoc = (docId: string) => {
    if (!selected) return;
    const doc = documents.find((d) => d.id === docId);
    setDeleteTarget({
      kind: "document",
      kbId: selected.id,
      docId,
      name: doc?.name ?? "未命名文档",
    });
  };

  const requestRemoveKb = (kb: KnowledgeBase) => {
    setDeleteTarget({
      kind: "knowledge-base",
      kbId: kb.id,
      name: kb.name,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    if (deleteTarget.kind === "document") {
      const optimisticDocument = optimisticRemoveRecord<KnowledgeDocument>(
        queryClient,
        [["kb-documents", deleteTarget.kbId]],
        deleteTarget.docId
      );
      const kb = kbs.find((item) => item.id === deleteTarget.kbId);
      const optimisticKb = kb
        ? optimisticPatchRecords<KnowledgeBase>(
            queryClient,
            [["knowledge-bases"]],
            kb.id,
            { documentCount: Math.max(0, kb.documentCount - 1) }
          )
        : null;
      setDeleteTarget(null);
      try {
        await getDataService().deleteDocument(
          deleteTarget.kbId,
          deleteTarget.docId
        );
        toast.success("文档已删除");
      } catch (error) {
        optimisticDocument.rollback();
        optimisticKb?.rollback();
        toast.error(error instanceof Error ? error.message : "文档删除失败");
      } finally {
        setDeleting(false);
      }
      return;
    }

    const removedKb = kbs.find((item) => item.id === deleteTarget.kbId);
    const optimisticKb = optimisticRemoveRecord<KnowledgeBase>(
      queryClient,
      [["knowledge-bases"]],
      deleteTarget.kbId
    );
    if (selected?.id === deleteTarget.kbId) setSelected(null);
    setDeleteTarget(null);
    try {
        await getDataService().deleteKnowledgeBase(deleteTarget.kbId);
        toast.success("已删除");
    } catch (e) {
      optimisticKb.rollback();
      if (removedKb) setSelected(removedKb);
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer wide>
      <PageHeader
        title="知识库"
        description="长期资料库，可被聊天、项目和技能挂载检索"
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
          description={`${FILE_ACCEPT_LABEL}，之后可在项目或聊天中作为资料源检索。`}
          action={<Button onClick={() => setCreateOpen(true)}>创建第一个知识库</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 知识库列表 */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3 lg:block lg:space-y-2">
            {kbs.map((kb, i) => (
              <motion.div
                key={kb.id}
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (kb.clientMutationState !== "pending") setSelected(kb);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (kb.clientMutationState !== "pending") setSelected(kb);
                  }
                }}
                aria-label={`选择知识库「${kb.name}」`}
                aria-disabled={kb.clientMutationState === "pending"}
                className={cn(
                  "group w-64 shrink-0 cursor-pointer rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/40 lg:w-full",
                  selected?.id === kb.id && "border-primary/60 ring-1 ring-primary/30"
                )}
              >
                <div className="flex items-start justify-between">
                  <BookOpenIcon className="mb-2 size-5 text-primary" />
                  <button
                    type="button"
                    aria-label={`删除知识库「${kb.name}」`}
                    onClick={(e) => {
                      e.stopPropagation();
                      requestRemoveKb(kb);
                    }}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-medium">
                  {kb.name}
                  {kb.clientMutationState === "pending" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      创建中…
                    </span>
                  )}
                </h3>
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
                      {FILE_ACCEPT_LABEL}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept={FILE_ACCEPT}
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
                    {documents.map((doc, docIndex) => {
                      const isImage = doc.mimeType.startsWith("image/");
                      return (
                      <div
                        key={doc.id}
                        className="group flex items-center gap-3 rounded-xl border px-3.5 py-3"
                      >
                        {isImage ? (
                          <ImageIcon className="size-5 shrink-0 text-primary" />
                        ) : (
                          <FileTextIcon className="size-5 shrink-0 text-primary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(doc.size)} · {formatRelativeTime(doc.createdAt)}
                            {doc.status === "ready" && ` · ${doc.chunkCount} 个片段`}
                            {doc.status === "error" && doc.errorMessage
                              ? ` · ${doc.errorMessage}`
                              : null}
                          </p>
                        </div>
                        {doc.status === "processing" ? (
                          <Badge variant="warning">
                            <Loader2Icon className="size-3 animate-spin" /> 解析中
                          </Badge>
                        ) : doc.status === "error" ? (
                          <Badge variant="destructive" title={doc.errorMessage}>
                            解析失败
                          </Badge>
                        ) : (
                          <Badge variant="success">就绪</Badge>
                        )}
                        <button
                          type="button"
                          aria-label={`删除第 ${docIndex + 1} 个文档「${doc.name}」`}
                          onClick={() => requestRemoveDoc(doc.id)}
                          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      </div>
                      );
                    })}
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

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent aria-describedby="delete-confirm-description">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "knowledge-base"
                ? "删除知识库"
                : "删除文档"}
            </DialogTitle>
            <DialogDescription id="delete-confirm-description">
              {deleteTarget?.kind === "knowledge-base"
                ? `将删除知识库「${deleteTarget.name}」及其全部文档，此操作不可撤销。`
                : `将删除文档「${deleteTarget?.name ?? ""}」，此操作不可撤销。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
