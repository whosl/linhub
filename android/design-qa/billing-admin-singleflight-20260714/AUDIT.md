# 计费与管理后台写操作 Single-Flight 审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`

## Findings

1. 计费订单和兑换入口虽检查 `loadingDestinations`，但旧实现进入 `viewModelScope.launch` 后才设置加载态。同一帧内的快速双击可以让两个调用都在状态重组前越过检查，存在重复创建订单或重复提交兑换码的风险。
2. 管理后台的通用 `runAdminMutation` 旧实现没有入口所有权检查；供应商/模型/套餐/用户余额与订阅/审核/设置/MCP/兑换码等写操作可在加载态发布前被重复排队。UI 禁用按钮不能作为并发正确性边界。
3. 新增原子 `SingleFlightMutationGate`。计费的充值、订阅和兑换共享一个 gate；管理后台所有通用 mutation 共享另一个 gate。入口在创建协程前同步获取所有权并发布 loading，重复或跨入口提交立即拒绝。
4. 所有权和 loading 统一在 `finally` 中释放，因此 API 成功、业务异常和协程取消都不会让按钮永久卡死。计费与后台使用独立 gate，互不阻塞。

## Traceability Matrix

| 要求或阶段 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 计费防重复 | 充值/订阅/兑换同一时间只允许一个高风险写操作 | `LinHubViewModel.kt`、`SingleFlightMutationGate.kt` | 重入与 32 路并发 gate 单测 | complete | 未创建真实订单 |
| 后台防重复 | 管理后台通用 mutation 不可被同帧双击或多入口并发重复提交 | `runAdminMutation` 的同步 gate | 独立 gate 与重复抢占单测 | complete | 未触碰生产后台数据 |
| 失败/取消恢复 | 成功、异常或取消后均释放所有权与 loading | 两条调用链的 `try/finally` | gate 释放后可再次获取的单测；完整构建 | complete | API 失败文案仍由既有 E2E 覆盖 |
| 域隔离 | 计费与后台不互相阻塞 | 两个独立 gate 实例 | 单测同时获取两个 gate | complete | — |
| R8 页面回归 | 加固不破坏计费 4 标签与后台 9 标签 | `WorkspaceSurfaceSmokeTest` | Pixel 9 AVD 1/1（22.403 秒），0 OkHttp / 0 FATAL / 0 crash | complete | — |

## Progress Summary

当前未提交工作区已堵住计费和管理后台最危险的进程内重复提交窗口，并证明失败后 gate 可恢复。本轮没有创建订单、兑换、赠送余额、修改订阅、生成兑换码或执行任何生产写操作。

## Next Work

1. 为各 API 写操作逐步引入可注入的成功/业务失败/401/超时测试替身，验证服务端状态与 UI 草稿恢复。
2. 服务端幂等键与原子结算已在后续 `billing-idempotency-20260714` 轮次完成；拿到支付测试渠道后继续验证真实成功、取消、失败和回调重放。
3. 固定真机继续完成 Web/PWA 与原生性能对照。
