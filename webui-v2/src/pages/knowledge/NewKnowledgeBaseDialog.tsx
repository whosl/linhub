import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createKnowledgeBase,
  knowledgeKeys,
  type KnowledgeBase,
} from "@/api/knowledge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "./utils";

interface NewKnowledgeBaseDialogProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功后选中新知识库(拿到真实 id) */
  onCreated: (kb: KnowledgeBase) => void;
}

/** 新建知识库:名称必填 + 描述可选,乐观插入临时项 */
export function NewKnowledgeBaseDialog({
  open,
  onClose,
  onCreated,
}: NewKnowledgeBaseDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: createKnowledgeBase,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: knowledgeKeys.bases });
      const previous = queryClient.getQueryData<KnowledgeBase[]>(
        knowledgeKeys.bases,
      );
      const now = new Date().toISOString();
      const optimistic: KnowledgeBase = {
        id: `optimistic-${Date.now()}`,
        name: input.name,
        description: input.description,
        documentCount: 0,
        totalChunks: 0,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<KnowledgeBase[]>(knowledgeKeys.bases, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(knowledgeKeys.bases, context.previous);
      }
      toast.error(errorMessage(err, "创建知识库失败"));
    },
    onSuccess: (created, _input, context) => {
      // 用真实数据替换乐观临时项
      queryClient.setQueryData<KnowledgeBase[]>(knowledgeKeys.bases, (old) =>
        (old ?? []).map((kb) => (kb.id === context?.optimisticId ? created : kb)),
      );
      toast.success("知识库已创建");
      onCreated(created);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.bases });
    },
  });

  const reset = () => {
    setName("");
    setDescription("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("请输入知识库名称");
      return;
    }
    mutation.mutate({
      name: trimmed,
      description: description.trim() || undefined,
    });
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新建知识库"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim() || mutation.isPending}
          >
            创建
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kb-name" className="text-sm font-medium text-text">
            名称 <span className="text-danger">*</span>
          </label>
          <Input
            id="kb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如:产品文档"
            autoFocus
            maxLength={100}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kb-desc" className="text-sm font-medium text-text">
            描述
          </label>
          <Input
            id="kb-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选,简单说明用途"
            maxLength={200}
          />
        </div>
      </form>
    </Dialog>
  );
}
