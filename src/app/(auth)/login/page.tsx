"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";
import { signIn, withAuthTimeout } from "@/lib/auth-client";
import { toast } from "sonner";

function loginErrorMessage(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (
    error.code === "INVALID_EMAIL_OR_PASSWORD" ||
    /invalid (email|password|credentials)|invalid email or password/i.test(message)
  ) {
    return "邮箱或密码错误";
  }
  return message || "邮箱或密码错误";
}

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const submittedEmail = String(form.get("email") ?? "").trim();
    const submittedPassword = String(form.get("password") ?? "");
    setLoading(true);
    try {
      const { error } = await withAuthTimeout(
        signIn.email({ email: submittedEmail, password: submittedPassword })
      );
      if (error) {
        toast.error(loginErrorMessage(error));
        return;
      }
      toast.success("欢迎回来！");
      // 登录成功后必须先清掉「未登录」时缓存的 null，
      // 否则 AuthGuard 会在 staleTime 内读到旧值并把我们弹回 /login。
      queryClient.removeQueries({ queryKey: ["current-user"] });
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="欢迎回来" subtitle="登录你的 LinHub 账户">
      <form onSubmit={submit} className="space-y-3">
        <Input
          name="email"
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Input
          name="password"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button className="w-full" size="lg" disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        还没有账户？{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          注册
        </Link>
      </p>
    </AuthShell>
  );
}
