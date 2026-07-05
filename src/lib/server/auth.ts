import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { db, schema } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
      balanceCents: {
        type: "number",
        defaultValue: 0,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // 第一个注册的用户自动成为管理员
        before: async (user) => {
          const [existing] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
          return {
            data: {
              ...user,
              role: existing ? "user" : "admin",
              // 新用户赠送 ¥3 体验额度
              balanceCents: 300,
            },
          };
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

export type Session = typeof auth.$Infer.Session;

/** 服务端获取当前会话；未登录返回 null */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** 要求登录，否则抛 401 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  return session;
}

/** 要求管理员 */
export async function requireAdmin() {
  const session = await requireSession();
  if ((session.user as { role?: string }).role !== "admin") {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
  return session;
}
