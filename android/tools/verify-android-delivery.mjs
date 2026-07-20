#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const maxTrackedFileBytes = 5 * 1024 * 1024;
const textExtensions = new Set([
  ".java",
  ".json",
  ".kt",
  ".kts",
  ".md",
  ".mjs",
  ".properties",
  ".toml",
  ".xml",
  ".zsh",
]);
const forbiddenPaths = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)(?:\.gradle|\.gradle-user-home|\.sdk|build)(?:\/|$)/,
  /(^|\/)local\.properties$/,
  /(^|\/)keystore\.properties$/,
  /\.(?:aab|apk|der|jks|key|keystore|p12|pem)$/i,
  /\.perfetto-trace$/,
];
const secretPatterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ["openai-style-key", /\bsk-[A-Za-z0-9_-]{24,}\b/g],
  ["url-userinfo", /https?:\/\/[^/@\s]+:[^/@\s]+@/g],
  ["absolute-mac-path", /\/Users\/[^/\s]+\//g],
  ["absolute-server-path", /\/home\/ubuntu\//g],
];
const allowedPatternLocations = new Set([
  "url-userinfo:android/app/src/test/java/com/linhub/android/ui/PaymentUrlPolicyTest.kt",
]);

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function fail(lines) {
  const details = Array.isArray(lines) ? lines.join("\n") : lines;
  throw new Error(`Android 交付校验失败：\n${details}`);
}

function isIgnored(relativePath) {
  try {
    git(["check-ignore", "-q", relativePath]);
    return true;
  } catch {
    return false;
  }
}

const includedFiles = git([
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
  "android",
])
  .split("\0")
  .filter(Boolean)
  .sort();

if (includedFiles.length === 0) fail("没有找到 Android 源码候选文件");

const violations = [];
let includedBytes = 0;
let largestFile = { path: "", bytes: 0 };
for (const relativePath of includedFiles) {
  if (forbiddenPaths.some((pattern) => pattern.test(relativePath))) {
    violations.push(`禁止纳入 Git：${relativePath}`);
    continue;
  }
  const fileStat = await lstat(path.join(repoRoot, relativePath));
  if (fileStat.isSymbolicLink()) {
    violations.push(`不允许符号链接：${relativePath}`);
    continue;
  }
  includedBytes += fileStat.size;
  if (fileStat.size > largestFile.bytes) largestFile = { path: relativePath, bytes: fileStat.size };
  if (fileStat.size > maxTrackedFileBytes) {
    violations.push(`文件超过 5MiB：${relativePath} (${fileStat.size} bytes)`);
  }
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
  const content = await readFile(path.join(repoRoot, relativePath), "utf8");
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(content)) continue;
    if (allowedPatternLocations.has(`${label}:${relativePath}`)) continue;
    violations.push(`疑似 ${label}：${relativePath}`);
  }
}

const requiredFiles = [
  "android/gradlew",
  "android/gradle/wrapper/gradle-wrapper.jar",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "android/settings.gradle.kts",
  "android/app/build.gradle.kts",
  "android/README.md",
  "android/RELEASE.md",
];
for (const requiredFile of requiredFiles) {
  if (!includedFiles.includes(requiredFile)) violations.push(`缺少交付文件：${requiredFile}`);
}

const gradlewStat = await lstat(path.join(repoRoot, "android/gradlew"));
if ((gradlewStat.mode & 0o111) === 0) violations.push("android/gradlew 缺少可执行权限");
const wrapperProperties = await readFile(
  path.join(repoRoot, "android/gradle/wrapper/gradle-wrapper.properties"),
  "utf8",
);
if (!wrapperProperties.includes("distributionUrl=https\\://")) {
  violations.push("Gradle Wrapper distributionUrl 不是 HTTPS");
}
if (!/^distributionSha256Sum=[a-f0-9]{64}$/m.test(wrapperProperties)) {
  violations.push("Gradle Wrapper 缺少合法 distributionSha256Sum");
}

for (const ignoredRequired of [
  "android/local.properties",
  "android/app/build/app-debug.apk",
  "android/keystore.properties",
]) {
  if (!isIgnored(ignoredRequired)) violations.push(`敏感/生成文件没有被忽略：${ignoredRequired}`);
}

const designQaRoot = path.join(repoRoot, "android/design-qa");
const designQaEntries = await readdir(designQaRoot, { recursive: true, withFileTypes: true });
let ignoredTraceCount = 0;
let ignoredTraceBytes = 0;
for (const entry of designQaEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".perfetto-trace")) continue;
  const absolutePath = path.join(entry.parentPath, entry.name);
  const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
  if (!isIgnored(relativePath)) violations.push(`原始 trace 未忽略：${relativePath}`);
  ignoredTraceCount += 1;
  ignoredTraceBytes += (await stat(absolutePath)).size;
}

if (violations.length) fail(violations);

console.log(
  JSON.stringify(
    {
      includedFiles: includedFiles.length,
      includedBytes,
      largestIncludedFile: largestFile,
      ignoredPerfettoTraces: ignoredTraceCount,
      ignoredPerfettoTraceBytes: ignoredTraceBytes,
      secretPatterns: secretPatterns.length,
      status: "passed",
    },
    null,
    2,
  ),
);
