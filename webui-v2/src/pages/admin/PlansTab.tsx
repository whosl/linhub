// 套餐 Tab:列表 / CRUD(features 逗号分隔)/ 删除确认

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  deletePlan,
  getPlans,
  savePlan,
  type AdminPlan,
  type ModelTier,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Field,
  formatCents,
  parseIntOr,
  Select,
  SwitchRow,
  TableWrap,
  tableClass,
  tdClass,
  Textarea,
  thClass,
} from "./shared";

export function PlansTab() {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<AdminPlan | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPlan | null>(null);

  const plansQuery = useQuery({ queryKey: adminKeys.plans, queryFn: getPlans });

  const deleteMutation = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err, "删除失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.plans }),
  });

  if (plansQuery.isPending) return <PageLoading text="加载套餐…" />;
  if (plansQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(plansQuery.error, "加载失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => plansQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const plans = plansQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-2">共 {plans.length} 个套餐</p>
        <Button size="sm" onClick={() => setEditTarget("new")}>
          新增套餐
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState text="暂无套餐,点击右上角新增" />
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>名称</th>
                <th className={thClass}>月价</th>
                <th className={thClass}>月额度</th>
                <th className={thClass}>模型档位</th>
                <th className={thClass}>特性</th>
                <th className={thClass}>状态</th>
                <th className={thClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className={cn(tdClass, "font-medium whitespace-nowrap")}>
                    {p.name}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {formatCents(p.priceCentsPerMonth)}/月
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    {p.monthlyQuotaCents === -1
                      ? "无限"
                      : `${formatCents(p.monthlyQuotaCents)}/月`}
                  </td>
                  <td className={tdClass}>
                    <Badge tone={p.modelTier === "pro" ? "primary" : "default"}>
                      {p.modelTier === "pro" ? "Pro" : "免费"}
                    </Badge>
                  </td>
                  <td className={tdClass}>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.features.length === 0 ? (
                        <span className="text-xs text-text-3">-</span>
                      ) : (
                        p.features.map((f) => <Badge key={f}>{f}</Badge>)
                      )}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={p.enabled ? "success" : "default"}>
                      {p.enabled ? "启用" : "停用"}
                    </Badge>
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditTarget(p)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleteTarget(p)}
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

      {editTarget && (
        <PlanEditDialog target={editTarget} onClose={() => setEditTarget(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除套餐"
          description={`确定删除套餐「${deleteTarget.name}」吗?已订阅用户可能受影响,此操作不可撤销。`}
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

/** 新增 / 编辑套餐(features 用逗号分隔输入) */
function PlanEditDialog({
  target,
  onClose,
}: {
  target: AdminPlan | "new";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = target !== "new" ? target : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [price, setPrice] = useState(String(editing?.priceCentsPerMonth ?? 0));
  const [quota, setQuota] = useState(String(editing?.monthlyQuotaCents ?? -1));
  const [modelTier, setModelTier] = useState<ModelTier>(
    editing?.modelTier ?? "free",
  );
  const [features, setFeatures] = useState(
    (editing?.features ?? []).join(", "),
  );
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);

  const saveMutation = useMutation({
    mutationFn: savePlan,
    onSuccess: () => {
      toast.success(editing ? "已保存" : "已创建");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.plans }),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error("请填写套餐名称");
      return;
    }
    saveMutation.mutate({
      id: editing?.id,
      name: name.trim(),
      description: description.trim(),
      priceCentsPerMonth: parseIntOr(price, 0),
      monthlyQuotaCents: parseIntOr(quota, -1),
      modelTier,
      features: features
        .split(/[,,]/)
        .map((f) => f.trim())
        .filter(Boolean),
      enabled,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "编辑套餐" : "新增套餐"}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="描述">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="月价(分)">
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="月额度(分,-1 无限)">
            <Input
              type="number"
              min={-1}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
          </Field>
        </div>
        <Field label="模型档位">
          <Select
            value={modelTier}
            onChange={(e) => setModelTier(e.target.value as ModelTier)}
          >
            <option value="free">免费</option>
            <option value="pro">Pro</option>
          </Select>
        </Field>
        <Field label="特性(逗号分隔)">
          <Input
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder="例如:优先队列, 专属客服"
          />
        </Field>
        <SwitchRow label="启用" checked={enabled} onChange={setEnabled} />
      </div>
    </Dialog>
  );
}
