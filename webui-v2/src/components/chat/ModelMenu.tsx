// 模型选择弹层:按供应商分组,tier 徽标 + 能力图标;支持"设为默认"

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { patchMe } from "@/api/chat-options";
import { getModels } from "@/api/models";
import type { Model } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu";
import { toast } from "@/components/ui/toast";
import { useAuthStore } from "@/stores/auth-store";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  zhipu: "智谱",
  xiaomi: "小米",
};

/** 能力 → 小图标 */
function capabilityIcons(capabilities: string[]): string {
  const icons: string[] = [];
  if (capabilities.includes("vision")) icons.push("👁");
  if (capabilities.includes("reasoning")) icons.push("🧠");
  if (capabilities.includes("tools")) icons.push("🔧");
  return icons.join(" ");
}

export function ModelMenu({
  value,
  onChange,
}: {
  /** 当前生效的模型 id(可能来自会话) */
  value?: string;
  onChange: (modelId: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { data } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    staleTime: 5 * 60_000,
  });

  const models = useMemo(
    () => (data?.models ?? []).filter((m) => m.enabled),
    [data],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of models) {
      const list = map.get(m.providerKind);
      if (list) list.push(m);
      else map.set(m.providerKind, [m]);
    }
    return [...map.entries()];
  }, [models]);

  const current = models.find((m) => m.id === value);

  const setAsDefault = async (modelId: string) => {
    try {
      const updated = await patchMe({ defaultModelId: modelId });
      if (updated) setUser(updated);
      toast.success("已设为默认模型");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "设置失败");
    }
  };

  return (
    <DropdownMenu
      align="left"
      trigger={
        <span className="flex max-w-44 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-2 transition-colors hover:bg-surface-2 hover:text-text">
          <span className="truncate">{current?.displayName ?? "选择模型"}</span>
          <span aria-hidden className="text-text-3">▾</span>
        </span>
      }
    >
      <div className="max-h-80 w-64 overflow-y-auto">
        {groups.map(([kind, list]) => (
          <div key={kind}>
            <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-text-3">
              {PROVIDER_LABELS[kind] ?? kind}
            </p>
            {list.map((m) => (
              <DropdownItem key={m.id} onClick={() => onChange(m.id)}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{m.displayName}</span>
                    {m.id === value && <span className="text-primary">✓</span>}
                  </span>
                </span>
                <span className="shrink-0 text-xs" aria-hidden>
                  {capabilityIcons(m.capabilities)}
                </span>
                <Badge tone={m.tier === "pro" ? "primary" : "default"}>
                  {m.tier === "pro" ? "pro" : "free"}
                </Badge>
              </DropdownItem>
            ))}
          </div>
        ))}
        {current && user && user.defaultModelId !== current.id && (
          <>
            <div className="my-1 border-t border-border" />
            <DropdownItem onClick={() => void setAsDefault(current.id)}>
              设为默认模型
            </DropdownItem>
          </>
        )}
      </div>
    </DropdownMenu>
  );
}

/** 模型目录数据(供 Composer 复用,避免重复 query) */
export function useModels() {
  const { data } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const models = (data?.models ?? []).filter((m) => m.enabled);
    return {
      models,
      defaultModelId: data?.defaultModelId,
      find: (id?: string) => models.find((m) => m.id === id),
    };
  }, [data]);
}
