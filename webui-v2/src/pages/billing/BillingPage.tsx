import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/api/auth";
import {
  billingKeys,
  createOrder,
  formatYuan,
  getPlans,
  redeemCode,
  type CreateOrderInput,
} from "@/api/billing";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { useAuthStore } from "@/stores/auth-store";
import { LedgerTab } from "./LedgerTab";
import { PlansTab } from "./PlansTab";
import { RechargeTab } from "./RechargeTab";
import { UsageTab } from "./UsageTab";

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type BillingTab = "plans" | "recharge" | "usage" | "ledger";

/** 计费页:余额/套餐/额度概览 + 订阅、充值、用量、流水四个 Tab */
export function BillingPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<BillingTab>("plans");

  /** 下单/兑换后刷新当前用户(余额、订阅),忽略失败 */
  const refreshMe = async () => {
    try {
      const me = await getMe();
      if (me) setUser(me);
    } catch {
      // 刷新失败不影响主流程
    }
  };

  const invalidateBilling = () => {
    void queryClient.invalidateQueries({ queryKey: billingKeys.ledger });
    void queryClient.invalidateQueries({ queryKey: billingKeys.usage });
    void refreshMe();
  };

  const orderMutation = useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(input),
    onSuccess: (order) => {
      if (order?.payUrl) {
        window.open(order.payUrl, "_blank", "noopener");
        toast.success("订单已创建,已打开支付页面");
      } else if (order?.status === "paid") {
        toast.success("支付成功");
      } else {
        toast.success("订单已创建");
      }
      invalidateBilling();
    },
    onError: (err) => toast.error(errorMessage(err, "下单失败")),
  });

  const redeemMutation = useMutation({
    mutationFn: (code: string) => redeemCode(code),
    onSuccess: (data) => {
      toast.success(`已到账 ${formatYuan(data.amountCents)}`);
      invalidateBilling();
    },
    onError: (err) => toast.error(errorMessage(err, "兑换失败")),
  });

  const plansQuery = useQuery({
    queryKey: billingKeys.plans,
    queryFn: getPlans,
  });

  const subscription = user?.subscription;
  const quotaUnlimited = (subscription?.monthlyQuotaCents ?? 0) === -1;
  const quotaPercent =
    subscription && !quotaUnlimited && subscription.monthlyQuotaCents > 0
      ? Math.min(
          100,
          Math.round(
            (subscription.usedQuotaCents / subscription.monthlyQuotaCents) * 100,
          ),
        )
      : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">
        <header>
          <h1 className="text-xl font-semibold text-text">用量与计费</h1>
          <p className="mt-0.5 text-sm text-text-2">
            管理余额、订阅套餐,查看用量明细与余额流水
          </p>
        </header>

        {/* 概览三卡 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-text-2">账户余额</p>
            <p className="mt-2 text-2xl font-semibold text-primary">
              {formatYuan(user?.balance ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-text-2">当前套餐</p>
            <p className="mt-2 text-lg font-semibold text-text">
              {subscription ? subscription.planName : "免费版"}
            </p>
            {subscription && (
              <p className="mt-1 text-xs text-text-3">
                {new Date(subscription.expiresAt).toLocaleDateString()} 到期
              </p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-text-2">本月订阅额度</p>
            {subscription ? (
              quotaUnlimited ? (
                <p className="mt-2 text-lg font-semibold text-text">无限额度</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-text">
                    {formatYuan(subscription.usedQuotaCents)} /{" "}
                    {formatYuan(subscription.monthlyQuotaCents)}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${quotaPercent}%` }}
                    />
                  </div>
                </>
              )
            ) : (
              <p className="mt-2 text-sm text-text-3">订阅套餐后获得月度额度</p>
            )}
          </div>
        </div>

        <Tabs
          tabs={[
            { value: "plans", label: "订阅套餐" },
            { value: "recharge", label: "充值" },
            { value: "usage", label: "用量明细" },
            { value: "ledger", label: "余额流水" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as BillingTab)}
        />

        {tab === "plans" && (
          <PlansTab
            query={plansQuery}
            currentPlanId={subscription?.planId}
            orderPending={orderMutation.isPending}
            onSubscribe={(planId) =>
              orderMutation.mutate({ kind: "subscription", planId })
            }
          />
        )}
        {tab === "recharge" && (
          <RechargeTab
            orderPending={orderMutation.isPending}
            redeemPending={redeemMutation.isPending}
            onRecharge={(amountCents) =>
              orderMutation.mutate({ kind: "recharge", amountCents })
            }
            onRedeem={(code) => redeemMutation.mutate(code)}
          />
        )}
        {tab === "usage" && <UsageTab />}
        {tab === "ledger" && <LedgerTab />}
      </div>
    </div>
  );
}
