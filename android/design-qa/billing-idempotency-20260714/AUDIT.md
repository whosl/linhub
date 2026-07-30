# 订单幂等与兑换原子事务审计

日期：2026-07-14（Asia/Shanghai）  
Android 设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

1. 客户端 single-flight 只能阻止当前进程内的同帧重复提交。旧 `/api/orders` 使用随机订单 ID，连接重试、边缘代理重放或 App 在未知结果后重试仍可能创建第二笔订单。
2. 旧兑换流程先原子占用卡密，再调用另一个事务入账，最后单独插入订单。服务在步骤之间终止会出现“卡密已用但余额/流水/订单不完整”。
3. Web 与 Android 订单请求现都发送 16–128 字符的 `Idempotency-Key`。服务端用“用户 ID + 操作键”的 SHA-256 前 96 bit 派生稳定商户订单号；同键不同订单语义返回 409，同键已支付直接返回原订单。
4. Android 将“订单语义签名 + 操作键”写入 DataStore。网络中断、5xx 或进程终止后，同金额/套餐重试继续使用原键；成功或明确 4xx 后清除。不同金额、套餐或订单类型自动创建新键。
5. 即时支付结算现在在单个数据库事务中以 `pending → paid` 条件更新抢占所有权，只有抢占者能更新余额/流水或 upsert 订阅；数据库异常会连订单状态一起回滚。兑换的卡密占用、余额更新、流水和订单也合并为一个事务。
6. 新增可重复的本地 PostgreSQL 集成验证器，启动隔离端口 Next dev 并直接写入临时用户/会话夹具：2 个同键充值请求最终只有 1 个 paid 订单、1 条流水和 100 分入账；2 个同卡密请求为 1 次 200 + 1 次 400，只入账 123 分；临时触发器强制流水插入失败时返回 500，卡密恢复未使用且余额不变。完整流程连续两次通过；每次结束后用户、订单、流水、卡密、触发器和函数全部清理。

## Traceability Matrix

| 要求或阶段 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 网络重放幂等 | 同一用户/操作键只对应一个订单 | `payment/idempotency.ts`、`api/orders/route.ts` | 2 路同键并发：1 订单 / 1 流水 / 100 分入账；远端 bundle marker | complete | 正式渠道尚未开放 |
| Android 未知结果重试 | 超时/5xx/重启后同语义继续复用键 | `UiPreferenceStore.kt`、`BillingIdempotencyPolicy.kt` | 签名、复用、4xx/5xx/IO 分类单测 | complete | — |
| Web 请求键 | Web 创建订单也携带独立操作键 | `api-service.ts` | Next production build | complete | Web 手动重试不跨页面持久化 |
| 订单原子结算 | 同订单并发回调只入账或续订一次 | `settlePaidOrder` 条件更新与事务 | 本地 Mock paid 并发只结算一次 | complete | 真实支付回调 E2E 待渠道 |
| 兑换原子性 | 卡密占用、入账、流水、订单全有或全无 | `api/redeem/route.ts` 单事务 | 并发 1 成 1 拒；强制 ledger 失败后 code/余额回滚 | complete | 未消耗真实卡密 |
| 生产部署 | 新路由已上线且普通读取不回归 | staging build + `.next` 可回滚交换 | 服务 active；公网首页 200；AVD 5 类 GET 全部 200；0 crash | complete | 旧 `.next` 暂保留回滚 |
| 非破坏性 | 验收不产生订单、充值、兑换或余额变化 | 只读健康检查与冷启动 GET | 部署后时间窗 `orders` 新增数为 0 | complete | — |

## Progress Summary

当前未提交工作区与 Lighthouse 已形成“UI single-flight + 稳定商户订单号 + Android 持久重试键 + 服务端条件结算事务”的分层防重，并修复兑换跨事务崩溃窗口。真实支付成功、取消、失败及异步回调仍没有外部渠道证据，因此计费总域保持 partial。

可重复命令：`npm run verify:billing-idempotency`。脚本硬限制数据库主机为 localhost/127.0.0.1/::1 且端口为 5433，防止误连 Lighthouse。

## Next Work

1. 把本地幂等集成验证加入正式 CI，并为免费订阅 upsert 增加同等级并发覆盖。
2. 接入支付沙箱后验证 pending/paid/cancelled/failed 与回调重放。
3. 继续固定真机 Web/PWA 与原生性能对照。
