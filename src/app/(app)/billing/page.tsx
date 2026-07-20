"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CoinsIcon,
  ReceiptIcon,
  SparklesIcon,
  TicketIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { cn, formatCents, formatTokens } from "@/lib/utils";
import { formatQuotaCents, isUnlimitedQuota } from "@/lib/billing-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Badge,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/misc";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

export default function BillingPage() {
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });

  return (
    <PageContainer wide>
      <PageHeader title="用量与订阅" description="余额、套餐、消费明细" />

      {/* 概览卡片 */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CoinsIcon className="size-3.5" /> 账户余额
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {user ? formatCents(user.balance) : "—"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SparklesIcon className="size-3.5" /> 当前套餐
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {user?.subscription?.planName ?? "免费版"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ReceiptIcon className="size-3.5" /> 本月订阅额度
          </p>
          {user?.subscription ? (
            isUnlimitedQuota(user.subscription.monthlyQuotaCents) ? (
              <>
                <p className="mt-1 text-2xl font-semibold">无限额度</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  本月已用 {formatCents(user.subscription.usedQuotaCents)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCents(user.subscription.usedQuotaCents)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {formatCents(user.subscription.monthlyQuotaCents)}
                  </span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (user.subscription.usedQuotaCents /
                          user.subscription.monthlyQuotaCents) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </>
            )
          ) : (
            <p className="mt-1 text-2xl font-semibold">—</p>
          )}
        </Card>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">订阅套餐</TabsTrigger>
          <TabsTrigger value="recharge">充值</TabsTrigger>
          <TabsTrigger value="usage">用量明细</TabsTrigger>
          <TabsTrigger value="ledger">余额流水</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <PlansTab currentPlanId={user?.subscription?.planId} />
        </TabsContent>
        <TabsContent value="recharge">
          <RechargeTab />
        </TabsContent>
        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function PlansTab({ currentPlanId }: { currentPlanId?: string }) {
  const queryClient = useQueryClient();
  const [subscribingPlanId, setSubscribingPlanId] = React.useState<string | null>(null);
  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => getDataService().listPlans(),
  });

  const subscribe = async (planId: string) => {
    if (subscribingPlanId) return;
    setSubscribingPlanId(planId);
    try {
      const order = await getDataService().createOrder({ kind: "subscription", planId });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      toast.success(
        order.status === "paid" ? "订阅已生效" : "订单已创建，请按提示完成支付"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "订阅失败");
    } finally {
      setSubscribingPlanId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {plans.map((p) => {
        const isCurrent = p.id === currentPlanId;
        const highlight = p.id === "plan-standard";
        return (
          <Card
            key={p.id}
            className={cn(
              "relative flex flex-col p-6",
              highlight && "border-primary/50 shadow-md"
            )}
          >
            {highlight && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                最受欢迎
              </Badge>
            )}
            <h3 className="font-medium">{p.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
            <p className="mt-4 text-3xl font-semibold">
              {p.priceCentsPerMonth === 0 ? "免费" : formatCents(p.priceCentsPerMonth)}
              {p.priceCentsPerMonth > 0 && (
                <span className="text-sm font-normal text-muted-foreground"> /月</span>
              )}
            </p>
            <p className="mt-3 text-sm font-medium text-primary">
              {formatQuotaCents(p.monthlyQuotaCents)}额度
            </p>
            <ul className="mt-4 flex-1 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="mt-5"
              variant={isCurrent ? "secondary" : highlight ? "default" : "outline"}
              disabled={isCurrent || subscribingPlanId !== null}
              onClick={() => subscribe(p.id)}
            >
              {subscribingPlanId === p.id
                ? "处理中…"
                : isCurrent
                  ? "当前套餐"
                  : "选择"}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

function RechargeTab() {
  const queryClient = useQueryClient();
  const [code, setCode] = React.useState("");
  const amounts = [1000, 3000, 5000, 10000, 20000, 50000];
  const [selected, setSelected] = React.useState(5000);
  const [recharging, setRecharging] = React.useState(false);
  const [redeeming, setRedeeming] = React.useState(false);

  const recharge = async () => {
    if (recharging) return;
    setRecharging(true);
    try {
      const order = await getDataService().createOrder({
        kind: "recharge",
        amountCents: selected,
      });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      toast.success(
        order.status === "paid" ? "充值已到账" : "订单已创建，请按提示完成支付"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "充值失败");
    } finally {
      setRecharging(false);
    }
  };

  const redeem = async () => {
    if (redeeming) return;
    setRedeeming(true);
    try {
      const { amountCents } = await getDataService().redeemCode(code.trim());
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setCode("");
      toast.success(`兑换成功，已到账 ${formatCents(amountCents)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
          <CoinsIcon className="size-4 text-primary" /> 余额充值
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {amounts.map((a) => (
            <button
              key={a}
              onClick={() => setSelected(a)}
              className={cn(
                "rounded-xl border py-3 text-sm font-medium transition-all",
                selected === a
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:border-primary/40"
              )}
            >
              {formatCents(a)}
            </button>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={recharge} disabled={recharging}>
          {recharging ? "创建订单中…" : `去支付 ${formatCents(selected)}`}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          支持微信支付 / 支付宝（P8 接入）
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
          <TicketIcon className="size-4 text-primary" /> 兑换码
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="输入兑换码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && redeem()}
          />
          <Button onClick={redeem} disabled={!code.trim() || redeeming}>
            {redeeming ? "兑换中…" : "兑换"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          兑换码由管理员在后台生成，可用于活动赠送或线下售卖。
        </p>
      </Card>
    </div>
  );
}

function UsageTab() {
  const { data: records = [] } = useQuery({
    queryKey: ["usage-records"],
    queryFn: () => getDataService().listUsageRecords(),
  });

  const totalCost = records.reduce((sum, r) => sum + r.costCents, 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <p className="text-sm font-medium">最近用量</p>
        <p className="text-xs text-muted-foreground">
          合计 <span className="font-medium text-foreground">{formatCents(totalCost)}</span>
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">时间</th>
            <th className="px-3 py-2.5 font-medium">模型</th>
            <th className="px-3 py-2.5 text-right font-medium">输入</th>
            <th className="px-3 py-2.5 text-right font-medium">输出</th>
            <th className="px-5 py-2.5 text-right font-medium">费用</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/30">
              <td className="px-5 py-2.5 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("zh-CN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-3 py-2.5">{r.modelName}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatTokens(r.inputTokens)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.imageCount ? `${r.imageCount} 张图` : formatTokens(r.outputTokens)}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums">
                {formatCents(r.costCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LedgerTab() {
  const { data: entries = [] } = useQuery({
    queryKey: ["ledger"],
    queryFn: () => getDataService().listLedger(),
  });

  return (
    <Card className="divide-y overflow-hidden">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-sm">{e.description}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-medium tabular-nums",
                e.amountCents > 0 ? "text-success" : "text-foreground"
              )}
            >
              {e.amountCents > 0 ? "+" : ""}
              {formatCents(e.amountCents)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              余额 {formatCents(e.balanceAfterCents)}
            </p>
          </div>
        </div>
      ))}
    </Card>
  );
}
