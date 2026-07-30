import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { assertEnv } from "../env";

assertEnv();

const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

// 开发热重载时复用连接
const client =
  globalForDb._pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    // 本地 Docker/OrbStack 代理异常时不要让认证/接口请求长时间挂住。
    connect_timeout: 5,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") globalForDb._pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
