# Android 正式 Release 发布链路审计

日期：2026-07-14（Asia/Shanghai）  
范围：正式包生产地址、签名门槛、构建变体隔离、APK 签名与 App Links Manifest

## 结论

正式 `release` 变体现已默认使用 `https://xiaolin.wenzhuolin.xyz/`，并拒绝在缺少完整签名配置时生成 unsigned APK。Debug、Benchmark 与 Profile 继续使用独立 applicationId 后缀和 Android Debug 证书。正式证书仍由发布负责人提供；本轮只用 1 天有效的临时测试证书验证打包链路，未生成、提交或保留正式私钥。

## 实现

- `app/build.gradle.kts` 从 Gradle 属性或环境变量读取四项 `LINHUB_RELEASE_*` 签名配置及版本号；只在四项完整时创建 `release` signing config。
- `verifyReleaseConfiguration` 以 configuration-cache 兼容的独立 Task 挂到惰性创建的 `preReleaseBuild`；无签名和 keystore 不存在均在打包前明确失败。
- `LINHUB_BASE_URL` 默认生产域名，并要求 HTTPS、有效 host、无凭证/查询/片段且以 `/` 结尾。
- `.gitignore` 忽略常见 keystore 格式和本地签名配置；`RELEASE.md` 记录构建、验签及正式 Digital Asset Links 更新流程。

## 验证

1. `:app:help` 成功，证明发布校验不会破坏普通 Gradle 配置。
2. 无签名配置的 `:app:assembleRelease` 在 `verifyReleaseConfiguration` 明确失败，Configuration Cache 正常写入，未产生第二个缓存兼容性错误。
3. 临时 RSA 测试证书下 `:app:assembleRelease` 成功，输出只有 `app-release.apk`，没有 `app-release-unsigned.apk`。
4. `apksigner verify --verbose --print-certs` 返回 `Verifies`，APK 使用 v2/v3 签名且只有一个临时测试 signer。
5. `aapt dump badging/xmltree` 确认正式包为 `com.linhub.android`、`versionCode=42`、`versionName=0.1.0-test`，HTTPS App Link 为 `xiaolin.wenzhuolin.xyz/share/artifact/` 且 `autoVerify=true`。
6. Debug、Benchmark、Profile 分别为 `com.linhub.android.debug`、`.benchmark`、`.profile`，三者均由 Android Debug 证书签名。
7. 六任务回归 `testDebugUnitTest`、`lintDebug`、Debug/AndroidTest APK、R8 Benchmark App/测试 APK 全部通过；最新 Debug APK 安装到 `emulator-5554` 后冷启动 872ms，前台 Activity 正确且 Crash Buffer 为空。

临时测试 keystore 和临时正式 APK 在验证后删除，不可用于分发。

## 未完成的外部门槛

- 发布负责人确定并安全保管正式 Release keystore、alias 与密码。
- 用正式证书 SHA-256 更新生产 `/.well-known/assetlinks.json`。
- 在 API 35+ 真机安装正式签名包，确认系统状态为 `verified`，且不指定组件的 HTTPS Intent 自动进入 `MainActivity`。
