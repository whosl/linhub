import { useQuery } from "@tanstack/react-query";
import {
  billingKeys,
  formatDateTime,
  formatYuan,
  getLedger,
  type LedgerReason,
} from "@/api/billing";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "./BillingPage";

const REASON_LABELS: Record<LedgerReason, string> = {
  recharge: "充值",
  usage: "消费",
  grant: "赠送",
  refund: "退款",
  redeem: "兑换",
};

/** 余额流水 Tab:±金额、原因、描述、余额快照 */
export function LedgerTab() {
  const query = useQuery({ queryKey: billingKeys.ledger, queryFn: getLedger });

  if (query.isPending) return <PageLoading text="加载流水…" />;
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(query.error, "加载流水失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const entries = query.data ?? [];
  if (entries.length === 0) {
    return <p className="py-12 text-center text-sm text-text-3">暂无流水记录</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border bg-surface">
      {entries.map((entry) => {
        const positive = entry.amountCents >= 0;
        return (
          <div key={entry.id} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">
                  {REASON_LABELS[entry.reason] ?? entry.reason}
                </span>
                <span className="truncate text-sm text-text-2">
                  {entry.description}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-text-3">
                {formatDateTime(entry.createdAt)} · 余额{" "}
                {formatYuan(entry.balanceAfterCents)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                positive ? "text-success" : "text-danger",
              )}
            >
              {positive ? "+" : "-"}
              {formatYuan(Math.abs(entry.amountCents))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
