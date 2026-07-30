# Web → Android 原生 Compose 进度复核

日期：2026-07-22（Asia/Shanghai）  
审计对象：`b6d3f55` 与当前 Android 未提交工作区  
权威目标：原生 Compose 覆盖 Web 全部功能，并具备更流畅动画和更快加载

## Findings

1. 当前可执行漂移守卫覆盖 80 个 Web `DataService` 方法、13 个页面、64 条 API Route 和 17 个页面 section；没有发现网络层、ViewModel 与 Compose 三层同时缺失的已登记 Web 功能域。该结果证明入口和映射存在，不单独证明全部业务分支已经运行验收。
2. `b6d3f55` 新增 Skill Run 完成回执后，Android 已同步回执 upsert、分支隔离、任务终态、停止/重试、PPT 需求与附件。Pixel 9 AVD 的 API 合同和 Compose 交互均有确定性证据，未触发生产模型任务。
3. Android 原实现每 1.25 秒或 5 秒请求一次完整任务快照，慢于 Web EventSource 且产生额外连接开销。当前改为 `/api/skill-runs/[id]/events` 单条可取消 SSE：snapshot 即时发布，run-event/ping 不触发多余重组；断流先 GET 补尾，再按 0.75–10 秒退避重连。设备合同 3/3 通过。
4. Debug APK 已显式绑定 `https://xiaolin.wenzhuolin.xyz/`，使用 Android Debug v2 签名并安装启动；不能把它当作商店 Release。正式 keystore、正式 `assetlinks.json` 指纹和系统自动 App Link 验证仍缺外部输入。
5. “所有功能且快于 Web”的最终结论仍缺三类强证据：真实支付成功/取消/失败闭环、生产 Skill worker 的受控测试账号闭环、固定真机上与 Web 同账号同数据的交替性能 trace。AVD 和静态映射不能替代这些验收。
6. Android 工程已在 `763430d` 纳入 Git；本轮 Skill Run 同步与 SSE 优化仍是未提交工作区。`v_kimi/`、`webui-v2/` 与 `tmp/v_kimi/` 属于既有无关未跟踪目录，本轮未修改。

## Traceability Matrix

| 要求或阶段 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| Web 功能面同步 | Web 方法、页面与 API 新增时 Android 漂移检查失败 | `android/tools/verify-web-android-parity.mjs` | 80 methods / 13 pages / 64 routes / 17 sections passed | complete | 守卫不替代逐业务分支 E2E |
| 持久 Skill Run | 进度、步骤、来源、停止、重试、附件、回执与恢复 | `SkillRunCard.kt`、`SkillRunPolicy.kt`、`LinHubViewModel.kt` | JVM、API 3/3、Compose 2/2 | complete | 生产 worker 受控闭环未执行 |
| PPT 工作室 | 等待输入、12 套主题、页数/受众/媒体/格式与继续执行 | `SkillRunCard.kt`、`ApiModels.kt`、`LinHubApi.kt` | Pixel 9 AVD 表单合同与 UI 测试 | complete | 真实 PPTX/HTML 产物未运行，避免计费 |
| 任务实时加载 | 单连接即时更新、离屏取消、断流恢复 | `skillRunEvents()`、`ensureSkillRunStreaming()` | MockWebServer SSE 路由/鉴权/事件过滤 1/1 | complete | 生产边缘 5 分钟连接与网络切换待验 |
| 动画与加载优于 Web | 高频路径低重组、Profile 生效、同数据性能领先 | Baseline Profile、稳定 shell projection、SSE | 既有 AVD Profile A/B 与本轮构建/启动 | partial | 固定真机双方 trace 缺失 |
| 计费与支付 | 套餐、订单、兑换、账务及外部支付状态闭环 | `BillingScreen.kt`、幂等订单与恢复策略 | 只读 AVD、MockWebServer 与并发事务验证 | partial | 真实渠道成功/取消/失败未验 |
| 正式交付 | Release 签名、生产后端、App Links 自动验证 | `app/build.gradle.kts`、Manifest、`RELEASE.md` | Debug APK v2 验签并在 Pixel 9 AVD 启动 | partial | 正式 keystore 与最终域名声明缺失 |

## Verification

- `npm run verify:android-parity`：passed。
- `npm run verify:android-delivery`：passed，376 个候选文件、0 未豁免秘密命中。
- `:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:compileDebugAndroidTestKotlin`：passed。
- `SkillRunApiContractTest`：Pixel 9 Android Studio AVD 3/3 passed。
- 最新 APK 安装成功，`MainActivity` 为 top resumed，crash buffer 为空。

## Next Work

1. 用测试账号对 Lighthouse 生产 worker 做深度调研、数据分析、PPT 等待输入到回执的完整闭环，并记录 SSE 经过边缘代理的持续连接行为。
2. 在固定 API 35+ 真机对冷启动、工作区导航、长信息流和 Skill Run 更新做 Web/Android 同数据交替 trace。
3. 获得支付测试渠道与正式 Release keystore 后，完成支付和 App Links 最终验收。
