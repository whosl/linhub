import { useQuery } from "@tanstack/react-query";
import {
  billingKeys,
  formatDateTime,
  formatYuan,
  getUsage,
} from "@/api/billing";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { errorMessage } from "./BillingPage";

/** 用量明细 Tab:表格 + 底部合计行 */
export function UsageTab() {
  const query = useQuery({ queryKey: billingKeys.usage, queryFn: getUsage });

  if (query.isPending) return <PageLoading text="加载用量…" />;
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(query.error, "加载用量失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const records = query.data ?? [];
  if (records.length === 0) {
    return <p className="py-12 text-center text-sm text-text-3">暂无用量记录</p>;
  }

  const totals = records.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      imageCount: acc.imageCount + (r.imageCount ?? 0),
      costCents: acc.costCents + r.costCents,
    }),
    { inputTokens: 0, outputTokens: 0, imageCount: 0, costCents: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-160 text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-2">
            <th className="px-4 py-2.5 font-medium">时间</th>
            <th className="px-4 py-2.5 font-medium">模型</th>
            <th className="px-4 py-2.5 text-right font-medium">输入 tokens</th>
            <th className="px-4 py-2.5 text-right font-medium">输出 tokens</th>
            <th className="px-4 py-2.5 text-right font-medium">图片数</th>
            <th className="px-4 py-2.5 text-right font-medium">费用</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/60 text-text">
              <td className="px-4 py-2.5 whitespace-nowrap text-text-2">
                {formatDateTime(r.createdAt)}
              </td>
              <td className="px-4 py-2.5">{r.modelName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.inputTokens.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.outputTokens.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.imageCount ?? 0}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatYuan(r.costCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium text-text">
            <td className="px-4 py-2.5" colSpan={2}>
              合计({records.length} 条)
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {totals.inputTokens.toLocaleString()}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {totals.outputTokens.toLocaleString()}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {totals.imageCount}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {formatYuan(totals.costCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
