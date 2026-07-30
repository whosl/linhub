# LinHub Android 正式发布

正式包固定使用：

- applicationId：`com.linhub.android`
- 默认后端与 App Links 域名：`https://xiaolin.wenzhuolin.xyz/`
- R8、资源压缩、Baseline Profile：开启

## 1. 准备签名

Release 构建拒绝生成 unsigned APK。keystore 由发布负责人保管，不提交到仓库；仓库已忽略 `*.jks`、`*.keystore`、`*.p12` 和 `keystore.properties`。

在当前 shell 临时提供四项配置：

```bash
export LINHUB_RELEASE_STORE_FILE=/absolute/path/to/linhub-release.jks
export LINHUB_RELEASE_STORE_PASSWORD='...'
export LINHUB_RELEASE_KEY_ALIAS='...'
export LINHUB_RELEASE_KEY_PASSWORD='...'
```

也可使用同名 Gradle `-P` 参数，但密码更容易进入 shell history，因此优先使用环境变量。

## 2. 版本与构建

```bash
export LINHUB_VERSION_CODE=1
export LINHUB_VERSION_NAME=0.1.0
export LINHUB_BASE_URL=https://xiaolin.wenzhuolin.xyz/

JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
./gradlew :app:assembleRelease
```

输出：`app/build/outputs/apk/release/app-release.apk`。缺少或只提供部分签名配置、keystore 不存在、生产 URL 不是规范 HTTPS 地址时，构建会在 `preReleaseBuild` 阶段失败。

Debug、Benchmark 和 Profile 使用独立 applicationId 后缀与 Debug 签名，不会继承正式私钥。

## 3. 验证证书与 App Links

```bash
"$ANDROID_HOME/build-tools/37.0.0/apksigner" verify \
  --verbose --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

取得正式证书 SHA-256 后，把 `public/.well-known/assetlinks.json` 增加：

```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.linhub.android",
    "sha256_cert_fingerprints": ["正式证书 SHA-256"]
  }
}
```

部署后在真机清除旧域名验证状态并重新安装正式 APK，确认：

```bash
adb shell pm verify-app-links --re-verify com.linhub.android
adb shell pm get-app-links com.linhub.android
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'https://xiaolin.wenzhuolin.xyz/share/artifact/valid-token'
```

只有系统状态为 `verified` 且不指定组件的 HTTPS Intent 直接进入 `MainActivity`，才能把正式 App Links 标为完成。
