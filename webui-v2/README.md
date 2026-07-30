# LinHub WebUI v2

LinHub 的第二代 Web 前端:从零实现的 Vite + React SPA,对接已部署的后端 `https://lin.wenzhuolin.xyz`。与仓库根目录的旧前端(`src/`)无任何代码共享,仅以后端 API 契约为依据重写。

## 启动

```bash
cd webui-v2
npm install
npm run dev        # http://localhost:5174
```

`vite.config.ts` 已配置 `/api → https://lin.wenzhuolin.xyz` 反向代理(changeOrigin),浏览器视角全程同源,无 CORS 问题。

其他命令:

```bash
npm run build      # tsc -b && vite build
node scripts/test-ndjson.mjs      # NDJSON 流解析器单测
node scripts/test-chat-core.mjs   # 消息树/事件应用单测
node scripts/test-chat-utils.mjs  # 工具名/汇总单测
node scripts/test-mask.mjs        # 遮罩画笔单测
node scripts/test-sse.mjs         # SSE 解析器单测
```

## 认证

后端 better-auth 启用了 bearer 插件,本前端采用 **Bearer Token** 方案(不依赖 cookie):

1. `POST /api/auth/sign-in/email`(注册用 `sign-up/email`)→ 从响应头 `set-auth-token` 取 token,存 `localStorage("linhub-v2-token")`
2. 之后每个请求带 `Authorization: Bearer <token>`
3. 任意请求 401 → 清 token → 回登录页(被动过期,无 refresh 逻辑)

## 架构

```
src/
├── api/            # 按域封装的端点层
│   ├── http.ts     #   fetch 封装:Bearer/超时/错误提取/401 广播
│   ├── ndjson.ts   #   NDJSON 增量解析器(/api/chat 流式协议)
│   ├── sse.ts      #   手写 SSE 解析器(skill-runs/events,EventSource 无法带 Bearer)
│   ├── chat.ts conversations.ts models.ts auth.ts upload.ts voice.ts images.ts
│   ├── artifacts.ts skill-runs.ts projects.ts knowledge.ts skills.ts media.ts
│   └── billing.ts settings.ts admin.ts chat-options.ts types.ts
├── stores/         # zustand
│   ├── chat-store.ts    # 会话态:消息树/乐观发送/流式消费/停止/regenerate/分支/resume
│   ├── chat-core.ts     # 纯函数:visibleThread/deepestLeaf/applyEvent(可单测)
│   ├── auth-store.ts / ui-store.ts(persist)/ tts-store.ts / artifact-panel-store.ts
├── components/
│   ├── ui/         # 自写原语:Button/Input/Dialog/DropdownMenu/Badge/Switch/Tabs/Spinner/toast
│   ├── shell/      # AppShell/Sidebar/SearchDialog/会话操作
│   └── chat/       # ChatPage 全部组件 + markdown/(Shiki/KaTeX/Mermaid)
└── pages/          # chat projects knowledge skills files billing settings admin share
```

关键机制:

- **流式协议**:`POST /api/chat` 返回 NDJSON(每行一个 StreamEvent,15s `ping` 心跳);客户端预生成 `c-/msg-/cg-` 前缀 ID 实现乐观消息与服务端落库对账、重试幂等
- **消息树**:`parentId` 成树、`currentLeafId` 决定可见链;`skill-run-receipt` 消息不参与分支,仅按时间插入可见流;`assistant-snapshot` 有防回退(本地进度更大则忽略快照 parts)
- **停止/resume**:停止 = 本地收口 + abort + `DELETE /api/chat`;进入有进行中消息的会话时自动 `GET /api/chat?conversationId=` 订阅,结束后全量重拉兜底
- **Skill Run**:fetch + ReadableStream 手写 SSE 订阅快照,终态且回执完成后断开;回执消息合入会话流
- **幂等**:`/api/orders`、`/api/edit-image` 带 `Idempotency-Key` 头

## 功能覆盖

- 聊天:流式渲染、Markdown/GFM/KaTeX/Shiki/Mermaid、思维链折叠、工具调用卡(搜索来源/生图/知识库引用/代码)、消息树分支切换、编辑重发、重新生成(可换模型)、👍👎、复制、引用回复、TTS 朗读
- Composer:模型选择(按供应商分组/设默认)、回复风格、思考强度、工具面板(联网/生图/代码/知识库范围/MCP 逐台/智能路由)、附件上传(拖拽/预览/重试)、语音输入、图片遮罩局部重绘
- Artifacts:右侧分栏面板(html/svg/markdown/code/mermaid 渲染、React artifact iframe+Babel 即时编译)、版本切换、分享链接、公开分享页 `/share/artifact/:token`
- 工作区:项目(CRUD/文件/知识库关联/项目指令/默认模型)、知识库(文档上传/解析轮询/状态徽章)、技能(我的/广场/编辑/审核状态/一键对话)、文件中心(游标分页/预览/来源会话跳转)
- 计费:余额/套餐/额度概览、订阅与充值下单(幂等键)、兑换码、用量明细、余额流水
- 设置:账户(昵称/导航条开关/数据导出)、记忆 CRUD、回复风格 CRUD、MCP 连接器(测试/启停)
- 管理后台:供应商(含远端模型拉取入库)、模型与计价、套餐、用户(充值/详情/订阅/删除)、技能审核、系统设置(四引擎配置+连通测试、全局 MCP)

## 已知限制

- React artifact 预览依赖 unpkg.com CDN(Babel standalone + React UMD),离线环境不可用
- 旧前端的 PWA(sw/offline)与 Mock 数据模式未在 v2 实现
- 修改密码/删除账户后端未开放,前端为占位提示
