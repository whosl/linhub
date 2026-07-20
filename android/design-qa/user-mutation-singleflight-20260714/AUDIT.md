# 用户侧写操作 single-flight 审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
范围：认证、技能、项目、知识库、设置与 Artifact 异步入口

## Finding

计费和管理后台此前已在创建协程前取得原子 single-flight 所有权，但其余用户侧保存仍先 `viewModelScope.launch`、进入协程后才发布 loading。Compose 按钮禁用依赖下一次重组，同一帧双击可以创建两个协程并发出两次注册、技能/项目/知识库创建、记忆/风格/MCP 创建或资料保存请求。Artifact 打开/分享也在协程内才设置 loading，快速重复点击会重复请求。

## 修复

- 新增认证、技能、项目、知识库、设置四个工作区写操作的独立 gate；连同既有计费和后台共七个互不阻塞域。
- 输入校验先完成，取得所有权后在创建协程前同步发布 `authSubmitting` 或目标页 loading。
- 技能、项目、知识库保存和设置中的昵称、头像、账户导出、默认模型、记忆、回复风格、MCP 保存全部在 `finally` 释放所有权与 loading。
- 认证成功、失败或取消同样在 `finally` 释放；无效输入不会占用 gate。
- Artifact 打开和分享改为同步发布 loading，并在 `finally` 清理，消除重组前重复请求窗口。

删除、开关和反馈等入口原本已在发请求前同步做乐观状态更新或使用按 ID job/set 去重，本轮不重复套用全局 gate。

## 验证

| 验证项 | 结果 |
| --- | --- |
| `SingleFlightMutationGateTest` | 重入拒绝、32 路并发只有一个 owner、释放后重试、七域互相独立全部通过 |
| Android 完整六任务 | `testDebugUnitTest`、`lintDebug`、Debug/AndroidTest APK、R8 Benchmark App/测试 APK 全部通过 |
| R8 页面 smoke | 22 个 Web 对应 surface 1/1 通过，28.426 秒；测试时段无目标网络请求、无 crash |
| 最新 Debug APK | 覆盖安装后冷启动 831ms；用户、模型、会话、项目、风格请求均为 200，前台 Activity 正确，Crash Buffer 为空 |

本轮没有提交注册、创建/编辑技能、项目、知识库、记忆、风格或 MCP，也没有修改生产用户资料；运行验证只读取生产数据，写操作防重由并发单测和 R8 可达性回归覆盖。

## 仍需外部验证

真实网络慢响应下的人工快速双击可以作为真机兼容性复验，但不再是逻辑正确性的唯一防线；原子 gate 在 UI 重组与协程调度之外提供所有权。
