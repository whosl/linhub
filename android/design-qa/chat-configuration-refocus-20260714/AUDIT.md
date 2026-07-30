# 聊天核心配置聚焦刷新审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD，`emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

Web `ChatView` 在挂载时使用 React Query 读取模型与有效默认值、风格、知识库、当前用户、当前会话、Artifact、活动项目和 Skill；默认 `staleTime` 为 30 秒，窗口重新聚焦会重新验证。Android 完成当前页面恢复后，聊天目的地仍只刷新用户和会话，因此管理员跨设备停用当前模型、更新风格或知识库时，原生端可能继续保留旧配置直到冷启动。

## 修复

- 30 秒聊天页恢复并发刷新模型、风格、知识库、用户与会话。
- 只有已打开会话才刷新 Artifact，只有当前存在项目/Skill 上下文才刷新项目索引或单个 Skill，避免无条件扩大请求。
- 模型响应通过单一 `withRefreshedModels` reducer 归并：保留有效显式选择；失效时回退服务端默认；过滤图像生成模型；没有可聊天模型时清空选择；同步重算思考强度。
- 新模型列表写入 Room 并更新模型同步游标；Room 观察器继续执行相同的有效选择规则。
- 单个 Skill 强制刷新使用新值优先去重，避免旧列表项遮蔽服务端新值。

## 自动化证据

`ChatConfigurationRefreshPolicyTest`：

1. 有效显式模型在刷新后保持。
2. 当前模型被移除时回退到服务端默认模型并更新思考强度。
3. 服务端默认若是图像生成模型，改用首个可聊天模型。
4. 没有可聊天模型时清空默认和当前选择。

全量命令覆盖 `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleBenchmark`、`:benchmark:assembleBenchmark`。首次组合运行暴露 `lintAnalyzeDebug*` 与 `kspBenchmarkKotlin` 同时读写 Benchmark Room 生成源码目录的竞态；构建脚本增加同一任务图内的 `mustRunAfter` 后，相同命令 `BUILD SUCCESSFUL`，且单独 Lint 不会因此依赖 Benchmark 构建。

## Pixel 9 AVD A/B

在普通新聊天首页等待启动请求完成后清空 Logcat：

| 后台时长 | 返回后的 GET | 结果 |
| --- | --- | --- |
| 31 秒 | `/api/models`、`/api/conversations`、`/api/styles`、`/api/me`、`/api/knowledge` | 五项 200；约 3.1–3.5 秒并发完成；首页与模型选择器持续可用 |
| 6 秒 | `/api/conversations` | 200；没有模型、风格、用户或知识库额外请求 |

两轮前台 Activity 均为 `com.linhub.android.debug/com.linhub.android.MainActivity`，Crash Buffer 为空。设备验证没有修改模型、默认值、风格、知识库或 Skill，没有发送消息和产生计费。

## 结论与边界

Android 聊天核心配置现与 Web 的 30 秒聚焦重新验证语义对齐，并用原生缓存先显避免重新挂载页面。模型失效回退已有确定性 reducer 证据；真实管理员停用生产模型属于高影响写操作，本轮没有为测试而执行，仍由受控管理端回归或专用测试模型验证。
