# AI Dev Studio · 工程化演示

面向「自然语言 → 多栈代码片段 → 预览」的极简样板，集成 Vite 中间层、`tools` 解析、离线演示与本地历史。

## 技术栈

| 类别 | 说明 |
|------|------|
| 运行时 | React 19、TypeScript、Vite 8 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`） |
| 组件 | shadcn/ui 风格（Radix Slot、`class-variance-authority`、`tailwind-merge`、`cn`） |
| 图标 | lucide-react |
| 代码高亮 | Prism.js（`markup` / `jsx` / `sql`；Vue 片段按 markup 高亮） |
| 服务端能力 | `npm run dev` 与 **`npm run preview`** 均在本地 Node 中挂载 `POST /api/chat`、`GET /api/mcp/tools`（见 `vite.config.ts`）；纯静态托管不包含该接口 |

## 功能概览

1. **生成**：输入需求；选择 **模型提供商**（DeepSeek / OpenAI / 通义千问）；选择 **输出栈**（React / Vue / SQL）；可选 **Function Calling**（OpenAI 兼容 `tools`，函数名为 `emit_code_snippets`）。
2. **一键示例**：界面提供多条示例提示词，便于快速试流程。
3. **复制**：代码区「复制当前」写入剪贴板。
4. **预览**：含表格的 HTML 在 iframe 中渲染；Vue SFC 会从 `<template>` 中抽取 `<table>` 用于预览。
5. **历史**：生成成功写入 **localStorage**（`ai-dev-studio-history-v1`，最多 **40** 条），可恢复 / 删除 / 清空；离线演示条目会标记为 mock。
6. **MCP 桥接**：`GET /api/mcp/tools` 返回与本项目一致的 `tools` JSON、`chatEndpoint` 与说明，便于 MCP 宿主通过 HTTP 转发到 `POST /api/chat`。
7. **离线演示**：当前提供商在 `.env` 中 **未配置对应 API Key** 时，返回内置 Markdown（含 fenced 代码块），无需外网模型即可验收 UI。
8. **上游容错**：若开启 Function Calling 且上游返回「不支持 tools」类错误，服务端会 **自动去掉 `tools` 再请求一次**；余额不足、Key 无效等会返回可读的中文说明。

### 输出栈与模型侧约束

- **React**：系统提示期望 `html`、`jsx`（`export default` 函数组件）、`sql`。
- **Vue**：期望 `html`、`vue`（Vue 3 + `<script setup lang="ts">` + `<template>`）、`sql`。
- **SQL**：侧重 PostgreSQL 风格的 `CREATE TABLE` / `INSERT`，并附带用于预览的 `html` 表格；默认不要求 JSX/Vue。

## API 约定（`vite dev` / `vite preview`，本地）

### `POST /api/chat`

**请求体（JSON）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 必填，用户描述 |
| `provider` | string | 可选，`deepseek`（默认）、`openai`、`qwen` |
| `outputTarget` | string | 可选，`react`、`vue`、`sql` |
| `useFunctionCalling` | boolean | 可选；未显式传 `false` 且未禁用 FC 时，会附带 `tools` |

**成功响应（JSON）**

| 字段 | 说明 |
|------|------|
| `content` | 模型或离线演示返回的 Markdown 字符串 |
| `mock` | 是否为离线内置内容 |
| `usedTools` | 是否解析/使用了 `tool_calls` |
| `outputTarget` | 归一化后的输出栈 |

密钥读取：`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`DASHSCOPE_API_KEY`（与所选 `provider` 对应）。

若配置了 **`base`**（如 GitHub Pages 子路径），前端会通过 `import.meta.env.BASE_URL` 请求带前缀的接口（例如 `/repo/api/chat`），服务端中间件会与 `config.base` 对齐；请勿再手写根路径 `/api/chat`。

### `GET /api/mcp/tools`

返回 `tools`（与聊天接口一致）、`name`、`description`、`chatEndpoint: '/api/chat'`。

## 离线演示匹配规则（无 Key 时）

内置内容按 **提示词** 分支（均随 `outputTarget` 切换 HTML / JSX 或 Vue / SQL）：

- **登录页**：识别「登录页」类描述，且包含账号/密码/验证码/手机登录等组合（兼容「密码登录 + 验证码登录」等旧说法），返回双 Tab（账号登录 / 手机登录）示例。
- **三日天气预报**：识别「天气预报」且「三天」等，且含「表格」或「日期」等，返回日期 / 气温 / 天气状况表示例。
- **默认**：其它表格类需求走通用「姓名 / 年龄」表示例。

设置 `DISABLE_AI_MOCK=1` 后，未配置密钥将 **直接报错**，不再返回上述演示。

## 配置与环境变量

复制 `.env.example` 为 `.env`，按需填写。**修改 `.env 后需重启 `npm run dev` 或 `npm run preview`。**

| 变量 | 含义 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek OpenAI 兼容接口 |
| `OPENAI_API_KEY` | OpenAI（或兼容 endpoint 时可自行改 `vite.config.ts` 内 URL） |
| `DASHSCOPE_API_KEY` | 阿里云 DashScope（通义千问兼容模式） |
| `DISABLE_AI_MOCK` | 设为 `1` / `true` 等：无密钥时不走内置演示 |
| `DISABLE_FUNCTION_CALLING` | 设为 `1` / `true` 等：请求上游时不传 `tools` |

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问终端提示的本地地址（一般为 `http://localhost:5173`）。

## 构建与检查

```bash
npm run build    # tsc -b && vite build
npm run preview  # 预览 dist；与本项目配套的 /api/chat 会一并生效（需 Node 进程，非静态 CDN）
npm run lint     # ESLint
```

## Vercel 部署

仓库含 **`api/chat.ts`**、**`api/mcp/tools.ts`**（Serverless）与 **`vercel.json`**：`POST /api/chat`、`GET /api/mcp/tools` 由 Vercel 运行 Node 函数，静态页面仍由 **`dist/`** 提供。

1. 将项目导入 Vercel，使用默认 **Build Command**：`npm run build`，**Output Directory**：`dist`（与 `vercel.json` 一致即可）。
2. 在 Vercel 项目 **Environment Variables** 中配置与本地相同的密钥，例如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`DASHSCOPE_API_KEY`；可选 `DISABLE_AI_MOCK`、`DISABLE_FUNCTION_CALLING`。
3. 重新部署后，前端与 **`/api/chat`** 同源，无需改 `BASE_URL`（根域名部署时）。

若仍看到 HTML 形式的 NOT_FOUND，多是 **未触发最新部署** 或 **`api` 目录未被推送**；请在 Vercel 面板确认本次构建日志里包含 Serverless Functions。

## 项目结构（摘要）

```
vite.config.ts          # Vite + Tailwind；开发/预览中间层转发至 server 逻辑
server/aiChatCore.ts    # /api/chat 共用核心（Vite 与 Vercel）
api/chat.ts             # Vercel：POST /api/chat
api/mcp/tools.ts        # Vercel：GET /api/mcp/tools
vercel.json             # 构建产物目录与 SPA fallback
src/App.tsx             # 主界面、示例词、历史与请求参数
src/lib/history.ts      # localStorage 历史（40 条上限）
src/lib/outputTarget.ts # 输出栈类型与选项文案
src/lib/parseGenerated.ts
src/lib/utils.ts        # cn 等
src/components/CodeHighlight.tsx
src/components/PreviewPane.tsx
src/components/ui/      # Button、Input、Card、Label 等
```

## 许可证

MIT
