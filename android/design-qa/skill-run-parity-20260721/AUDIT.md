# Web → Android 持久 Skill Run 同步审计

日期：2026-07-21（Asia/Shanghai）  
基线：Web `skill-run-card.tsx`、`ppt-studio-brief-card.tsx`、Skill Run API 与完成回执  
范围：当前工作区；不执行生产 Skill、模型调用或计费写入

## Findings

1. Web 在原 Android 覆盖审计后新增持久 Skill Run。Android 旧版只会把 `start_deep_research`、`start_data_analysis`、`start_ppt_studio` 当普通工具结果，无法读取任务进度、停止、重试、提交 PPT 需求或恢复附件。
2. Android 现补齐 `SkillRunSnapshot/Step/Attachment` 与 PPT Brief 模型，`LinHubApi` 覆盖快照、停止、重试、需求提交和管理员 ZIP Skill 包导入。
3. ViewModel 按可见 runId 引用计数维护一条原生 SSE 长连接，快照到达即更新；离开视口会取消 OkHttp Call。代理断流、网络切换或服务端 290 秒窗口结束后先 GET 补尾，再按 0.75–10 秒退避重连；终态继续等待 completion receipt 为 completed/failed 后才结束。读失败保留卡片重试，写操作按 runId single-flight，并在取消时可靠释放。
4. 原生信息流新增与 Web 同构的任务卡：状态、阶段、进度、步骤、来源、失败原因、停止/重试和 SAF 附件下载。PPT 工作室同步 8 个字段及 12 套主题。
5. 同步过程中 Web 又新增完成回执。Android 会把快照中的 completionMessage 幂等 upsert 到已加载转录并立即落 Room；`skill-run-receipt` 不成为 current leaf、普通分支或重新生成/反馈对象。
6. 漂移守卫登记新增 6 个 Skill Run/Skill Import/内部恢复 Route；当前 80 个 DataService 方法、13 个页面、64 个 API Route 和 17 个 section 标签通过。

## Verification

| 检查 | 结果 |
| --- | --- |
| `npm run verify:android-parity` | passed，64 routes |
| `:app:testDebugUnitTest` | passed，含终态/回执/幂等 upsert 策略 |
| `:app:lintDebug` | passed |
| `:app:assembleDebug` | passed |
| `:app:compileDebugAndroidTestKotlin` | passed |
| `SkillRunApiContractTest` | Pixel 9 AVD 3/3，含 SSE snapshot/run-event/ping 过滤、Bearer 与编码路由 |
| `SkillRunCardTest` | Pixel 9 AVD 2/2 |

设备 API 合同只访问 AVD loopback MockWebServer；没有读取生产账号、启动真实后台任务、导入生产 Skill 包或产生模型用量。

## Remaining external checks

- 生产 worker 与回执 LLM 的服务端部署状态不属于本轮 Android 本地实现；上线后应以测试账号跑一次深度调研、数据分析和 PPT 等待输入→完成闭环。
- Android 已与浏览器 EventSource 对齐到同一 `/events` SSE 路由；当前设备合同使用本机 MockWebServer，不替代生产边缘代理持续 5 分钟连接与网络切换验收。
