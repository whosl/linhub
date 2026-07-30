# v_kimi — LinHub 视觉增强版前端

基于主仓库 `src/`(v1 前端)复制的**独立 Next.js 16 应用**,在其上做了双主题重设计(亮色精修 + 深色科技风,玻璃拟态)与交互升级。业务逻辑、数据流、API 契约与 v1 完全一致,仅视觉层重写。

## 与 v1 的关系

- 复制自 `src/` 的 UI 层:`app/`(不含 `api/`、`generated/`、`uploads/`)、`components/`、`stores/`、`lib/`(不含 `lib/server/`)。
- 唯一的逻辑改动:`app/share/artifact/[token]/page.tsx` 由直连数据库改为调用后端 `GET /api/artifacts/shared/:token`。
- 设计系统集中在 `src/app/globals.css`:双主题 token + 玻璃拟态(`.glass`/`.glass-strong`)、品牌渐变(`.bg-brand`/`.text-gradient`/`.btn-brand`)、发光描边(`.glow-focus`)、骨架屏(`.skeleton`)、环境光背景(`.ambient-bg`)。

## 运行

```bash
npm install

# 方式一:mock 离线模式(无需后端,内置演示数据)
NEXT_PUBLIC_DATA_SOURCE=mock npm run dev

# 方式二:代理到真实后端(默认 http://localhost:3000,即主仓库 dev server)
BACKEND_URL=http://localhost:3000 npm run dev
```

默认端口 **3100**。`src/proxy.ts`(Next 16 proxy 约定)把 `/api/*`、`/uploads/*`、`/generated/*` 转发到 `BACKEND_URL`,并把请求的 `Origin`/`Referer` 改写为后端地址 —— better-auth 校验 Origin,不改写会被 `403 Invalid origin` 拒绝。cookie 会话经同源代理透传,无需后端改 CORS。

## 验证

```bash
npx tsc --noEmit   # 类型检查
npm run lint       # eslint
npm run build      # 生产构建
```

## 同步策略

v_kimi 是 v1 的一次性视觉分叉,不自动同步。v1 业务逻辑若有更新,需要人工把 `src/` 对应文件的逻辑变更移植过来(视觉类名以 v_kimi 为准)。
