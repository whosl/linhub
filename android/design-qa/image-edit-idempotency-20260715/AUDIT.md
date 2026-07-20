# 图片编辑幂等与跨进程恢复审计

日期：2026-07-15（Asia/Shanghai）  
Android 设备：Android Studio Pixel 9 AVD `emulator-5554`，Android 17 / API 37  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

1. 旧消息图片编辑由“生成新媒体并计费”和“把新 URL 写回消息”两个请求组成。若第一个请求已提交、第二个请求断网或响应丢失，Android 重试会再次调用图片模型，存在重复媒体和重复计费窗口。
2. 服务端现在强制 16–128 字符 `Idempotency-Key`，以用户 ID 与操作键的 HMAC 派生稳定私有媒体 ID。同键进程内请求共享 single-flight，进程重启后则由稳定媒体记录直接重放；结果查询使用同一 GET 路由。
3. Android 以作用域、原图 URL、修剪后的描述和蒙版字节生成稳定 SHA-256 操作键。消息编辑在调用模型前写入 Room；未知响应先查询既有结果，已有 `newUrl` 时只重试消息关联，不再调用图片模型。
4. 消息 PATCH 已支持成功重放：若消息已经包含 `newUrl`，返回 `alreadyApplied=true`。若原消息已删除，Android 清理待恢复记录并提示结果仍保存在文件中心。
5. 待恢复记录使用 `operation:message-image:` 前缀，90 天清理和 200 项普通缓存淘汰显式排除 `operation:%`。启动、前台恢复和网络重连均会扫描恢复，并以逐消息 single-flight 防止手动重试与自动恢复并发。
6. 本地隔离 PostgreSQL 路由集成验证以 32 个同键请求重放同一资产，额外用量为 0；消息 PATCH 首次成功后重放返回成功。验证器在 `finally` 清理临时用户、会话、媒体和用量记录。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 同键生成幂等 | 同一用户和操作只调用一次上游并只计费一次 | `image-edit-idempotency.ts`、`api/edit-image/route.ts` | 32 路同键、唯一资产、`extraUsage=0` | complete | — |
| 跨进程结果查询 | App 不确定服务端是否提交时可只查询结果 | `GET /api/edit-image`、`LinHubApi.imageEditResult` | 本地真实路由查询 200；生产未登录查询 401 | complete | — |
| 消息关联重放 | PATCH 响应丢失后再次关联仍成功 | `messageHasImageUrl`、消息图片 PATCH | `alreadyApplied=true` | complete | — |
| Android 操作持久化 | 生成前落盘，重启后恢复同一操作 | `PendingMessageImageEdit`、`LinHubViewModel` | 策略 JVM 测试；Room 设备测试 1/1 | complete | — |
| 缓存清理安全 | 普通缓存淘汰不删除待恢复操作 | `CacheDaos.kt`、`pruneCache` | 201 个普通缓存 + 1 个旧操作记录，清理后操作仍在 | complete | — |
| 并发恢复 | 手动重试与自动恢复不能并行处理同一消息 | `KeyedSingleFlightGate` | gate 单元测试与 R8 回归 | complete | — |
| 生产部署 | 新 GET 路由上线且可快速回滚 | staging production build + 原子 `.next` 交换 | 新构建 `YBW_jgXPPoGYlPL94rBql`；首页 200；GET 401；服务 active | complete | 旧构建暂保留回滚 |
| 非破坏性 | 部署验收不调用生产图片模型、不新增媒体或计费 | 只读公网健康检查与离线夹具 | 未执行生产 POST/PATCH；R8 测试 0 OkHttp | complete | — |

## Verification

- `npm run verify:image-edit-idempotency`：通过。
- `npm run verify:image-edit-route`：`resultLookup.status=200`，32 次重放唯一资产、0 额外用量，PATCH 重放成功。
- `npx tsc --noEmit`：通过。
- Android 六任务：`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleDebugAndroidTest`、`assembleBenchmark`、`:benchmark:assembleBenchmark` 全部通过。
- `DurableOperationCacheTest`：Pixel 9 AVD 1/1 通过。
- R8 `WorkspaceSurfaceSmokeTest`：修复横向标签动画期间一次点击丢失的测试注入竞态后 1/1 通过；目标内容仍是唯一成功条件。
- R8 `WorkspaceInteractionSmokeTest`：1/1 通过。
- 最新 Debug APK 冷启动 708ms，Crash Buffer 为空，0 FATAL。

## Deployment

- 生产旧构建：`xgkpZxhS2EHuZn4sSiomV`。
- 生产新构建：`YBW_jgXPPoGYlPL94rBql`。
- 回滚目录：`.next.rollback-20260715-imageedit`。
- 新构建本机第二次探测即达到首页 200、图片编辑 GET 401；公网再次确认 200 / 401，systemd 日志显示 Next.js 191ms 就绪。
- 部署过程没有调用图片生成/编辑上游，没有创建消息、媒体或计费记录。

## Remaining gates

本轮关闭了代码、重放、进程恢复和生产部署缺口。图片编辑在 API 35+ 真机上的进程终止/网络切换兼容性仍随全局真机验收执行，不影响该幂等业务语义的完成结论。
