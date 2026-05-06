import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

type ChatBody = {
  provider?: string
  prompt?: string
  outputTarget?: string
  useFunctionCalling?: boolean
}

type OutputTarget = 'react' | 'vue' | 'sql'

type ToolCall = {
  id: string
  type?: string
  function?: { name?: string; arguments?: string }
}

const CODE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'emit_code_snippets',
      description:
        '将表格/列表界面与数据库结构以结构化片段输出。lang 必须是 html、jsx、vue、sql 之一。',
      parameters: {
        type: 'object',
        properties: {
          snippets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lang: {
                  type: 'string',
                  enum: ['html', 'jsx', 'vue', 'sql'],
                },
                code: { type: 'string' },
              },
              required: ['lang', 'code'],
            },
          },
          notes: { type: 'string' },
        },
        required: ['snippets'],
      },
    },
  },
]

const PROVIDERS: Record<
  string,
  { url: string; envKey: string; model: string }
> = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'DASHSCOPE_API_KEY',
    model: 'qwen-turbo',
  },
}

function readJsonBody(req: IncomingMessage): Promise<ChatBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as ChatBody) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function normalizeTarget(v: unknown): OutputTarget {
  const s = String(v ?? 'react').toLowerCase()
  if (s === 'vue' || s === 'sql') return s
  return 'react'
}

function truthyEnv(v: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase())
}

function parseToolCallsToMarkdown(toolCalls: ToolCall[]): string | null {
  const chunks: string[] = []
  for (const tc of toolCalls) {
    if (tc.function?.name !== 'emit_code_snippets') continue
    const rawArgs = tc.function.arguments ?? '{}'
    try {
      const args = JSON.parse(rawArgs) as {
        snippets?: Array<{ lang?: string; code?: string }>
        notes?: string
      }
      if (args.notes?.trim()) chunks.push(args.notes.trim())
      for (const s of args.snippets ?? []) {
        const lang = String(s.lang ?? 'text').toLowerCase()
        const code = String(s.code ?? '').trim()
        if (!code) continue
        chunks.push('```' + lang + '\n' + code + '\n```')
      }
    } catch {
      return null
    }
  }
  return chunks.length ? chunks.join('\n\n') : null
}

function extractContentFromChoice(data: {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: ToolCall[]
    }
  }>
}): { content: string; usedTools: boolean } {
  const msg = data.choices?.[0]?.message
  const toolCalls = msg?.tool_calls
  if (toolCalls?.length) {
    const md = parseToolCallsToMarkdown(toolCalls)
    if (md) return { content: md, usedTools: true }
  }
  return { content: msg?.content ?? '', usedTools: false }
}

function looksLikeToolUnsupported(text: string): boolean {
  const lower = text.toLowerCase()
  if (
    lower.includes('tool') &&
    (/not support|unsupported|unknown parameter|invalid/i.test(lower) ||
      lower.includes('不支持'))
  ) {
    return true
  }
  try {
    const j = JSON.parse(text) as { error?: { message?: string } }
    return /tool|不支持|未知参数|invalid/i.test(j.error?.message ?? '')
  } catch {
    return false
  }
}

function isLoginBuiltInPrompt(prompt: string): boolean {
  const p = prompt.trim()
  if (!p) return false
  const loginPage = /登录\s*页面|登录页/.test(p)
  if (/账号\s*登录/.test(p) && /手机\s*登录/.test(p)) return true
  if (/密码\s*登录/.test(p) && /验证码\s*登录/.test(p)) return true
  if (loginPage && /密码/.test(p) && /验证码/.test(p)) return true
  if (
    loginPage &&
    (/账号\s*登录|帐户\s*登录/.test(p) || /账号/.test(p)) &&
    (/手机\s*登录/.test(p) || /手机/.test(p))
  ) {
    return true
  }
  return false
}

function isWeatherForecastBuiltInPrompt(prompt: string): boolean {
  const p = prompt.trim()
  if (!p) return false
  if (!/天气预报/.test(p)) return false
  if (!/三天|三日|3\s*天/.test(p)) return false
  return /表格|日期/.test(p)
}

function mockWeatherMarkdown(target: OutputTarget): string {
  const htmlBlock = [
    '```html',
    `<section class="weather-demo" aria-labelledby="weather-title">
<style>
.weather-demo{--bg:#f8fafc;--bd:#e2e8f0;--txt:#0f172a;--muted:#64748b;font-family:ui-sans-serif,system-ui,sans-serif;color:var(--txt);max-width:520px;margin:20px auto;padding:24px 26px 26px;background:linear-gradient(165deg,#fff 0%,var(--bg) 100%);border-radius:20px;border:1px solid rgba(148,163,184,.35);box-shadow:0 18px 44px -20px rgba(15,23,42,.25)}
.weather-demo h2{margin:0 0 6px;font-size:1.15rem;font-weight:700;letter-spacing:-.02em}
.weather-demo .hint{margin:0 0 18px;font-size:13px;color:var(--muted)}
.weather-demo table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;border-radius:14px;overflow:hidden;border:1px solid var(--bd)}
.weather-demo thead{background:linear-gradient(180deg,#f1f5f9,#e2e8f0)}
.weather-demo th,.weather-demo td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--bd)}
.weather-demo th{font-weight:700;font-size:12px;color:#475569;text-transform:none;letter-spacing:.02em}
.weather-demo tbody tr:last-child td{border-bottom:none}
.weather-demo tbody tr:nth-child(even){background:rgba(248,250,252,.85)}
.weather-demo td:last-child{font-variant-numeric:tabular-nums}
.weather-demo .cond{font-weight:600;color:#334155}
</style>
<h2 id="weather-title">未来三天天气预报</h2>
<p class="hint">演示数据 · 列：日期、气温、天气状况</p>
<table>
  <thead>
    <tr><th scope="col">日期</th><th scope="col">气温</th><th scope="col">天气状况</th></tr>
  </thead>
  <tbody>
    <tr><td>2026-05-06（今天）</td><td>16°C ~ 24°C</td><td class="cond">多云</td></tr>
    <tr><td>2026-05-07</td><td>17°C ~ 26°C</td><td class="cond">晴</td></tr>
    <tr><td>2026-05-08</td><td>15°C ~ 22°C</td><td class="cond">小雨</td></tr>
  </tbody>
</table>
</section>`,
    '```',
  ].join('\n')

  const sqlBlock = [
    '```sql',
    `-- 三日天气预报示例（PostgreSQL）
CREATE TABLE weather_daily (
  id BIGSERIAL PRIMARY KEY,
  forecast_date DATE NOT NULL UNIQUE,
  temp_low_c SMALLINT NOT NULL,
  temp_high_c SMALLINT NOT NULL,
  condition_text VARCHAR(32) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO weather_daily (forecast_date, temp_low_c, temp_high_c, condition_text) VALUES
  ('2026-05-06', 16, 24, '多云'),
  ('2026-05-07', 17, 26, '晴'),
  ('2026-05-08', 15, 22, '小雨');`,
    '```',
  ].join('\n')

  const jsxBlock = [
    '```jsx',
    `const rows = [
  { date: '2026-05-06（今天）', temp: '16°C ~ 24°C', condition: '多云' },
  { date: '2026-05-07', temp: '17°C ~ 26°C', condition: '晴' },
  { date: '2026-05-08', temp: '15°C ~ 22°C', condition: '小雨' },
]

export default function WeatherForecastTable() {
  const shell = {
    maxWidth: 520,
    margin: '20px auto',
    padding: '24px 26px 26px',
    borderRadius: 20,
    border: '1px solid rgba(148,163,184,.35)',
    background: 'linear-gradient(165deg,#fff 0%,#f8fafc 100%)',
    boxShadow: '0 18px 44px -20px rgba(15,23,42,.25)',
    fontFamily: 'ui-sans-serif,system-ui,sans-serif',
    color: '#0f172a',
  }
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  }
  const thTd = { padding: '12px 14px', textAlign: 'left' as const, borderBottom: '1px solid #e2e8f0' }
  return (
    <section style={shell} aria-labelledby="wf-title">
      <h2 id="wf-title" style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 700 }}>
        未来三天天气预报
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b' }}>演示数据 · 列：日期、气温、天气状况</p>
      <table style={tableStyle}>
        <thead style={{ background: 'linear-gradient(180deg,#f1f5f9,#e2e8f0)' }}>
          <tr>
            <th scope="col" style={{ ...thTd, fontWeight: 700, fontSize: 12, color: '#475569' }}>日期</th>
            <th scope="col" style={{ ...thTd, fontWeight: 700, fontSize: 12, color: '#475569' }}>气温</th>
            <th scope="col" style={{ ...thTd, fontWeight: 700, fontSize: 12, color: '#475569' }}>天气状况</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.date} style={{ background: i % 2 ? 'rgba(248,250,252,.85)' : undefined }}>
              <td style={thTd}>{r.date}</td>
              <td style={{ ...thTd, fontVariantNumeric: 'tabular-nums' }}>{r.temp}</td>
              <td style={{ ...thTd, fontWeight: 600, color: '#334155' }}>{r.condition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}`,
    '```',
  ].join('\n')

  const vueBlock = [
    '```vue',
    `<script setup lang="ts">
const rows = [
  { date: '2026-05-06（今天）', temp: '16°C ~ 24°C', condition: '多云' },
  { date: '2026-05-07', temp: '17°C ~ 26°C', condition: '晴' },
  { date: '2026-05-08', temp: '15°C ~ 22°C', condition: '小雨' },
]
const shell =
  'max-width:520px;margin:20px auto;padding:24px 26px 26px;border-radius:20px;border:1px solid rgba(148,163,184,.35);background:linear-gradient(165deg,#fff 0%,#f8fafc 100%);box-shadow:0 18px 44px -20px rgba(15,23,42,.25);font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a'
const tableStyle =
  'width:100%;border-collapse:collapse;font-size:14px;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0'
const cell = 'padding:12px 14px;text-align:left;border-bottom:1px solid #e2e8f0'
const headCell = cell + ';font-weight:700;font-size:12px;color:#475569'
</script>
<template>
  <section :style="shell" aria-labelledby="wf-title">
    <h2 id="wf-title" style="margin:0 0 6px;font-size:1.15rem;font-weight:700">未来三天天气预报</h2>
    <p style="margin:0 0 18px;font-size:13px;color:#64748b">演示数据 · 列：日期、气温、天气状况</p>
    <table :style="tableStyle">
      <thead style="background:linear-gradient(180deg,#f1f5f9,#e2e8f0)">
        <tr>
          <th scope="col" :style="headCell">日期</th>
          <th scope="col" :style="headCell">气温</th>
          <th scope="col" :style="headCell">天气状况</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(r, i) in rows"
          :key="r.date"
          :style="i % 2 ? { background: 'rgba(248,250,252,.85)' } : undefined"
        >
          <td :style="cell">{{ r.date }}</td>
          <td :style="cell + ';font-variant-numeric:tabular-nums'">{{ r.temp }}</td>
          <td :style="cell + ';font-weight:600;color:#334155'">{{ r.condition }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>`,
    '```',
  ].join('\n')

  const header =
    '> **离线演示模式**：内置「三日天气预报」表格示例（日期 / 气温 / 天气）。配置 API Key 后可由模型生成定制版本。'

  if (target === 'sql') return [header, '', sqlBlock, '', htmlBlock].join('\n')
  if (target === 'vue')
    return [header, '', htmlBlock, '', vueBlock, '', sqlBlock].join('\n')
  return [header, '', htmlBlock, '', jsxBlock, '', sqlBlock].join('\n')
}

function mockTableMarkdown(target: OutputTarget): string {
  const htmlBlock = [
    '```html',
    `<table>
  <thead><tr><th>姓名</th><th>年龄</th></tr></thead>
  <tbody>
    <tr><td>张三</td><td>28</td></tr>
    <tr><td>李四</td><td>34</td></tr>
    <tr><td>王五</td><td>22</td></tr>
  </tbody>
</table>`,
    '```',
  ].join('\n')

  const sqlBlock = [
    '```sql',
    `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  age SMALLINT NOT NULL CHECK (age >= 0 AND age <= 150)
);
INSERT INTO users (name, age) VALUES ('张三', 28), ('李四', 34), ('王五', 22);`,
    '```',
  ].join('\n')

  const jsxBlock = [
    '```jsx',
    `export default function UserTable() {
  return (
    <table>
      <thead><tr><th>姓名</th><th>年龄</th></tr></thead>
      <tbody>
        <tr><td>张三</td><td>28</td></tr>
        <tr><td>李四</td><td>34</td></tr>
        <tr><td>王五</td><td>22</td></tr>
      </tbody>
    </table>
  )
}`,
    '```',
  ].join('\n')

  const vueBlock = [
    '```vue',
    `<script setup lang="ts">
const rows = [
  { name: '张三', age: 28 },
  { name: '李四', age: 34 },
  { name: '王五', age: 22 },
]
</script>
<template>
  <table>
    <thead><tr><th>姓名</th><th>年龄</th></tr></thead>
    <tbody>
      <tr v-for="r in rows" :key="r.name"><td>{{ r.name }}</td><td>{{ r.age }}</td></tr>
    </tbody>
  </table>
</template>`,
    '```',
  ].join('\n')

  const header =
    '> **离线演示模式**：未检测到 API Key。以下为内置示例。配置密钥并重启 dev 后调用真实模型。'

  if (target === 'sql') return [header, '', sqlBlock, '', htmlBlock].join('\n')
  if (target === 'vue')
    return [header, '', htmlBlock, '', vueBlock, '', sqlBlock].join('\n')
  return [header, '', htmlBlock, '', jsxBlock, '', sqlBlock].join('\n')
}

function mockLoginMarkdown(target: OutputTarget): string {
  const loginHtml = `<section class="login-demo">
<style>
.login-demo{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased}
.login-demo .shell{max-width:400px;margin:24px auto;padding:34px 30px 30px;background:linear-gradient(165deg,#fff 0%,#f8fafc 48%,#f1f5f9 100%);border-radius:24px;box-shadow:0 25px 60px -18px rgba(15,23,42,.2),0 0 0 1px rgba(148,163,184,.14)}
.login-demo .brand{text-align:center;margin-bottom:4px}
.login-demo .brand-dot{width:48px;height:48px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);box-shadow:0 12px 28px -8px rgba(99,102,241,.55)}
.login-demo h2{margin:0;font-size:23px;font-weight:700;letter-spacing:-.035em;color:#0f172a;line-height:1.2}
.login-demo .sub{margin:10px 0 26px;font-size:13px;color:#64748b;font-weight:450;line-height:1.5}
.login-demo input[name="login-tab"]{position:absolute;opacity:0;width:0;height:0;margin:0}
.login-demo .tab-headers{display:flex;gap:5px;margin-bottom:18px;padding:6px;background:#e2e8f0;border-radius:18px}
.login-demo .tab-headers label{flex:1;text-align:center;padding:11px 8px;border-radius:14px;color:#475569;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s,color .2s,box-shadow .2s}
.login-demo .tab-headers label:hover{background:rgba(255,255,255,.45)}
.login-demo #login-tab-pwd:checked~.tab-headers label[for="login-tab-pwd"],
.login-demo #login-tab-otp:checked~.tab-headers label[for="login-tab-otp"]{background:#fff;color:#0f172a;box-shadow:0 2px 10px rgba(15,23,42,.07)}
.login-demo .panels>.panel{display:none;padding:24px;background:#fff;border-radius:20px;border:1px solid rgba(226,232,240,.95);box-sizing:border-box;box-shadow:0 4px 16px rgba(15,23,42,.04)}
.login-demo #login-tab-pwd:checked~.panels .panel-pwd{display:block}
.login-demo #login-tab-otp:checked~.panels .panel-otp{display:block}
.login-demo .field{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}
.login-demo .field:first-child{margin-top:0}
.login-demo .panel-pwd input,.login-demo .panel-otp input[type=tel]{display:block;width:100%;box-sizing:border-box;padding:13px 15px;margin:0 0 16px;border:1px solid #e2e8f0;border-radius:14px;font-size:15px;color:#0f172a;background:#f8fafc;transition:border-color .15s,box-shadow .15s,background .15s}
.login-demo .panel-pwd input:last-of-type{margin-bottom:18px}
.login-demo .panel-pwd input:focus,.login-demo .panel-otp input:focus,.login-demo .panel-otp .row input:focus{outline:none;border-color:#818cf8;background:#fff;box-shadow:0 0 0 3px rgba(129,140,248,.18)}
.login-demo .row{display:flex;gap:10px;align-items:center;margin-bottom:4px}
.login-demo .panel-otp .row input{flex:1;min-width:0;width:0;margin-bottom:0;display:block;box-sizing:border-box;padding:13px 15px;border:1px solid #e2e8f0;border-radius:14px;font-size:15px;color:#0f172a;background:#f8fafc;transition:border-color .15s,box-shadow .15s,background .15s}
.login-demo .btn-code{flex-shrink:0;padding:13px 14px;border-radius:14px;border:1px solid #cbd5e1;background:linear-gradient(180deg,#fff,#f8fafc);color:#334155;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(15,23,42,.05);line-height:1.2}
.login-demo .btn-main{width:100%;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(180deg,#334155,#0f172a);color:#fff;box-shadow:0 6px 20px rgba(15,23,42,.22)}
.login-demo .btn-otp{width:100%;margin-top:18px;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(180deg,#34d399,#059669);color:#fff;box-shadow:0 6px 22px rgba(5,150,105,.28)}
.login-demo .wx-title{margin:0 0 16px;font-size:16px;font-weight:700;color:#065f46;text-align:center;letter-spacing:-.02em}
.login-demo .wx-qr{width:180px;height:180px;margin:0 auto 16px;border-radius:18px;background:#fff;border:2px solid rgba(5,150,105,.28);display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;line-height:1.65;color:#047857;padding:14px;box-shadow:0 14px 40px rgba(5,150,105,.11)}
.login-demo .wx-tip{margin:0;font-size:13px;color:#475569;text-align:center;line-height:1.65}
.login-demo .wx-foot{margin:14px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.55}
</style>
<div class="shell">
<div class="brand"><div class="brand-dot" aria-hidden="true"></div>
<h2>欢迎回来</h2>
<p class="sub">选择登录方式，安全进入工作台</p></div>
<input type="radio" name="login-tab" id="login-tab-pwd" checked>
<input type="radio" name="login-tab" id="login-tab-otp">
<div class="tab-headers">
<label for="login-tab-pwd">账号登录</label>
<label for="login-tab-otp">手机登录</label>
</div>
<div class="panels">
<div class="panel panel-pwd">
<span class="field">手机号 / 邮箱</span>
<input type="text" placeholder="name@company.com" autocomplete="username"/>
<span class="field">密码</span>
<input type="password" placeholder="请输入登录密码" autocomplete="current-password"/>
<button type="button" class="btn-main">登录</button>
</div>
<div class="panel panel-otp">
<span class="field">手机号</span>
<input type="tel" placeholder="11 位中国大陆手机号"/>
<span class="field">验证码</span>
<div class="row">
<input type="text" placeholder="短信 6 位数字"/>
<button type="button" class="btn-code">获取验证码</button>
</div>
<button type="button" class="btn-otp">验证并登录</button>
</div>
</div>
</div>
</section>`

  const htmlBlock = ['```html', loginHtml, '```'].join('\n')

  const sqlBlock = [
    '```sql',
    `-- 登录相关表示例（PostgreSQL 风格）
CREATE TABLE app_users (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sms_otp_codes (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON sms_otp_codes (phone, expires_at);`,
    '```',
  ].join('\n')

  const jsxBlock = [
    '```jsx',
    `import { useState } from 'react'

const shell = {
  maxWidth: 400,
  margin: '24px auto',
  padding: '34px 30px 30px',
  background: 'linear-gradient(165deg,#fff 0%,#f8fafc 48%,#f1f5f9 100%)',
  borderRadius: 24,
  boxShadow:
    '0 25px 60px -18px rgba(15,23,42,.2), 0 0 0 1px rgba(148,163,184,.14)',
  fontFamily: 'ui-sans-serif,system-ui,sans-serif',
  color: '#0f172a',
}

const tabBar = { display: 'flex', gap: 5, marginBottom: 18, padding: 6, background: '#e2e8f0', borderRadius: 18 }

const tabBtn = (active) => ({
  flex: 1,
  padding: '11px 8px',
  border: 'none',
  borderRadius: 14,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  background: active ? '#fff' : 'transparent',
  color: active ? '#0f172a' : '#475569',
  boxShadow: active ? '0 2px 10px rgba(15,23,42,.07)' : 'none',
})

const card = {
  padding: 24,
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(226,232,240,.95)',
  boxShadow: '0 4px 16px rgba(15,23,42,.04)',
}

const inp = {
  width: '100%',
  padding: '13px 15px',
  marginBottom: 16,
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxSizing: 'border-box',
  fontSize: 15,
  background: '#f8fafc',
  color: '#0f172a',
}

export default function LoginPage() {
  const [tab, setTab] = useState('password')
  return (
    <div style={shell}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 48,
            height: 48,
            margin: '0 auto 16px',
            borderRadius: 16,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)',
            boxShadow: '0 12px 28px -8px rgba(99,102,241,.55)',
          }}
        />
        <h2 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-0.035em' }}>欢迎回来</h2>
        <p style={{ margin: '10px 0 26px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
          选择登录方式，安全进入工作台
        </p>
      </div>
      <div style={tabBar}>
        <button type="button" style={tabBtn(tab === 'password')} onClick={() => setTab('password')}>
          账号登录
        </button>
        <button type="button" style={tabBtn(tab === 'otp')} onClick={() => setTab('otp')}>
          手机登录
        </button>
      </div>
      {tab === 'password' && (
        <div style={card}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>手机号 / 邮箱</span>
          <input placeholder="name@company.com" style={{ ...inp, marginTop: 8 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>密码</span>
          <input type="password" placeholder="请输入登录密码" style={{ ...inp, marginTop: 8, marginBottom: 18 }} />
          <button
            type="button"
            style={{
              width: '100%',
              padding: 14,
              border: 'none',
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              background: 'linear-gradient(180deg,#334155,#0f172a)',
              boxShadow: '0 6px 20px rgba(15,23,42,.22)',
            }}
          >
            登录
          </button>
        </div>
      )}
      {tab === 'otp' && (
        <div style={card}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>手机号</span>
          <input type="tel" placeholder="11 位中国大陆手机号" style={{ ...inp, marginTop: 8 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>验证码</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
            <input
              placeholder="短信 6 位数字"
              style={{
                ...inp,
                flex: 1,
                minWidth: 0,
                width: 0,
                marginBottom: 0,
              }}
            />
            <button
              type="button"
              style={{
                flexShrink: 0,
                padding: '13px 14px',
                borderRadius: 14,
                border: '1px solid #cbd5e1',
                background: 'linear-gradient(180deg,#fff,#f8fafc)',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              获取验证码
            </button>
          </div>
          <button
            type="button"
            style={{
              width: '100%',
              marginTop: 18,
              padding: 14,
              border: 'none',
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              background: 'linear-gradient(180deg,#34d399,#059669)',
              boxShadow: '0 6px 22px rgba(5,150,105,.28)',
            }}
          >
            验证并登录
          </button>
        </div>
      )}
    </div>
  )
}`,
    '```',
  ].join('\n')

  const vueBlock = [
    '```vue',
    `<script setup lang="ts">
import { ref } from 'vue'

type Tab = 'password' | 'otp'
const tab = ref<Tab>('password')

const shell = {
  maxWidth: '400px',
  margin: '24px auto',
  padding: '34px 30px 30px',
  background: 'linear-gradient(165deg,#fff 0%,#f8fafc 48%,#f1f5f9 100%)',
  borderRadius: '24px',
  boxShadow: '0 25px 60px -18px rgba(15,23,42,.2), 0 0 0 1px rgba(148,163,184,.14)',
  fontFamily: 'ui-sans-serif,system-ui,sans-serif',
  color: '#0f172a',
}

function tabStyle(active: boolean) {
  return {
    flex: 1,
    padding: '11px 8px',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    background: active ? '#fff' : 'transparent',
    color: active ? '#0f172a' : '#475569',
    boxShadow: active ? '0 2px 10px rgba(15,23,42,.07)' : 'none',
  }
}

const cardBase =
  'padding:24px;background:#fff;border-radius:20px;border:1px solid rgba(226,232,240,.95);box-shadow:0 4px 16px rgba(15,23,42,.04)'
const inp =
  'width:100%;padding:13px 15px;border-radius:14px;border:1px solid #e2e8f0;box-sizing:border-box;font-size:15px;background:#f8fafc;color:#0f172a'
</script>
<template>
  <div :style="shell">
    <div style="text-align:center">
      <div
        style="width:48px;height:48px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7);box-shadow:0 12px 28px -8px rgba(99,102,241,.55)"
      />
      <h2 style="margin:0;font-size:23px;font-weight:700;letter-spacing:-0.035em">欢迎回来</h2>
      <p style="margin:10px 0 26px;font-size:13px;color:#64748b;line-height:1.5">选择登录方式，安全进入工作台</p>
    </div>
    <div style="display:flex;gap:5px;margin-bottom:18px;padding:6px;background:#e2e8f0;border-radius:18px">
      <button type="button" :style="tabStyle(tab === 'password')" @click="tab = 'password'">账号登录</button>
      <button type="button" :style="tabStyle(tab === 'otp')" @click="tab = 'otp'">手机登录</button>
    </div>
    <div v-if="tab === 'password'" :style="cardBase">
      <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em">手机号 / 邮箱</span>
      <input placeholder="name@company.com" :style="inp + ';margin-top:8px;margin-bottom:16px'" />
      <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em">密码</span>
      <input type="password" placeholder="请输入登录密码" :style="inp + ';margin-top:8px;margin-bottom:18px'" />
      <button
        type="button"
        style="width:100%;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(180deg,#334155,#0f172a);box-shadow:0 6px 20px rgba(15,23,42,.22)"
      >
        登录
      </button>
    </div>
    <div v-else-if="tab === 'otp'" :style="cardBase">
      <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em">手机号</span>
      <input type="tel" placeholder="11 位中国大陆手机号" :style="inp + ';margin-top:8px;margin-bottom:16px'" />
      <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em">验证码</span>
      <div style="display:flex;gap:10px;margin-top:8px;align-items:center">
        <input placeholder="短信 6 位数字" :style="inp + ';flex:1;min-width:0;width:0;margin-bottom:0'" />
        <button
          type="button"
          style="flex-shrink:0;padding:13px 14px;border-radius:14px;border:1px solid #cbd5e1;background:linear-gradient(180deg,#fff,#f8fafc);font-size:13px;font-weight:600;color:#334155;cursor:pointer;white-space:nowrap;line-height:1.2"
        >
          获取验证码
        </button>
      </div>
      <button
        type="button"
        style="width:100%;margin-top:18px;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(180deg,#34d399,#059669);box-shadow:0 6px 22px rgba(5,150,105,.28)"
      >
        验证并登录
      </button>
    </div>
  </div>
</template>`,
    '```',
  ].join('\n')

  const header =
    '> **离线演示模式**：内置「登录页」示例（账号密码 / 手机验证码，双 Tab）。配置 API Key 后可由模型生成定制版本。'

  if (target === 'sql') return [header, '', sqlBlock, '', htmlBlock].join('\n')
  if (target === 'vue')
    return [header, '', htmlBlock, '', vueBlock, '', sqlBlock].join('\n')
  return [header, '', htmlBlock, '', jsxBlock, '', sqlBlock].join('\n')
}

function mockMarkdownForPrompt(userPrompt: string, target: OutputTarget): string {
  if (isLoginBuiltInPrompt(userPrompt)) return mockLoginMarkdown(target)
  if (isWeatherForecastBuiltInPrompt(userPrompt)) return mockWeatherMarkdown(target)
  return mockTableMarkdown(target)
}

function upstreamErrorDetail(body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: string | { message?: string; code?: string }
      message?: string
    }
    const msg =
      typeof j.error === 'object' && j.error?.message
        ? j.error.message
        : typeof j.error === 'string'
          ? j.error
          : (j.message ?? '')
    if (!msg) return body.slice(0, 2000)

    const lower = msg.toLowerCase()
    if (
      lower.includes('insufficient balance') ||
      lower.includes('余额不足') ||
      lower.includes('insufficient_quota')
    ) {
      return [
        '当前账号在该平台上的余额或赠送额度不足，模型接口拒绝了请求。',
        '',
        '你可以：',
        '· 前往对应平台充值 / 开通计费或领取试用额度；',
        '· 暂时改用页面里的其它提供商（若其它账号有余额）；',
        '· 移除 API Key 或清空所选提供商的密钥并重启 dev，使用内置「离线演示」继续验收界面。',
        '',
        `服务商返回：${msg}`,
      ].join('\n')
    }
    if (
      lower.includes('invalid_api_key') ||
      lower.includes('incorrect api key') ||
      lower.includes('无效的令牌')
    ) {
      return [
        'API Key 无效或未通过校验，请检查 .env 是否粘贴完整、是否对应所选提供商。',
        '',
        `服务商返回：${msg}`,
      ].join('\n')
    }
    return [`调用失败：${msg}`, '', body.slice(0, 1200)].join('\n')
  } catch {
    return body.slice(0, 2000)
  }
}

function systemPromptForTarget(target: OutputTarget, toolsEnabled: boolean): string {
  const toolHint = toolsEnabled
    ? '若可使用函数 emit_code_snippets，请优先调用该函数提交 snippets（html / jsx 或 vue / sql），勿留空字段。'
    : ''
  const base =
    '你是资深工程师，帮助用户把自然语言需求落成可运行片段。' +
    (toolHint ? '\n' + toolHint : '')

  if (target === 'sql') {
    return [
      base,
      '用户选择了「SQL 优先」：优先给出 PostgreSQL 兼容的 CREATE TABLE 与 INSERT；再给 html 表格便于预览。',
      '不要输出 React JSX 或 Vue 组件代码块，除非用户明确要求。',
      toolsEnabled
        ? '调用 emit_code_snippets 时请包含 lang 为 sql 与 html 的条目。'
        : '请用 fenced 代码块输出 sql 与 html。',
    ].join('\n')
  }
  if (target === 'vue') {
    return [
      base,
      '用户选择了「Vue」：请给出 html、vue（Vue 3 + script setup 单文件片段）、sql。',
      'vue 代码块须含 <template> 与 <script setup lang="ts">。',
      toolsEnabled
        ? '调用 emit_code_snippets 时请包含 html、vue、sql。'
        : '请用 fenced 代码块输出 html、vue、sql。',
    ].join('\n')
  }
  return [
    base,
    '用户选择了「React」：表格场景请给出 html、jsx（函数组件 export default）、sql。',
    toolsEnabled
      ? '调用 emit_code_snippets 时请包含 html、jsx、sql。'
      : '请用 fenced 代码块输出 html、jsx、sql。',
  ].join('\n')
}

function aiApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'ai-chat-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/mcp/tools') && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.statusCode = 200
          res.end(
            JSON.stringify({
              name: 'ai-dev-studio-tools',
              description:
                'OpenAI Chat Completions 兼容的 tools 定义；可由 MCP 宿主经 HTTP 桥接转发至 POST /api/chat（body 含 prompt、provider、outputTarget、useFunctionCalling）。',
              tools: CODE_TOOLS,
              chatEndpoint: '/api/chat',
            }),
          )
          return
        }

        if (!req.url?.startsWith('/api/chat') || req.method !== 'POST') {
          return next()
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8')

        let body: ChatBody
        try {
          body = await readJsonBody(req)
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: '无效的 JSON 请求体' }))
          return
        }

        const providerKey = (body.provider ?? 'deepseek').toLowerCase()
        const cfg = PROVIDERS[providerKey]
        if (!cfg) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: '不支持的 provider' }))
          return
        }

        const userPrompt = (body.prompt ?? '').trim()
        if (!userPrompt) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'prompt 不能为空' }))
          return
        }

        const outputTarget = normalizeTarget(body.outputTarget)
        const disableFc = truthyEnv(
          env.DISABLE_FUNCTION_CALLING ?? process.env.DISABLE_FUNCTION_CALLING,
        )
        const useFunctionCalling =
          !disableFc && body.useFunctionCalling !== false

        const apiKey = String(
          env[cfg.envKey] ?? process.env[cfg.envKey] ?? '',
        ).trim()
        const disableMock = truthyEnv(
          env.DISABLE_AI_MOCK ?? process.env.DISABLE_AI_MOCK,
        )

        if (!apiKey) {
          if (!disableMock) {
            res.statusCode = 200
            res.end(
              JSON.stringify({
                content: mockMarkdownForPrompt(userPrompt, outputTarget),
                mock: true,
                usedTools: false,
                outputTarget,
              }),
            )
            return
          }
          res.statusCode = 500
          res.end(
            JSON.stringify({
              error: `${cfg.envKey} 未配置或为空`,
              detail: [
                `请在项目根目录（与 vite.config.ts 同级）编辑 .env，写入一行：`,
                `${cfg.envKey}=你的密钥`,
                `（等号右侧粘贴真实 key，不要加引号，不要留空；改完后必须重新执行一次 npm run dev。）`,
                `若使用 OpenAI / 通义千问，请在页面切换「模型提供商」并配置 OPENAI_API_KEY / DASHSCOPE_API_KEY。`,
                `若仅需离线演示 UI，请移除 .env 中的 DISABLE_AI_MOCK=1（或未设置该项），未配置密钥时将返回内置示例。`,
              ].join('\n'),
            }),
          )
          return
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        }

        const messages = [
          {
            role: 'system' as const,
            content: systemPromptForTarget(outputTarget, useFunctionCalling),
          },
          { role: 'user' as const, content: userPrompt },
        ]

        const basePayload = {
          model: cfg.model,
          messages,
          temperature: 0.3,
        }

        try {
          let payload: Record<string, unknown> = { ...basePayload }
          if (useFunctionCalling) {
            payload = {
              ...payload,
              tools: CODE_TOOLS,
              tool_choice: 'auto',
            }
          }

          let upstream = await fetch(cfg.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          })

          let text = await upstream.text()

          if (
            !upstream.ok &&
            useFunctionCalling &&
            looksLikeToolUnsupported(text)
          ) {
            upstream = await fetch(cfg.url, {
              method: 'POST',
              headers,
              body: JSON.stringify(basePayload),
            })
            text = await upstream.text()
          }

          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.end(
              JSON.stringify({
                error: '上游 API 错误',
                detail: upstreamErrorDetail(text),
              }),
            )
            return
          }

          const data = JSON.parse(text) as Parameters<
            typeof extractContentFromChoice
          >[0]
          let { content, usedTools } = extractContentFromChoice(data)

          if (useFunctionCalling && !content.trim()) {
            const msg = data.choices?.[0]?.message
            if (msg?.tool_calls?.length && !usedTools) {
              content =
                parseToolCallsToMarkdown(msg.tool_calls) ??
                '模型返回了 tool_calls，但参数无法解析，请重试或关闭「Function Calling」。'
              usedTools = Boolean(parseToolCallsToMarkdown(msg.tool_calls))
            }
          }

          res.statusCode = 200
          res.end(
            JSON.stringify({
              content,
              mock: false,
              usedTools,
              outputTarget,
            }),
          )
        } catch (e) {
          res.statusCode = 502
          res.end(
            JSON.stringify({
              error: '调用模型失败',
              detail: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), aiApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
