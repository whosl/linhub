import { useState } from "react";
import { formatYuan } from "@/api/billing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const RECHARGE_AMOUNTS_CENTS = [1000, 3000, 5000, 10000, 20000, 50000];

interface RechargeTabProps {
  orderPending: boolean;
  redeemPending: boolean;
  onRecharge: (amountCents: number) => void;
  onRedeem: (code: string) => void;
}

/** 充值 Tab:固定金额档位 + 兑换码 */
export function RechargeTab({
  orderPending,
  redeemPending,
  onRecharge,
  onRedeem,
}: RechargeTabProps) {
  const [code, setCode] = useState("");

  const submitRedeem = () => {
    const trimmed = code.trim();
    if (!trimmed || redeemPending) return;
    onRedeem(trimmed);
    setCode("");
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text">选择充值金额</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RECHARGE_AMOUNTS_CENTS.map((amount) => (
            <button
              key={amount}
              type="button"
              disabled={orderPending}
              onClick={() => onRecharge(amount)}
              className="rounded-xl border border-border bg-surface p-4 text-center transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-50"
            >
              <p className="text-lg font-semibold text-text">
                {formatYuan(amount)}
              </p>
              <p className="mt-0.5 text-xs text-text-3">
                {orderPending ? "下单中…" : "点击充值"}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text">兑换码</h3>
        <div className="flex max-w-md gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入兑换码"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRedeem();
            }}
          />
          <Button
            variant="outline"
            disabled={!code.trim() || redeemPending}
            onClick={submitRedeem}
          >
            {redeemPending ? "兑换中…" : "兑换"}
          </Button>
        </div>
      </section>
    </div>
  );
}
