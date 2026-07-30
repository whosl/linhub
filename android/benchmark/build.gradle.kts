plugins {
    alias(libs.plugins.android.test)
}

android {
    // 测试 APK 必须与被测 app 的 com.linhub.android.benchmark applicationId 分离，
    // 否则 Android 17 会把 versionCode=0 的测试 APK 当作被测 app 的降级安装。
    namespace = "com.linhub.android.macrobenchmark"
    compileSdk = 37

    defaultConfig {
        minSdk = 28
        targetSdk = 37
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true

    buildTypes {
        create("benchmark") {
            isDebuggable = false
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }
}

dependencies {
    implementation(libs.androidx.junit)
    implementation(libs.androidx.benchmark.macro)
    implementation(libs.androidx.uiautomator)
}
