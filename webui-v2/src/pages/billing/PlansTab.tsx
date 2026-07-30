import type { UseQueryResult } from "@tanstack/react-query";
import { formatYuan, type Plan } from "@/api/billing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { errorMessage } from "./BillingPage";

interface PlansTabProps {
  query: UseQueryResult<Plan[]>;
  currentPlanId?: string;
  orderPending: boolean;
  onSubscribe: (planId: string) => void;
}

/** 订阅套餐 Tab:套餐卡片,当前套餐高亮 */
export function PlansTab({
  query,
  currentPlanId,
  orderPending,
  onSubscribe,
}: PlansTabProps) {
  if (query.isPending) return <PageLoading text="加载套餐…" />;
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(query.error, "加载套餐失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const plans = (query.data ?? []).filter((p) => p.enabled);
  if (plans.length === 0) {
    return <p className="py-12 text-center text-sm text-text-3">暂无可用套餐</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        return (
          <div
            key={plan.id}
            className={
              isCurrent
                ? "flex flex-col rounded-xl border-2 border-primary bg-surface p-4"
                : "flex flex-col rounded-xl border border-border bg-surface p-4"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text">{plan.name}</h3>
              <div className="flex items-center gap-1.5">
                <Badge tone={plan.modelTier === "pro" ? "primary" : "default"}>
                  {plan.modelTier === "pro" ? "PRO 模型" : "免费模型"}
                </Badge>
                {isCurrent && <Badge tone="success">当前套餐</Badge>}
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold text-text">
              {formatYuan(plan.priceCentsPerMonth)}
              <span className="text-sm font-normal text-text-3"> / 月</span>
            </p>
            <p className="mt-1 text-sm text-text-2">
              月额度:
              {plan.monthlyQuotaCents === -1
                ? "无限"
                : formatYuan(plan.monthlyQuotaCents)}
            </p>
            {plan.description && (
              <p className="mt-1 text-sm text-text-2">{plan.description}</p>
            )}
            {plan.features.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-text-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <span className="text-success" aria-hidden>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex-1" />
            <Button
              variant={isCurrent ? "outline" : "primary"}
              disabled={isCurrent || orderPending}
              onClick={() => onSubscribe(plan.id)}
            >
              {isCurrent ? "当前套餐" : orderPending ? "下单中…" : "订阅"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
