# 计费与管理后台 Android API 合同审计

日期：2026-07-15（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`，Android 17 / API 37  
测试服务器：设备 loopback MockWebServer，不连接 Lighthouse

## Findings

1. 既有测试已覆盖计费/后台 single-flight、幂等键保留、`commit → publish → reconcile` 顺序与 401 传播，但没有执行 Android `LinHubApi` 的真实 OkHttp 编解码。请求路径、鉴权头、幂等头、JSON 字段、HTTP 错误与网络超时仍主要依赖人工远端验收。
2. 新增 `BillingAdminApiContractTest`，在设备 loopback 启动 MockWebServer，以真实 `SessionStore` 和 `LinHubApi` 发请求。测试不读取生产令牌、账号、Room 或网络，也不产生订单、兑换、余额赠送和兑换码。
3. API 客户端新增可选 `callTimeoutMillis` 注入，默认 `0`，保持生产 OkHttp“无全局 call timeout、沿用既有连接/读写超时”的行为；测试使用 250ms，服务端延迟响应 2 秒，证明未知结果会在边界内作为非 `ApiException` 的 `IOException` 返回。
4. 订单成功测试逐项验证 Bearer、`Idempotency-Key`、`POST /api/orders` 和充值 JSON，并解析完整 pending 订单；401 测试确认 `status=401` 与服务端安全错误文案均保留，ViewModel 可按状态清会话。
5. 后台测试验证余额赠送的 `userId/amountCents/note` 合同、兑换码生成响应解析，以及 500 `ledger failed` 的状态与文案保真。
6. MockWebServer 只位于 `debugAndroidTestRuntimeClasspath`；`debugRuntimeClasspath` 明确无匹配依赖，不会增加 Debug、Benchmark 或 Release 包体与启动路径。

## Traceability Matrix

| 分支 | 期望行为 | 设备证据 | 状态 |
| --- | --- | --- | --- |
| 订单成功 | 鉴权、幂等头、路径、JSON 与订单解析准确 | `billingOrder_successSendsAuthorizationBodyAndIdempotencyKey` | complete |
| 订单 401 | 保留 401 供会话失效，不吞成普通 IO 错误 | `billingOrder_unauthorizedPreservesHttpStatusForSessionInvalidation` | complete |
| 订单超时 | 未知结果在测试边界内返回 IO 错误，便于保留幂等键 | `billingOrder_timeoutReturnsUnknownIoFailureWithinBound`，281ms | complete |
| 后台成功 | 余额赠送请求与兑换码结果合同准确 | `adminWrites_successAndServerFailureKeepExactContracts` | complete |
| 后台 500 | HTTP 状态和安全错误文案不丢失 | 同一测试中的 `ledger failed` 分支 | complete |
| 生产隔离 | 测试依赖与短 call timeout 不进入生产行为 | runtime dependency insight；默认参数 0 | complete |

## Verification

- `BillingAdminApiContractTest`：4/4，通过；测试套件 0.461 秒，其中延迟响应超时分支 0.281 秒。
- Android 六任务全部通过，共 166 tasks；MockWebServer 不在 `debugRuntimeClasspath`。
- non-debuggable R8 `WorkspaceSurfaceSmokeTest`：1/1，通过，25.337 秒。
- 测试只访问设备 `localhost`，没有生产 OkHttp 请求或业务写入。

## Remaining gates

合同层已经覆盖可注入的成功、401、500 和真实网络超时。计费总域仍保持 partial，因为真实支付渠道的成功、取消、失败和异步回调重放尚无外部证据；管理后台仍需固定真机兼容性回归。完整 ViewModel 级的逐接口状态注入可继续扩展，但不再是请求协议盲区。
