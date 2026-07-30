import { create } from "zustand";
import type { User } from "@/api/types";
import { getMe, signIn, signOut, signUp } from "@/api/auth";
import { getToken } from "@/api/http";

interface AuthState {
  /** null = 未加载;false = 未登录 */
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 校验本地 token 并拉取当前用户 */
  bootstrap: () => Promise<void>;
  setUser: (user: User | null) => void;
  markUnauthenticated: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: "idle",
  error: null,

  login: async (email, password) => {
    await signIn(email, password);
    // 登录响应里未必是完整 User,统一再拉一次 /api/me
    const me = await getMe();
    set({ user: me, status: me ? "authenticated" : "unauthenticated", error: null });
  },

  register: async (name, email, password) => {
    await signUp(name, email, password);
    const me = await getMe();
    set({ user: me, status: me ? "authenticated" : "unauthenticated", error: null });
  },

  logout: async () => {
    try {
      await signOut();
    } finally {
      set({ user: null, status: "unauthenticated", error: null });
    }
  },

  bootstrap: async () => {
    if (!getToken()) {
      set({ user: null, status: "unauthenticated", error: null });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const me = await getMe();
      if (me) {
        set({ user: me, status: "authenticated" });
      } else {
        set({ user: null, status: "unauthenticated" });
      }
    } catch (err) {
      // 网络错误等:保留 token,给重试态
      const message = err instanceof Error ? err.message : "加载失败";
      set({ status: "error", error: message });
    }
  },

  setUser: (user) =>
    set({ user, status: user ? "authenticated" : "unauthenticated" }),

  markUnauthenticated: () => {
    if (get().status !== "unauthenticated") {
      set({ user: null, status: "unauthenticated" });
    }
  },
}));
