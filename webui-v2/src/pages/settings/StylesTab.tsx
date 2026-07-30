import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteStyle,
  getStyles,
  saveStyle,
  settingsKeys,
  type ChatStyle,
  type StyleInput,
} from "@/api/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { useUiStore } from "@/stores/ui-store";
import { errorMessage } from "./SettingsPage";

/** 回复风格 Tab:内置 + 自定义风格管理,默认风格写入 ui-store */
export function StylesTab() {
  const queryClient = useQueryClient();
  const defaultStyleId = useUiStore((s) => s.defaultReplyStyleId);
  const setDefaultStyleId = useUiStore((s) => s.setDefaultReplyStyleId);

  const [editTarget, setEditTarget] = useState<ChatStyle | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatStyle | null>(null);

  const query = useQuery({
    queryKey: settingsKeys.styles,
    queryFn: getStyles,
  });

  const saveMutation = useMutation({
    mutationFn: (input: StyleInput) => saveStyle(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.styles });
      const previous = queryClient.getQueryData<ChatStyle[]>(
        settingsKeys.styles,
      );
      queryClient.setQueryData<ChatStyle[]>(settingsKeys.styles, (old = []) => {
        if (input.id) {
          return old.map((s) =>
            s.id === input.id
              ? {
                  ...s,
                  name: input.name,
                  description: input.description ?? "",
                  prompt: input.prompt,
                }
              : s,
          );
        }
        const optimistic: ChatStyle = {
          id: `temp-${Date.now()}`,
          name: input.name,
          description: input.description ?? "",
          prompt: input.prompt,
          builtIn: false,
        };
        return [...old, optimistic];
      });
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.styles, context.previous);
      }
      toast.error(errorMessage(err, "保存失败"));
    },
    onSuccess: () => {
      toast.success("已保存");
      setEditTarget(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.styles });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStyle(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.styles });
      const previous = queryClient.getQueryData<ChatStyle[]>(
        settingsKeys.styles,
      );
      queryClient.setQueryData<ChatStyle[]>(settingsKeys.styles, (old = []) =>
        old.filter((s) => s.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.styles, context.previous);
      }
      toast.error(errorMessage(err, "删除失败"));
    },
    onSuccess: (_data, id) => {
      toast.success("已删除");
      setDeleteTarget(null);
      if (defaultStyleId === id) setDefaultStyleId(undefined);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.styles });
    },
  });

  const styles = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-2">
          回复风格决定模型的语气与输出格式,可设为默认
        </p>
        <Button size="sm" onClick={() => setEditTarget("new")}>
          新建风格
        </Button>
      </div>

      {query.isPending && <PageLoading text="加载风格…" />}
      {query.isError && (
        <div className="flex flex-col items-center gap-2 py-12">
          <p className="text-sm text-danger">
            {errorMessage(query.error, "加载失败")}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {query.isSuccess && styles.length === 0 && (
        <p className="py-12 text-center text-sm text-text-3">暂无回复风格</p>
      )}

      {styles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {styles.map((style) => {
            const isDefault = style.id === defaultStyleId;
            return (
              <div
                key={style.id}
                className={
                  isDefault
                    ? "flex flex-col rounded-xl border-2 border-primary bg-surface p-4"
                    : "flex flex-col rounded-xl border border-border bg-surface p-4"
                }
              >
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-text">
                    {style.name}
                  </h3>
                  {style.builtIn && <Badge>内置</Badge>}
                  {isDefault && <Badge tone="primary">默认</Badge>}
                </div>
                {style.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-text-2">
                    {style.description}
                  </p>
                )}
                <div className="mt-3 flex flex-1 items-end justify-end gap-1">
                  {!isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefaultStyleId(style.id)}
                    >
                      设为默认
                    </Button>
                  )}
                  {!style.builtIn && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditTarget(style)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleteTarget(style)}
                      >
                        删除
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editTarget && (
        <StyleEditDialog
          key={editTarget === "new" ? "new" : editTarget.id}
          target={editTarget}
          pending={saveMutation.isPending}
          onClose={() => setEditTarget(null)}
          onSubmit={(input) => saveMutation.mutate(input)}
        />
      )}

      {deleteTarget && (
        <Dialog
          open
          onClose={() => setDeleteTarget(null)}
          title="删除回复风格"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "删除中…" : "删除"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text">
            确定删除「{deleteTarget.name}」吗?此操作不可撤销。
          </p>
        </Dialog>
      )}
    </div>
  );
}

interface StyleEditDialogProps {
  target: ChatStyle | "new";
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: StyleInput) => void;
}

function StyleEditDialog({
  target,
  pending,
  onClose,
  onSubmit,
}: StyleEditDialogProps) {
  const isNew = target === "new";
  const [name, setName] = useState(isNew ? "" : target.name);
  const [description, setDescription] = useState(
    isNew ? "" : (target.description ?? ""),
  );
  const [prompt, setPrompt] = useState(isNew ? "" : (target.prompt ?? ""));
  // 注:切换编辑对象时由外层 key 重挂载本组件,无需同步 effect

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    onSubmit({
      id: isNew ? undefined : target.id,
      name: trimmed,
      description: description.trim() || undefined,
      prompt: prompt.trim() || undefined,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? "新建回复风格" : "编辑回复风格"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={!name.trim() || pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">名称</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如:技术文档风格"
            maxLength={32}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">描述</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说明这个风格"
            maxLength={100}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">提示词(可选)</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="注入系统提示词,约束模型的回复方式"
            rows={5}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>
      </div>
    </Dialog>
  );
}
