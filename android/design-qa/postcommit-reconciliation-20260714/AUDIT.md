# 写操作提交后校准语义审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`，Android 17 / API 37  
审计范围：用户计费订单/兑换，以及后台批量模型导入、余额赠送、兑换码生成

## Findings

1. Web 在订单或兑换接口返回成功后立即发布成功反馈，只异步失效相关查询；Android 旧实现把随后用户、套餐、用量、流水四个 GET 与写操作包进同一个 `Result`。服务端写入已经成功但任一读回失败时，Android 会错误提示“操作失败”，并且支付 URL 要等额外四个请求完成后才发布。
2. 后台批量导入模型、赠送余额和生成兑换码存在同样问题：首个写接口成功后再同步读回列表/详情，读回失败会把已落库操作误报为失败，用户重试还可能执行第二次写入。
3. 兑换成功后 Android 旧表单不会像 Web 一样清空兑换码，容易让用户误以为需要再次提交。

## 实现

- 新增 `CommittedMutationPipeline.kt`，显式区分 `Rejected` 与 `Committed`。服务端提交返回后先同步执行 `onCommitted`，再尝试读回校准；校准错误只附着在 `Committed` 结果上。协程取消继续传播，不能伪装成普通刷新失败。
- 订单成功后立即发布 HTTPS 支付 URL 或已生效提示，再并发读取账务快照；订单接口明确成功即清除幂等键，后续校准失败不会让用户重复创建订单。401 仍会触发统一会话失效。
- 兑换成功后立即增加当前内存余额、发布成功事件并清空兑换码；权威快照随后覆盖乐观值。校准失败时提示“兑换成功，账务数据暂未刷新”，不再声称兑换失败。
- 后台批量模型导入、余额赠送和兑换码生成先应用可安全推导的本地结果，并把相关资源标为待校准；读回失败保留成功语义和手动刷新入口。管理员给自己赠送余额时，全局账户余额也同步更新。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 提交与校准分离 | 写接口成功后，后续 GET 失败不能改写为操作失败 | `CommittedMutationPipeline.kt`、`LinHubViewModel.kt` | JVM 覆盖成功、提交失败、校准失败、取消、401 共 9 项相关断言 | complete | — |
| 支付跳转低延迟 | 订单返回后立即发布支付 URL，不等待四个账务 GET | `publishBillingOrder` 在 `onCommitted` 中执行 | 顺序测试锁定 `commit → publish → reconcile` | complete | 真实渠道成功/取消/失败仍为外部门槛 |
| 兑换即时反馈 | 成功立即更新余额并清空输入；失败保留输入 | `withBalanceDelta`、`billingRedeemSuccessEvent`、`RechargeContent` | Pixel 9 AVD Compose 测试 1/1，点击后成功事件前保留原码、事件后显示空占位 | complete | 未消费生产兑换码 |
| 后台写入恢复 | 导入模型、赠送、生成码的读回失败保持已提交语义 | 三个 `commitThenReconcile` 调用与资源 stale 标记 | JVM 校准失败/401策略；R8 22-surface smoke | complete | 未执行生产高风险写操作 |
| 页面回归 | 设置、计费、后台页面在 R8 后仍全部可达 | `WorkspaceSurfaceSmokeTest` | 1/1，38.502 秒，0 OkHttp、0 FATAL、Crash Buffer 为空 | complete | — |

## 验证

- 完整六任务：`testDebugUnitTest`、`lintDebug`、Debug App/AndroidTest APK、R8 Benchmark App/测试 APK 全部通过。
- `BillingRedeemUiTest`：Pixel 9 AVD 1/1，通过时间 4.818 秒；测试只使用隔离 Compose 内容，不访问网络。
- `WorkspaceSurfaceSmokeTest`：R8 non-debuggable 变体 1/1，通过时间 38.502 秒；测试时段 0 OkHttp、0 FATAL，Crash Buffer 为空。
- 重启 AVD 恢复 Apple M5 host GLES 后，固定生产后端 Debug APK 三次冷启动为 759 / 841 / 744ms；首屏由 Room 缓存先显，同时真实 `/api/me`、`/api/models`、`/api/conversations` 在约 1.45–1.73 秒后完成 200，不阻塞首帧。
- 本轮没有创建订单、充值、订阅、兑换、赠送余额、导入远端模型或生成兑换码，没有修改生产账务或后台数据。

## Remaining Gates

- 真实支付渠道的成功、取消、失败和回调重放仍需外部测试环境。
- 固定 API 35+ 真机的 Web/PWA 与原生交替性能采样仍未完成。
