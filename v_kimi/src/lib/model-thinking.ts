import type { Model, ThinkingEffort } from "@/lib/types";

export interface ThinkingEffortOption {
  value: ThinkingEffort;
  label: string;
  description: string;
}

export const THINKING_EFFORT_OPTIONS: ThinkingEffortOption[] = [
  { value: "minimal", label: "短", description: "更快响应，尽量少想" },
  { value: "low", label: "中", description: "轻量推理，适合日常对话" },
  { value: "medium", label: "长", description: "平衡质量、速度和成本" },
  { value: "high", label: "最长", description: "复杂任务优先质量" },
  { value: "xhigh", label: "极高", description: "更高推理预算，适合复杂分析" },
  { value: "max", label: "最大", description: "模型可用的最高思考强度" },
];

export const THINKING_EFFORT_LABELS: Record<ThinkingEffort, string> = {
  minimal: "短",
  low: "中",
  medium: "长",
  high: "最长",
  xhigh: "极高",
  max: "最大",
};

export function isThinkingEffort(value: unknown): value is ThinkingEffort {
  return (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}

export function modelSupportsThinking(model?: Pick<Model, "capabilities"> | null) {
  return !!model?.capabilities.includes("reasoning");
}

export function getRecommendedThinkingEffort(
  model?: Pick<Model, "providerKind" | "slug" | "displayName" | "capabilities"> | null
): ThinkingEffort {
  if (!model || !modelSupportsThinking(model)) return "minimal";

  const slug = model.slug.toLowerCase();
  const name = model.displayName.toLowerCase();
  const key = `${slug} ${name}`;

  switch (model.providerKind) {
    case "openai": {
      if (/nano|instant|spark/.test(key)) return "minimal";
      if (/mini/.test(key)) return "low";
      if (/chat/.test(key)) return "medium";
      return "high";
    }
    case "anthropic": {
      if (/haiku/.test(key)) return "low";
      if (/sonnet[-\s]?5|fable[-\s]?5/.test(key)) return "max";
      if (/sonnet/.test(key)) return "high";
      if (/opus|fable|mythos/.test(key)) return "high";
      return "medium";
    }
    case "google": {
      if (/lite/.test(key)) return "minimal";
      if (/3\.5.*flash/.test(key)) return "medium";
      if (/flash/.test(key)) return "high";
      if (/pro/.test(key)) return "high";
      return "medium";
    }
    case "deepseek": {
      if (/flash/.test(key)) return "medium";
      if (/v4|reasoner|thinking|r1|pro/.test(key)) return "high";
      return "medium";
    }
    case "zhipu":
    case "xiaomi":
    case "xiaomi-token-plan": {
      if (/flash|fast|turbo|lite|air/.test(key)) return "low";
      if (/pro|max|plus/.test(key)) return "high";
      return "medium";
    }
    default:
      return "medium";
  }
}

export function getSupportedThinkingEfforts(
  model?: Pick<Model, "providerKind" | "slug" | "displayName" | "capabilities"> | null
): ThinkingEffort[] {
  if (!model || !modelSupportsThinking(model)) {
    return ["minimal", "low", "medium", "high"];
  }

  const slug = model.slug.toLowerCase();
  const name = model.displayName.toLowerCase();
  const key = `${slug} ${name}`;

  switch (model.providerKind) {
    case "openai":
      return ["minimal", "low", "medium", "high"];
    case "anthropic":
      return /sonnet[-\s]?5|fable[-\s]?5/.test(key)
        ? ["low", "medium", "high", "xhigh", "max"]
        : ["low", "medium", "high", "xhigh"];
    case "google":
      return ["minimal", "low", "medium", "high", "xhigh"];
    default:
      return ["minimal", "low", "medium", "high"];
  }
}

export function getThinkingEffortOptionsForModel(
  model?: Pick<Model, "providerKind" | "slug" | "displayName" | "capabilities"> | null
) {
  const supported = new Set(getSupportedThinkingEfforts(model));
  return THINKING_EFFORT_OPTIONS.filter((option) => supported.has(option.value));
}

export function modelSupportsThinkingEffort(
  model: Pick<Model, "providerKind" | "slug" | "displayName" | "capabilities"> | null | undefined,
  effort: ThinkingEffort
) {
  return getSupportedThinkingEfforts(model).includes(effort);
}

export function resolveModelThinkingEffort(
  model: Pick<Model, "id" | "providerKind" | "slug" | "displayName" | "capabilities"> | null | undefined,
  overrides: Record<string, ThinkingEffort | undefined>
): ThinkingEffort {
  if (!model) return "high";
  const override = overrides[model.id];
  if (override && modelSupportsThinkingEffort(model, override)) return override;
  return getRecommendedThinkingEffort(model);
}
