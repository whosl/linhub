# 外部支付返回状态同步审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD，`emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## 问题

订单创建后，原生端会通过系统浏览器打开安全 HTTPS `payUrl`，随后立即清除待打开 URL。旧生命周期策略只在 App 后台至少 5 秒、且用户回到计费页时刷新当前标签，因此快速返回或回到聊天页时可能保留旧余额、订阅、用量和流水。

## 修复

- `LinHubApp` 只在 `ACTION_VIEW` 成功后把支付返回标记交给 ViewModel；URL 无处理器时不进入等待状态。
- `LinHubViewModel` 保存一次性 `awaitingExternalPaymentReturn`，首次 `ON_START` 同步消费，无视普通 5 秒阈值。
- 支付返回调用完整 `fetchBillingSnapshot()`，并发读取用户、套餐、用量和流水；不依赖当前 `WorkspaceDestination`。
- 快照归并抽成纯函数，统一更新全局用户、所有计费列表、资源新鲜时间，并沿用已有账户 Room 与 grouped payload 写回。
- 支付全量刷新与普通长后台计费标签刷新互斥，避免同一次返回重复请求。

## 自动化证据

`ExternalPaymentReturnPolicyTest` 共四组：

1. 普通后台 4,999ms 不刷新。
2. 普通后台达到 5,000ms 刷新工作区，但不错误执行全量计费刷新。
3. 等待支付返回时即使只后台 100ms，也强制全量刷新并消费状态；下一次返回不重复。
4. 当前目的地为聊天页时，快照归并仍更新全局余额、套餐、用量、流水及全部计费资源时间戳。

构建结果：

- `:app:testDebugUnitTest`：通过
- `:app:lintDebug`：通过
- `:app:assembleDebug`：通过
- `:app:assembleBenchmark`：通过
- `:benchmark:assembleBenchmark`：通过

## 安全边界与剩余门槛

本轮没有创建真实订单、充值、兑换或变更订阅，也没有启用生产 Mock 支付。代码已闭合 App 侧返回与数据刷新状态机，但真实支付渠道的成功、取消、失败以及服务端最终状态仍需渠道可用后受控 E2E，不能由纯策略测试替代。
