import "server-only";

import { getActiveSubscription } from "@/lib/server/billing";
import type { CodeSandboxLimits } from "@/lib/server/code-sandbox";

const MiB = 1024 * 1024;

export type CodeSandboxPlanTier = "free" | "subscriber" | "family";

export interface CodeSandboxResourcePolicy {
  tier: CodeSandboxPlanTier;
  label: string;
  defaultTimeoutSeconds: number;
  maxSyncTimeoutSeconds: number;
  maxBackgroundTimeoutSeconds: number;
  limits: Required<Omit<CodeSandboxLimits, "timeoutMs">>;
}

const POLICIES: Record<CodeSandboxPlanTier, CodeSandboxResourcePolicy> = {
  free: {
    tier: "free",
    label: "免费版",
    defaultTimeoutSeconds: 30,
    maxSyncTimeoutSeconds: 120,
    maxBackgroundTimeoutSeconds: 300,
    limits: {
      tmpBytes: 256 * MiB,
      memoryMb: 512,
      cpus: 1,
      pids: 64,
      stdoutStderrBytes: 1 * MiB,
      inputBytes: 32 * MiB,
      outputBytes: 32 * MiB,
      outputFiles: 100,
    },
  },
  subscriber: {
    tier: "subscriber",
    label: "订阅版",
    defaultTimeoutSeconds: 30,
    maxSyncTimeoutSeconds: 120,
    maxBackgroundTimeoutSeconds: 300,
    limits: {
      tmpBytes: 512 * MiB,
      memoryMb: 1_024,
      cpus: 2,
      pids: 128,
      stdoutStderrBytes: 2 * MiB,
      inputBytes: 128 * MiB,
      outputBytes: 128 * MiB,
      outputFiles: 500,
    },
  },
  family: {
    tier: "family",
    label: "Family Pass",
    defaultTimeoutSeconds: 30,
    maxSyncTimeoutSeconds: 120,
    maxBackgroundTimeoutSeconds: 300,
    limits: {
      tmpBytes: 1_024 * MiB,
      memoryMb: 1_536,
      cpus: 2,
      pids: 256,
      stdoutStderrBytes: 4 * MiB,
      inputBytes: 256 * MiB,
      outputBytes: 256 * MiB,
      outputFiles: 1_000,
    },
  },
};

/**
 * 套餐只决定本次容器的资源上限，不写入客户端，也不信任工具参数传入套餐。
 * 没有有效订阅和显式的 plan-free 都按免费版处理；所有普通有效订阅共享
 * 512 MiB 临时盘，Family Pass 单独提升到 1 GiB。
 */
export async function resolveCodeSandboxPolicy(
  userId: string
): Promise<CodeSandboxResourcePolicy> {
  const active = await getActiveSubscription(userId);
  if (active?.plan.id === "plan-family-pass") return POLICIES.family;
  if (active && active.plan.id !== "plan-free") return POLICIES.subscriber;
  return POLICIES.free;
}

export function codeSandboxLimits(
  policy: CodeSandboxResourcePolicy,
  timeoutSeconds: number
): CodeSandboxLimits {
  return {
    ...policy.limits,
    timeoutMs: Math.round(timeoutSeconds * 1_000),
  };
}

export function codeSandboxPolicySummary(policy: CodeSandboxResourcePolicy) {
  return {
    tier: policy.tier,
    label: policy.label,
    tmpMiB: Math.round(policy.limits.tmpBytes / MiB),
    memoryMiB: policy.limits.memoryMb,
    inputMiB: Math.round(policy.limits.inputBytes / MiB),
    outputMiB: Math.round(policy.limits.outputBytes / MiB),
    maxSyncTimeoutSeconds: policy.maxSyncTimeoutSeconds,
    maxBackgroundTimeoutSeconds: policy.maxBackgroundTimeoutSeconds,
  };
}
