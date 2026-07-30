import type { NextRequest } from "next/server";
import { assertRegistrationAllowed, auth } from "@/lib/server/auth";
import { toNextJsHandler } from "better-auth/next-js";

const authHandlers = toNextJsHandler(auth.handler);

export const GET = authHandlers.GET;

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith("/sign-up/email")) {
    try {
      await assertRegistrationAllowed();
    } catch (e) {
      return Response.json(
        {
          code: "REGISTRATION_DISABLED",
          message: e instanceof Error ? e.message : "当前未开放注册，请联系管理员",
        },
        { status: 403 }
      );
    }
  }

  return authHandlers.POST(req);
}
