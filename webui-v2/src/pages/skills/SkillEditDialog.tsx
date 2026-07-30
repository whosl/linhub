import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/api/models";
import type { Skill, SkillInput } from "@/api/skills";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";

const textareaClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-2">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-text-3">{hint}</span>}
    </label>
  );
}

interface SkillEditDialogProps {
  /** "new" 表示新建,否则为编辑(预填) */
  target: Skill | "new";
  onClose: () => void;
  onSubmit: (input: SkillInput) => void;
  pending: boolean;
}

/** 新建 / 编辑技能对话框(每次打开重新挂载,表单状态用初始值即可) */
export function SkillEditDialog({
  target,
  onClose,
  onSubmit,
  pending,
}: SkillEditDialogProps) {
  const editing = target === "new" ? null : target;

  const [emoji, setEmoji] = useState(editing?.emoji ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? "");
  const [greeting, setGreeting] = useState(editing?.greeting ?? "");
  const [defaultModelId, setDefaultModelId] = useState(
    editing?.defaultModelId ?? "",
  );
  const [shareToMarket, setShareToMarket] = useState(
    editing ? editing.visibility !== "private" : false,
  );

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
  });
  const enabledModels = (modelsQuery.data?.models ?? []).filter(
    (m) => m.enabled,
  );

  const valid = name.trim().length > 0 && systemPrompt.trim().length > 0;

  const handleSubmit = () => {
    if (!valid || pending) return;
    onSubmit({
      id: editing?.id,
      name: name.trim(),
      emoji: emoji.trim() || undefined,
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      greeting: greeting.trim() || undefined,
      defaultModelId: defaultModelId || undefined,
      shareToMarket,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "编辑技能" : "新建技能"}
      widthClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex gap-3">
          <Field label="Emoji">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🧩"
              maxLength={4}
              className="w-16 text-center text-lg"
            />
          </Field>
          <div className="flex-1">
            <Field label="名称" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给技能起个名字"
              />
            </Field>
          </div>
        </div>

        <Field label="描述">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说明这个技能做什么"
          />
        </Field>

        <Field label="系统提示词" required>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="定义技能的角色、能力与行为规范…"
            rows={6}
            className={textareaClass}
          />
        </Field>

        <Field label="开场白">
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="开始对话时发送给用户的问候语"
            rows={2}
            className={textareaClass}
          />
        </Field>

        <Field label="默认模型">
          <select
            value={defaultModelId}
            onChange={(e) => setDefaultModelId(e.target.value)}
            className={selectClass}
          >
            <option value="">跟随账户默认</option>
            {enabledModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <div>
            <p className="text-sm text-text">分享到技能广场</p>
            <p className="text-xs text-text-3">提交后需管理员审核</p>
          </div>
          <Switch
            checked={shareToMarket}
            onChange={setShareToMarket}
            label="分享到技能广场"
          />
        </div>
      </div>
    </Dialog>
  );
}
