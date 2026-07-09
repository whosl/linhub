"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";
import { signUp, withAuthTimeout } from "@/lib/auth-client";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const submittedName = String(form.get("name") ?? "").trim();
    const submittedEmail = String(form.get("email") ?? "").trim();
    const submittedPassword = String(form.get("password") ?? "");
    setLoading(true);
    try {
      const { error } = await withAuthTimeout(
        signUp.email({
          email: submittedEmail,
          password: submittedPassword,
          name: submittedName,
        })
      );
      if (error) {
        toast.error(error.message ?? "注册失败");
        return;
      }
      toast.success("注册成功！");
      // 注册即登录，同样要先清掉「未登录」时缓存的 null 再跳转。
      queryClient.removeQueries({ queryKey: ["current-user"] });
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="创建账户" subtitle="第一个注册的用户将自动成为管理员">
      <form onSubmit={submit} className="space-y-3">
        <Input
          name="name"
          placeholder="昵称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <Input
          name="email"
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          name="password"
          type="password"
          placeholder="密码（至少 8 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <Button className="w-full" size="lg" disabled={loading}>
          {loading ? "注册中…" : "注册"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        已有账户？{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          登录
        </Link>
      </p>
    </AuthShell>
  );
}
