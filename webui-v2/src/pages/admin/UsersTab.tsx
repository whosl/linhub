// 用户 Tab:列表 / 充值 / 详情(用量+流水)/ 修改订阅 / 删除

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  deleteUser,
  getAdminUserDetail,
  getAdminUsers,
  getPlans,
  topUpUser,
  updateUserSubscription,
  type AdminUser,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Field,
  formatCents,
  formatDateTime,
  parseIntOr,
  Select,
  TableWrap,
  tableClass,
  tdClass,
  thClass,
} from "./shared";

/** 余额字段兼容 balanceCents / balance */
function balanceOf(user: AdminUser): number {
  return user.balanceCents ?? user.balance ?? 0;
}

export function UsersTab() {
  const queryClient = useQueryClient();
  const [topUpTarget, setTopUpTarget] = useState<AdminUser | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminUser | null>(null);
  const [subTarget, setSubTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const usersQuery = useQuery({
    queryKey: adminKeys.users,
    queryFn: getAdminUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      toast.success("已删除用户");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err, "删除失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });

  if (usersQuery.isPending) return <PageLoading text="加载用户…" />;
  if (usersQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(usersQuery.error, "加载失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => usersQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const users = usersQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-2">共 {users.length} 个用户</p>

      {users.length === 0 ? (
        <EmptyState text="暂无用户" />
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>邮箱</th>
                <th className={thClass}>昵称</th>
                <th className={thClass}>角色</th>
                <th className={thClass}>余额</th>
                <th className={thClass}>订阅</th>
                <th className={thClass}>注册时间</th>
                <th className={thClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{u.email}</td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {u.name || "-"}
                  </td>
                  <td className={tdClass}>
                    <Badge tone={u.role === "admin" ? "primary" : "default"}>
                      {u.role === "admin" ? "管理员" : "用户"}
                    </Badge>
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {formatCents(balanceOf(u))}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {u.subscription ? (
                      <span>
                        {u.subscription.planName}
                        <span className="ml-1 text-xs text-text-2">
                          {formatDateTime(u.subscription.expiresAt)} 到期
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-text-3">未订阅</span>
                    )}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap text-text-2")}>
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTopUpTarget(u)}
                      >
                        充值
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailTarget(u)}
                      >
                        详情
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSubTarget(u)}
                      >
                        改订阅
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleteTarget(u)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {topUpTarget && (
        <TopUpDialog user={topUpTarget} onClose={() => setTopUpTarget(null)} />
      )}
      {detailTarget && (
        <UserDetailDialog
          user={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
      {subTarget && (
        <SubscriptionDialog user={subTarget} onClose={() => setSubTarget(null)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="删除用户"
          description={`确定删除用户「${deleteTarget.email}」吗?该用户的会话、数据将一并删除,此操作不可撤销。`}
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

/** 充值 / 赠送:金额按元输入,提交时转分 */
function TopUpDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: topUpUser,
    onSuccess: () => {
      toast.success("已充值");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "充值失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });

  const submit = () => {
    const yuan = Number(amount);
    if (!Number.isFinite(yuan) || yuan === 0) {
      toast.error("请输入有效金额");
      return;
    }
    mutation.mutate({
      userId: user.id,
      amountCents: Math.round(yuan * 100),
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`充值 — ${user.email}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "提交中…" : "确认充值"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-2">
          当前余额:{formatCents(balanceOf(user))};支持负数扣减
        </p>
        <Field label="金额(元)">
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例如:10.00"
          />
        </Field>
        <Field label="备注(可选)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如:活动赠送"
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** 用户详情:用量记录 + 余额流水 两个子 Tab */
function UserDetailDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"usage" | "ledger">("usage");

  const detailQuery = useQuery({
    queryKey: adminKeys.userDetail(user.id),
    queryFn: () => getAdminUserDetail(user.id),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`用户详情 — ${user.email}`}
      widthClassName="max-w-2xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Tabs
          tabs={[
            { value: "usage", label: "用量记录" },
            { value: "ledger", label: "余额流水" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "usage" | "ledger")}
        />

        {detailQuery.isPending && <PageLoading text="加载详情…" />}
        {detailQuery.isError && (
          <p className="py-6 text-center text-sm text-danger">
            {errorMessage(detailQuery.error, "加载失败")}
          </p>
        )}

        {detailQuery.isSuccess && tab === "usage" && (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {detailQuery.data.usageRecords.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-2">暂无用量记录</p>
            ) : (
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>模型</th>
                    <th className={thClass}>输入 token</th>
                    <th className={thClass}>输出 token</th>
                    <th className={thClass}>费用</th>
                    <th className={thClass}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {detailQuery.data.usageRecords.map((r) => (
                    <tr key={r.id}>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {r.modelName}
                      </td>
                      <td className={tdClass}>{r.inputTokens}</td>
                      <td className={tdClass}>{r.outputTokens}</td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {formatCents(r.costCents)}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-text-2")}>
                        {formatDateTime(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {detailQuery.isSuccess && tab === "ledger" && (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {detailQuery.data.ledger.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-2">暂无流水</p>
            ) : (
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>金额</th>
                    <th className={thClass}>余额</th>
                    <th className={thClass}>原因</th>
                    <th className={thClass}>说明</th>
                    <th className={thClass}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {detailQuery.data.ledger.map((e) => (
                    <tr key={e.id}>
                      <td
                        className={cn(
                          tdClass,
                          "whitespace-nowrap",
                          e.amountCents >= 0 ? "text-success" : "text-danger",
                        )}
                      >
                        {e.amountCents >= 0 ? "+" : ""}
                        {formatCents(e.amountCents)}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {formatCents(e.balanceAfterCents)}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {e.reason}
                      </td>
                      <td className={cn(tdClass, "max-w-48 truncate text-text-2")}>
                        {e.description || "-"}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-text-2")}>
                        {formatDateTime(e.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** 修改订阅:选择套餐 + 有效天数,或清除订阅 */
function SubscriptionDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState(user.subscription?.planId ?? "");
  const [days, setDays] = useState("30");

  const plansQuery = useQuery({ queryKey: adminKeys.plans, queryFn: getPlans });

  const mutation = useMutation({
    mutationFn: (input: { planId: string | null; expiresInDays?: number }) =>
      updateUserSubscription(user.id, input),
    onSuccess: (_data, input) => {
      toast.success(input.planId ? "已更新订阅" : "已清除订阅");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "操作失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });

  const submit = () => {
    if (planId === "") {
      mutation.mutate({ planId: null });
      return;
    }
    mutation.mutate({ planId, expiresInDays: parseIntOr(days, 30) });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`修改订阅 — ${user.email}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "提交中…" : "确认"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {user.subscription && (
          <p className="text-xs text-text-2">
            当前:{user.subscription.planName},
            {formatDateTime(user.subscription.expiresAt)} 到期
          </p>
        )}
        <Field label="套餐">
          {plansQuery.isPending ? (
            <p className="text-sm text-text-2">加载套餐…</p>
          ) : (
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">清除订阅</option>
              {(plansQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}({formatCents(p.priceCentsPerMonth)}/月)
                </option>
              ))}
            </Select>
          )}
        </Field>
        {planId !== "" && (
          <Field label="有效天数">
            <Input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
