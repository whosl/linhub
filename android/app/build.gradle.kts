import java.io.File
import java.net.URI
import com.android.build.api.variant.BuildConfigField
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.TaskAction

abstract class UpdateBaselineProfileTask : DefaultTask() {
    @get:Internal
    abstract val generatedProfilesDirectory: DirectoryProperty

    @get:Internal
    abstract val mainProfilesDirectory: DirectoryProperty

    @TaskAction
    fun updateProfiles() {
        val generatedDir = generatedProfilesDirectory.get().asFile
        val mainDir = mainProfilesDirectory.get().asFile
        val profileNames = listOf("baseline-prof.txt", "startup-prof.txt")

        profileNames.forEach { name ->
            val source = generatedDir.resolve(name)
            require(source.isFile) { "缺少生成的 Profile：${source.path}" }
            val invalidLine = source.useLines { lines ->
                lines.withIndex().firstOrNull { (_, line) ->
                    line.isBlank() || line.startsWith("<")
                }
            }
            require(invalidLine == null) {
                "Profile ${source.path} 第 ${invalidLine!!.index + 1} 行不是合法规则"
            }
            source.copyTo(mainDir.resolve(name), overwrite = true)
        }
        generatedDir.deleteRecursively()
        generatedDir.parentFile?.takeIf { it.list().isNullOrEmpty() }?.delete()
    }
}

abstract class VerifyReleaseConfigurationTask : DefaultTask() {
    @get:Input
    abstract val signingReady: Property<Boolean>

    @get:Input
    abstract val keystorePath: Property<String>

    @TaskAction
    fun verify() {
        if (!signingReady.get()) {
            throw GradleException(
                "拒绝生成 unsigned 正式包。请按 RELEASE.md 配置四项 LINHUB_RELEASE_* 环境变量。",
            )
        }
        val keystore = File(keystorePath.get())
        if (!keystore.isFile) {
            throw GradleException("Release keystore 不存在：${keystore.path}")
        }
    }
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.androidx.room)
    alias(libs.plugins.androidx.baselineprofile)
}

fun releaseInput(name: String) = providers.gradleProperty(name)
    .orElse(providers.environmentVariable(name))

val releaseStoreFile = releaseInput("LINHUB_RELEASE_STORE_FILE")
val releaseStorePassword = releaseInput("LINHUB_RELEASE_STORE_PASSWORD")
val releaseKeyAlias = releaseInput("LINHUB_RELEASE_KEY_ALIAS")
val releaseKeyPassword = releaseInput("LINHUB_RELEASE_KEY_PASSWORD")
val releaseSigningInputs = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val suppliedReleaseSigningInputs = releaseSigningInputs.count { !it.orNull.isNullOrBlank() }
if (suppliedReleaseSigningInputs !in setOf(0, releaseSigningInputs.size)) {
    throw GradleException(
        "Release 签名配置不完整：必须同时提供 STORE_FILE、STORE_PASSWORD、KEY_ALIAS、KEY_PASSWORD。",
    )
}
val releaseSigningReady = suppliedReleaseSigningInputs == releaseSigningInputs.size
val configuredVersionCode = releaseInput("LINHUB_VERSION_CODE").orElse("3").get().toInt()
val configuredVersionName = releaseInput("LINHUB_VERSION_NAME").orElse("0.2.1").get()
require(configuredVersionCode > 0) { "LINHUB_VERSION_CODE 必须为正整数" }
require(configuredVersionName.isNotBlank()) { "LINHUB_VERSION_NAME 不能为空" }

android {
    namespace = "com.linhub.android"
    compileSdk = 37

    val debugBaseUrl = providers.gradleProperty("LINHUB_DEBUG_BASE_URL")
        .orElse("https://lin.wenzhuolin.xyz/")
        .get()
    val profileBaseUrl = providers.gradleProperty("LINHUB_PROFILE_BASE_URL")
        .orElse("http://10.0.2.2:3001/")
        .get()
    val releaseBaseUrl = releaseInput("LINHUB_BASE_URL")
        .orElse("https://lin.wenzhuolin.xyz/")
        .get()
    val debugBaseUri = URI(debugBaseUrl)
    val profileBaseUri = URI(profileBaseUrl)
    val releaseBaseUri = URI(releaseBaseUrl)
    require(
        releaseBaseUri.scheme == "https" &&
            !releaseBaseUri.host.isNullOrBlank() &&
            releaseBaseUri.userInfo == null &&
            releaseBaseUri.query == null &&
            releaseBaseUri.fragment == null &&
            releaseBaseUrl.endsWith("/"),
    ) {
        "LINHUB_BASE_URL 必须是无凭证、查询或片段且以 / 结尾的 HTTPS 地址"
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile.get())
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    defaultConfig {
        applicationId = "com.linhub.android"
        minSdk = 26
        targetSdk = 37
        versionCode = configuredVersionCode
        versionName = configuredVersionName
        buildConfigField("boolean", "BENCHMARK_ENABLED", "false")
        manifestPlaceholders["linhubAppLinkScheme"] = releaseBaseUri.scheme
        manifestPlaceholders["linhubAppLinkHost"] = releaseBaseUri.host

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["linhubAppLinkScheme"] = debugBaseUri.scheme
            manifestPlaceholders["linhubAppLinkHost"] = debugBaseUri.host
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"$debugBaseUrl\"",
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"$releaseBaseUrl\"",
            )
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        create("benchmark") {
            initWith(getByName("release"))
            applicationIdSuffix = ".benchmark"
            versionNameSuffix = "-benchmark"
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            buildConfigField("boolean", "BENCHMARK_ENABLED", "true")
        }
        create("profile") {
            initWith(getByName("release"))
            applicationIdSuffix = ".profile"
            versionNameSuffix = "-profile"
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            manifestPlaceholders["linhubAppLinkScheme"] = profileBaseUri.scheme
            manifestPlaceholders["linhubAppLinkHost"] = profileBaseUri.host
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"$profileBaseUrl\"",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"

    lint {
        disable += "NewerVersionAvailable"
    }
}

val verifyReleaseConfiguration = tasks.register<VerifyReleaseConfigurationTask>(
    "verifyReleaseConfiguration",
) {
    group = "verification"
    description = "正式 Release 打包前校验签名文件与完整凭据。"
    signingReady.set(releaseSigningReady)
    keystorePath.set(
        if (releaseSigningReady) rootProject.file(releaseStoreFile.get()).absolutePath else "",
    )
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(verifyReleaseConfiguration)
}

androidComponents {
    onVariants(selector().withBuildType("nonMinifiedRelease")) { variant ->
        variant.buildConfigFields?.put(
            "BENCHMARK_ENABLED",
            BuildConfigField(
                type = "boolean",
                value = "true",
                comment = "仅供 Baseline Profile 采集变体启用确定性界面。",
            ),
        )
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

baselineProfile {
    automaticGenerationDuringBuild = false
    dexLayoutOptimization = true
    mergeIntoMain = true
}

tasks.register<UpdateBaselineProfileTask>("updateBaselineProfile") {
    group = "Baseline Profile"
    description = "采集、校验并更新所有 App 变体共享的 Baseline/Startup Profile。"
    dependsOn("generateBaselineProfile")
    generatedProfilesDirectory.set(layout.projectDirectory.dir("src/main/generated/baselineProfiles"))
    mainProfilesDirectory.set(layout.projectDirectory.dir("src/main"))
}

// 多变体同次验证时，KSP 会清理并重建 benchmark 的 Room 源码目录；Debug Lint 的
// 聚合源码快照可能同时读取该目录。只约束同一任务图内的顺序，不给单独 lint 增加构建开销。
tasks.matching { it.name.startsWith("lintAnalyzeDebug") }.configureEach {
    mustRunAfter("kspBenchmarkKotlin")
}

dependencies {
    baselineProfile(project(":baselineprofile"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.coil.compose)
    implementation(libs.commonmark)
    implementation(libs.commonmark.gfm.tables)
    implementation(libs.commonmark.gfm.strikethrough)
    implementation(libs.commonmark.autolink)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
