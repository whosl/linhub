# Web → Android 功能面漂移校验审计

日期：2026-07-15（Asia/Shanghai）  
基线：`src/lib/data/service.ts`、`src/app/**/page.tsx`  
原生目标：`LinHubApi.kt`、`WorkspaceDestination`、设置/计费/后台 section enum

## Findings

1. 既有 `FEATURE_MATRIX.md` 有详细人工证据，但 Web 新增 `DataService` 方法或页面后，CI/本地构建不会自动要求 Android 登记对应实现，存在文档长期不更新的漂移风险。
2. 新增 `npm run verify:android-parity`。脚本动态提取 Web `DataService + AdminService` 方法、全部 `page.tsx` 和全部 API Route，与显式 Web→Android 语义映射核对；新方法/页面/路由未登记、旧映射过期或目标 `LinHubApi` 方法/目的地消失都会失败。
3. 设置、计费和后台的用户可见标签同时在 Web 页面源码与 Android section enum 中核对。Android 独有的“兑换码 / 用量”后台入口与 12 个超出当前 Web `DataService` 的能力独立登记，不把原生超集伪装成共同标签。
4. 当前结果为 80 个 Web service 方法、74 个唯一 Android API 方法、13 个 Web 页面、58 个 API Route、17 个 section 标签和 12 个 Android 扩展能力全部通过。
5. verifier 首跑实际发现 Web 管理页没有“兑换码”顶级标签；Android 已直接覆盖对应服务端 API。脚本据此区分共同标签与 Android 超集，避免为了通过而虚构 Web 基线。

## Current mapping summary

| 检查面 | 数量 | 结果 |
| --- | ---: | --- |
| `DataService + AdminService` 方法 | 80 | 全部登记对应原生方法 |
| 唯一 `LinHubApi` 目标方法 | 74 | 全部存在 |
| Web 页面 | 13 | 全部登记 API 能力；工作区页面另有目的地 |
| Web API Route | 58 | 全部登记一个或多个原生调用方法 |
| 设置/计费/后台标签 | 17 | Web 共同标签和 Android 超集均存在 |
| Android 扩展能力 | 12 | 登录/退出、账户导出、共享深链、媒体元数据、结果恢复、后台测试/兑换码等全部存在 |

## Verification

- `npm run verify:android-parity`：通过。
- `npx eslint --no-ignore android/tools/verify-web-android-parity.mjs`：通过。
- `npx tsc --noEmit`：通过。
- `:app:testDebugUnitTest`：通过，27 tasks。
- 前一同工作区回归已完成 Android 六任务、设备 API 合同 4/4 与 R8 22-surface 1/1；本 verifier 不进入 APK。

## Limits

该脚本是漂移守卫，不把“方法名存在”当作完整业务 E2E。语义正确性仍由真实 Lighthouse、MockWebServer 合同、Room/Compose 设备测试、R8 页面/交互 smoke 和专项审计证明。动态 API Route 的鉴权、事务、计费和失败恢复继续由各自验证器覆盖。
