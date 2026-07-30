import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadAccountExport, updateMe } from "@/api/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import { errorMessage } from "./SettingsPage";

/** 账户 Tab:资料编辑、界面偏好、数据导出、账户操作 */
export function AccountTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const messageRailEnabled = useUiStore((s) => s.messageRailEnabled);
  const setMessageRailEnabled = useUiStore((s) => s.setMessageRailEnabled);

  const [name, setName] = useState(user?.name ?? "");

  const nameMutation = useMutation({
    mutationFn: (newName: string) => updateMe({ name: newName }),
    onSuccess: (updated) => {
      // 后端返回完整 User 则直接采用;否则本地合并昵称
      if (updated && updated.id) {
        setUser(updated);
      } else if (user) {
        setUser({ ...user, name: name.trim() });
      }
      toast.success("昵称已保存");
    },
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
  });

  const exportMutation = useMutation({
    mutationFn: downloadAccountExport,
    onSuccess: () => toast.success("导出成功,文件已开始下载"),
    onError: (err) => toast.error(errorMessage(err, "导出失败")),
  });

  if (!user) return null;

  const nameDirty = name.trim() !== "" && name.trim() !== user.name;

  return (
    <div className="flex flex-col gap-6">
      {/* 个人资料 */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-4 text-sm font-semibold text-text">个人资料</h3>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="size-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-text">
              {user.name}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="truncate text-sm text-text-2">{user.email}</p>
              {user.role === "admin" && <Badge tone="primary">管理员</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex max-w-md gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="昵称"
            maxLength={32}
          />
          <Button
            variant="outline"
            disabled={!nameDirty || nameMutation.isPending}
            onClick={() => nameMutation.mutate(name.trim())}
          >
            {nameMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </section>

      {/* 界面偏好 */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-4 text-sm font-semibold text-text">界面偏好</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-text">消息导航条</p>
            <p className="mt-0.5 text-xs text-text-3">
              在聊天页右侧显示消息刻度条,便于快速定位
            </p>
          </div>
          <Switch
            checked={messageRailEnabled}
            onChange={setMessageRailEnabled}
            label="消息导航条"
          />
        </div>
      </section>

      {/* 数据与账户 */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-4 text-sm font-semibold text-text">数据与账户</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? "导出中…" : "导出我的数据"}
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.error("暂未开放,请联系管理员")}
          >
            修改密码
          </Button>
          <Button
            variant="danger"
            onClick={() => toast.error("暂未开放,请联系管理员")}
          >
            删除账户
          </Button>
        </div>
      </section>
    </div>
  );
}
