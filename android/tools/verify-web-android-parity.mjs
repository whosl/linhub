#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webServicePath = "src/lib/data/service.ts";
const androidApiPath =
  "android/app/src/main/java/com/linhub/android/core/network/LinHubApi.kt";
const destinationPath =
  "android/app/src/main/java/com/linhub/android/ui/LinHubViewModel.kt";
const androidEntryPath =
  "android/app/src/main/java/com/linhub/android/MainActivity.kt";
const androidBuildPath = "android/app/build.gradle.kts";
const webShellPath = "src/app/(app)/layout.tsx";
const webOrbPath = "src/components/ui/linhub-orb.tsx";

const webToAndroid = {
  getCurrentUser: "currentUser",
  updateProfile: "updateProfile",
  listModels: "models",
  listModelsWithDefault: "models",
  listStyles: "styles",
  saveStyle: "saveStyle",
  deleteStyle: "deleteStyle",
  listConversations: "conversations",
  getConversation: "conversation",
  listMessages: "conversation",
  updateConversation: "updateConversation",
  deleteConversation: "deleteConversation",
  searchConversations: "conversations",
  sendMessage: "sendMessage",
  streamConversation: "resumeConversation",
  stopGeneration: "stopGeneration",
  regenerate: "regenerate",
  setFeedback: "setFeedback",
  replaceMessageImage: "replaceMessageImage",
  editImage: "editImage",
  listArtifacts: "artifacts",
  getArtifact: "artifact",
  shareArtifact: "shareArtifact",
  listProjects: "projects",
  getProject: "projects",
  saveProject: "saveProject",
  updateProject: "saveProject",
  deleteProject: "deleteProject",
  listProjectConversations: "projectConversations",
  uploadProjectFile: "uploadProjectFile",
  deleteProjectFile: "deleteProjectFile",
  listMemories: "memories",
  saveMemory: "saveMemory",
  deleteMemory: "deleteMemory",
  listKnowledgeBases: "knowledgeBases",
  saveKnowledgeBase: "saveKnowledgeBase",
  deleteKnowledgeBase: "deleteKnowledgeBase",
  listDocuments: "knowledgeDocuments",
  uploadDocument: "uploadKnowledgeDocument",
  deleteDocument: "deleteKnowledgeDocument",
  listMySkills: "skills",
  listMarketSkills: "skills",
  getSkill: "skill",
  saveSkill: "saveSkill",
  deleteSkill: "deleteSkill",
  listMediaAssets: "mediaAssets",
  deleteMediaAsset: "deleteMediaAsset",
  listMcpServers: "mcpServers",
  saveMcpServer: "saveMcpServer",
  deleteMcpServer: "deleteMcpServer",
  testMcpServer: "testMcpServer",
  transcribeAudio: "transcribeAudio",
  synthesizeSpeech: "synthesizeSpeech",
  listUsageRecords: "usageRecords",
  listLedger: "ledger",
  listPlans: "plans",
  createOrder: "createOrder",
  redeemCode: "redeemCode",
  listProviders: "adminProviders",
  saveProvider: "saveAdminProvider",
  deleteProvider: "deleteAdminProvider",
  listAllModels: "adminModels",
  saveModel: "saveAdminModel",
  deleteModel: "deleteAdminModel",
  listRemoteModels: "adminRemoteModels",
  addRemoteModels: "addAdminRemoteModels",
  getSettings: "adminSettings",
  saveSettings: "saveAdminSettings",
  testEngineConnection: "testAdminEngine",
  listUsers: "adminUsers",
  getUserDetail: "adminUserDetail",
  grantBalance: "grantAdminBalance",
  updateUserSubscription: "updateAdminSubscription",
  deleteUser: "deleteAdminUser",
  listAllPlans: "adminPlans",
  savePlan: "saveAdminPlan",
  deletePlan: "deleteAdminPlan",
  listPendingSkills: "adminPendingSkills",
  reviewSkill: "reviewAdminSkill",
  listAllUsage: "adminUsage",
};

const pageCoverage = {
  "src/app/(app)/admin/page.tsx": { method: "adminProviders", destination: "Admin" },
  "src/app/(app)/billing/page.tsx": { method: "plans", destination: "Billing" },
  "src/app/(app)/chat/[id]/page.tsx": { method: "conversation", destination: "Chat" },
  "src/app/(app)/files/page.tsx": { method: "mediaAssets", destination: "Files" },
  "src/app/(app)/knowledge/page.tsx": { method: "knowledgeBases", destination: "Knowledge" },
  "src/app/(app)/page.tsx": { method: "sendMessage", destination: "Chat" },
  "src/app/(app)/projects/[id]/page.tsx": { method: "projects", destination: "Projects" },
  "src/app/(app)/projects/page.tsx": { method: "projects", destination: "Projects" },
  "src/app/(app)/settings/page.tsx": { method: "updateProfile", destination: "Settings" },
  "src/app/(app)/skills/page.tsx": { method: "skills", destination: "Skills" },
  "src/app/(auth)/login/page.tsx": { method: "signIn" },
  "src/app/(auth)/register/page.tsx": { method: "signUp" },
  "src/app/share/artifact/[token]/page.tsx": { method: "sharedArtifact" },
};

const apiRouteCoverage = {
  "src/app/api/account/export/route.ts": ["exportAccountData"],
  "src/app/api/admin/models/[id]/route.ts": ["saveAdminModel", "deleteAdminModel"],
  "src/app/api/admin/models/[id]/test/route.ts": ["testAdminModel"],
  "src/app/api/admin/models/route.ts": ["adminModels", "saveAdminModel"],
  "src/app/api/admin/plans/route.ts": ["adminPlans", "saveAdminPlan", "deleteAdminPlan"],
  "src/app/api/admin/providers/[id]/models/route.ts": [
    "adminRemoteModels",
    "addAdminRemoteModels",
  ],
  "src/app/api/admin/providers/[id]/route.ts": ["deleteAdminProvider"],
  "src/app/api/admin/providers/route.ts": ["adminProviders", "saveAdminProvider"],
  "src/app/api/admin/redeem-codes/route.ts": [
    "adminRedeemCodes",
    "generateAdminRedeemCodes",
  ],
  "src/app/api/admin/settings/engine-test/route.ts": ["testAdminEngine"],
  "src/app/api/admin/settings/route.ts": ["adminSettings", "saveAdminSettings"],
  "src/app/api/admin/skills/route.ts": ["adminPendingSkills", "reviewAdminSkill"],
  "src/app/api/admin/skills/import/route.ts": ["importAdminSkillPackage"],
  "src/app/api/admin/users/[id]/route.ts": [
    "adminUserDetail",
    "updateAdminSubscription",
    "deleteAdminUser",
  ],
  "src/app/api/admin/users/route.ts": ["adminUsers", "grantAdminBalance"],
  "src/app/api/artifacts/[id]/route.ts": ["artifact"],
  "src/app/api/artifacts/[id]/share/route.ts": ["shareArtifact"],
  "src/app/api/artifacts/route.ts": ["artifacts"],
  "src/app/api/artifacts/shared/[token]/route.ts": ["sharedArtifact"],
  "src/app/api/attachments/[id]/route.ts": ["downloadBytes"],
  "src/app/api/auth/[...all]/route.ts": ["signIn", "signUp", "signOut"],
  "src/app/api/chat/route.ts": [
    "sendMessage",
    "resumeConversation",
    "regenerate",
    "stopGeneration",
  ],
  "src/app/api/conversations/[id]/route.ts": [
    "conversation",
    "updateConversation",
    "deleteConversation",
  ],
  "src/app/api/conversations/route.ts": ["conversations"],
  "src/app/api/edit-image/route.ts": ["editImage", "imageEditResult"],
  "src/app/api/knowledge/[id]/documents/[docId]/route.ts": [
    "deleteKnowledgeDocument",
  ],
  "src/app/api/knowledge/[id]/documents/route.ts": [
    "knowledgeDocuments",
    "uploadKnowledgeDocument",
  ],
  "src/app/api/knowledge/[id]/route.ts": ["saveKnowledgeBase", "deleteKnowledgeBase"],
  "src/app/api/knowledge/route.ts": ["knowledgeBases", "saveKnowledgeBase"],
  "src/app/api/internal/skill-runs/[id]/execute/route.ts": ["skillRun"],
  "src/app/api/internal/skill-runs/[id]/receipt/route.ts": ["skillRun"],
  "src/app/api/ledger/route.ts": ["ledger"],
  "src/app/api/mcp/[id]/route.ts": ["saveMcpServer", "deleteMcpServer"],
  "src/app/api/mcp/[id]/test/route.ts": ["testMcpServer"],
  "src/app/api/mcp/route.ts": ["mcpServers", "saveMcpServer"],
  "src/app/api/me/route.ts": ["currentUser", "updateProfile"],
  "src/app/api/media/[id]/metadata/route.ts": ["mediaAssetMetadata"],
  "src/app/api/media/[id]/route.ts": ["deleteMediaAsset", "downloadBytes"],
  "src/app/api/media/route.ts": ["mediaAssets"],
  "src/app/api/memories/[id]/route.ts": ["deleteMemory"],
  "src/app/api/memories/route.ts": ["memories", "saveMemory"],
  "src/app/api/messages/[id]/feedback/route.ts": ["setFeedback"],
  "src/app/api/messages/[id]/image/route.ts": ["replaceMessageImage"],
  "src/app/api/models/route.ts": ["models"],
  "src/app/api/orders/route.ts": ["createOrder"],
  "src/app/api/plans/route.ts": ["plans"],
  "src/app/api/projects/[id]/conversations/route.ts": ["projectConversations"],
  "src/app/api/projects/[id]/route.ts": [
    "saveProject",
    "deleteProject",
    "deleteProjectFile",
  ],
  "src/app/api/projects/route.ts": ["projects", "saveProject"],
  "src/app/api/redeem/route.ts": ["redeemCode"],
  "src/app/api/skills/[id]/route.ts": ["skill", "saveSkill", "deleteSkill"],
  "src/app/api/skills/route.ts": ["skills", "saveSkill"],
  "src/app/api/skill-runs/[id]/events/route.ts": ["skillRunEvents"],
  "src/app/api/skill-runs/[id]/input/route.ts": ["submitPptStudioBrief"],
  "src/app/api/skill-runs/[id]/route.ts": [
    "skillRun",
    "cancelSkillRun",
    "retrySkillRun",
  ],
  "src/app/api/styles/[id]/route.ts": ["deleteStyle"],
  "src/app/api/styles/route.ts": ["styles", "saveStyle"],
  "src/app/api/upload/chunked/[id]/[index]/route.ts": [
    "uploadChatAttachment",
    "uploadProjectFile",
    "uploadKnowledgeDocument",
  ],
  "src/app/api/upload/chunked/[id]/route.ts": [
    "uploadChatAttachment",
    "uploadProjectFile",
    "uploadKnowledgeDocument",
  ],
  "src/app/api/upload/chunked/route.ts": [
    "uploadChatAttachment",
    "uploadProjectFile",
    "uploadKnowledgeDocument",
  ],
  "src/app/api/upload/route.ts": [
    "uploadChatAttachment",
    "uploadProjectFile",
    "uploadKnowledgeDocument",
  ],
  "src/app/api/usage/route.ts": ["usageRecords", "adminUsage"],
  "src/app/api/voice/transcribe/route.ts": ["transcribeAudio"],
  "src/app/api/voice/tts/route.ts": ["synthesizeSpeech"],
};

const sectionParity = [
  {
    web: "src/app/(app)/settings/page.tsx",
    android: "android/app/src/main/java/com/linhub/android/ui/SettingsLoadPolicy.kt",
    labels: ["账户", "记忆", "回复风格", "MCP 连接器"],
  },
  {
    web: "src/app/(app)/billing/page.tsx",
    android: "android/app/src/main/java/com/linhub/android/ui/BillingLoadPolicy.kt",
    labels: ["订阅套餐", "充值", "用量明细", "余额流水"],
  },
  {
    web: "src/app/(app)/admin/page.tsx",
    android: "android/app/src/main/java/com/linhub/android/ui/AdminLoadPolicy.kt",
    labels: [
      "供应商",
      "模型与计价",
      "套餐",
      "用户",
      "技能审核",
      "系统设置",
      "全局 MCP",
    ],
  },
];

const androidOnlySectionLabels = [
  {
    android: "android/app/src/main/java/com/linhub/android/ui/AdminLoadPolicy.kt",
    labels: ["兑换码", "用量"],
  },
];

const androidOnlyCapabilities = [
  "signIn",
  "signUp",
  "signOut",
  "exportAccountData",
  "uploadChatAttachment",
  "imageEditResult",
  "sharedArtifact",
  "mediaAssetMetadata",
  "downloadBytes",
  "testAdminModel",
  "adminRedeemCodes",
  "generateAdminRedeemCodes",
];

function fail(message) {
  throw new Error(`Web/Android parity 校验失败：${message}`);
}

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function listNamedFiles(directory, fileName) {
  const result = [];
  async function visit(relativeDirectory) {
    const entries = await readdir(path.join(repoRoot, relativeDirectory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else if (entry.name === fileName) result.push(relative);
    }
  }
  await visit(directory);
  return result.sort();
}

// WebView 壳直接运行同一份 Next.js 应用，不再需要把每个 DataService 方法和页面
// 人工重写到 Kotlin。此模式校验真正的壳层边界：固定生产源、同源导航、系统能力、
// 网页全屏侧滑策略，以及新对话品牌动画。下方旧校验保留给仍使用原生 UI 的分支。
const [androidEntry, androidBuild, webShell, webOrb] = await Promise.all([
  read(androidEntryPath),
  read(androidBuildPath),
  read(webShellPath),
  read(webOrbPath),
]);
if (androidEntry.includes("LinHubWebShell")) {
  const shellRequirements = [
    [androidEntry, "WebView(context)", "WebView 主容器"],
    [androidEntry, "javaScriptEnabled = true", "JavaScript"],
    [androidEntry, "domStorageEnabled = true", "DOM Storage"],
    [androidEntry, "onShowFileChooser", "文件选择"],
    [androidEntry, "setDownloadListener", "系统下载"],
    [androidEntry, "BlobDownloadBridge", "Blob 文件下载"],
    [androidEntry, "RESOURCE_AUDIO_CAPTURE", "录音权限"],
    [androidEntry, "CookieManager", "Cookie 会话"],
    [androidEntry, "isFirstParty", "同源导航策略"],
    [androidBuild, 'orElse("https://lin.wenzhuolin.xyz/")', "生产 Base URL"],
    [webShell, "SIDEBAR_SWIPE_MIN_DISTANCE_PX", "网页全屏侧滑距离锁"],
    [webShell, "SIDEBAR_SWIPE_BLOCKED_SELECTOR", "网页侧滑冲突排除"],
    [webOrb, "export function LinHubOrb", "新对话眼球"],
  ];
  for (const [source, marker, capability] of shellRequirements) {
    if (!source.includes(marker)) fail(`WebView 壳缺少${capability}`);
  }
  const productionBaseOccurrences = androidBuild.match(
    /orElse\("https:\/\/lin\.wenzhuolin\.xyz\/"\)/g,
  )?.length ?? 0;
  if (productionBaseOccurrences < 2) {
    fail("Debug 与 Release 没有同时默认绑定 https://lin.wenzhuolin.xyz/");
  }
  console.log(
    JSON.stringify(
      {
        architecture: "webview-shell",
        productionBaseUrl: "https://lin.wenzhuolin.xyz/",
        shellCapabilities: shellRequirements.length,
        status: "passed",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const [webService, androidApi, destinations] = await Promise.all([
  read(webServicePath),
  read(androidApiPath),
  read(destinationPath),
]);

const webMethods = new Set(
  [...webService.matchAll(/^  ([A-Za-z][A-Za-z0-9_]*)\(/gm)].map((match) => match[1]),
);
const androidMethods = new Set(
  [...androidApi.matchAll(/^    (?:suspend )?fun ([A-Za-z][A-Za-z0-9_]*)\(/gm)].map(
    (match) => match[1],
  ),
);
const mappedWebMethods = new Set(Object.keys(webToAndroid));

const missingMappings = [...webMethods].filter((method) => !mappedWebMethods.has(method));
const staleMappings = [...mappedWebMethods].filter((method) => !webMethods.has(method));
if (missingMappings.length) fail(`DataService 新方法未映射：${missingMappings.join(", ")}`);
if (staleMappings.length) fail(`DataService 映射已过期：${staleMappings.join(", ")}`);

for (const [webMethod, androidMethod] of Object.entries(webToAndroid)) {
  if (!androidMethods.has(androidMethod)) {
    fail(`${webMethod} 对应的 LinHubApi.${androidMethod} 不存在`);
  }
  if (!new RegExp(`\\bcontainer\\.api\\.${androidMethod}\\(`).test(destinations)) {
    fail(
      `${webMethod} 对应的 LinHubApi.${androidMethod} 只有声明，没有生产 ViewModel 调用`,
    );
  }
}
for (const method of androidOnlyCapabilities) {
  if (!androidMethods.has(method)) fail(`Android 扩展能力 LinHubApi.${method} 不存在`);
  if (!new RegExp(`\\bcontainer\\.api\\.${method}\\(`).test(destinations)) {
    fail(`Android 扩展能力 LinHubApi.${method} 只有声明，没有生产 ViewModel 调用`);
  }
}

const discoveredPages = await listNamedFiles("src/app", "page.tsx");
const declaredPages = Object.keys(pageCoverage).sort();
const missingPages = discoveredPages.filter((page) => !(page in pageCoverage));
const stalePages = declaredPages.filter((page) => !discoveredPages.includes(page));
if (missingPages.length) fail(`Web 新页面未登记：${missingPages.join(", ")}`);
if (stalePages.length) fail(`页面登记已过期：${stalePages.join(", ")}`);
for (const [page, coverage] of Object.entries(pageCoverage)) {
  if (!androidMethods.has(coverage.method)) {
    fail(`${page} 对应的 LinHubApi.${coverage.method} 不存在`);
  }
  if (coverage.destination) {
    const destinationPattern = new RegExp(`^    ${coverage.destination},?$`, "m");
    if (!destinationPattern.test(destinations)) {
      fail(`${page} 对应的 WorkspaceDestination.${coverage.destination} 不存在`);
    }
  }
}

const discoveredApiRoutes = await listNamedFiles("src/app/api", "route.ts");
const declaredApiRoutes = Object.keys(apiRouteCoverage).sort();
const missingApiRoutes = discoveredApiRoutes.filter((route) => !(route in apiRouteCoverage));
const staleApiRoutes = declaredApiRoutes.filter((route) => !discoveredApiRoutes.includes(route));
if (missingApiRoutes.length) fail(`Web 新 API Route 未登记：${missingApiRoutes.join(", ")}`);
if (staleApiRoutes.length) fail(`API Route 登记已过期：${staleApiRoutes.join(", ")}`);
for (const [route, methods] of Object.entries(apiRouteCoverage)) {
  if (methods.length === 0) fail(`${route} 没有原生调用覆盖说明`);
  for (const method of methods) {
    if (!androidMethods.has(method)) fail(`${route} 对应的 LinHubApi.${method} 不存在`);
  }
}

let sectionCount = 0;
for (const section of sectionParity) {
  const [webSource, androidSource] = await Promise.all([
    read(section.web),
    read(section.android),
  ]);
  for (const label of section.labels) {
    if (!webSource.includes(label)) fail(`${section.web} 不再包含标签“${label}”`);
    if (!androidSource.includes(`"${label}"`)) {
      fail(`${section.android} 缺少标签“${label}”`);
    }
    sectionCount += 1;
  }
}
for (const section of androidOnlySectionLabels) {
  const androidSource = await read(section.android);
  for (const label of section.labels) {
    if (!androidSource.includes(`"${label}"`)) {
      fail(`${section.android} 缺少 Android 扩展标签“${label}”`);
    }
    sectionCount += 1;
  }
}

console.log(
  JSON.stringify(
    {
      dataServiceMethods: webMethods.size,
      mappedAndroidMethods: new Set(Object.values(webToAndroid)).size,
      webPages: discoveredPages.length,
      apiRoutes: discoveredApiRoutes.length,
      sectionLabels: sectionCount,
      androidOnlyCapabilities: androidOnlyCapabilities.length,
      status: "passed",
    },
    null,
    2,
  ),
);
