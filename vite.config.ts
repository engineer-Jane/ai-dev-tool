import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Connect } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import {
  buildMcpToolsPayload,
  runChatRequest,
  type ChatBody,
} from './server/aiChatCore.ts'

/** 与 import.meta.env.BASE_URL / config.base 对齐，例如 base 为 `/repo/` 时接口在 `/repo/api/chat */
function joinUnderViteBase(viteBase: string, absPath: string): string {
  const prefix = viteBase.endsWith('/') ? viteBase.slice(0, -1) : viteBase
  const suffix = absPath.startsWith('/') ? absPath : `/${absPath}`
  if (!prefix || prefix === '.' || prefix === '/') return suffix
  return `${prefix}${suffix}`
}

function resolvedApiPaths(viteBase: string): { chat: string; mcpTools: string } {
  return {
    chat: joinUnderViteBase(viteBase, '/api/chat'),
    mcpTools: joinUnderViteBase(viteBase, '/api/mcp/tools'),
  }
}

function requestUrlPath(url: string | undefined): string {
  if (!url) return '/'
  const q = url.indexOf('?')
  const p = q >= 0 ? url.slice(0, q) : url
  return p.startsWith('/') ? p : `/${p}`
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


function createAiChatMiddleware(
  env: Record<string, string>,
  viteBase: string,
): Connect.NextHandleFunction {
  const paths = resolvedApiPaths(viteBase)
  const mergedEnv: Record<string, string | undefined> = {
    ...process.env,
    ...env,
  }
  return async (req, res, next) => {
    const path = requestUrlPath(req.url)

    if (req.method === 'GET' && path === paths.mcpTools) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.statusCode = 200
      res.end(JSON.stringify(buildMcpToolsPayload(paths.chat)))
      return
    }

    if (req.method !== 'POST' || path !== paths.chat) {
      return next()
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    let body: ChatBody
    try {
      body = await readJsonBody(req as IncomingMessage)
    } catch {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '无效的 JSON 请求体' }))
      return
    }

    const result = await runChatRequest(body, mergedEnv)
    res.statusCode = result.status
    res.end(JSON.stringify(result.json))
  }
}

function aiApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'ai-chat-api',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(createAiChatMiddleware(env, server.config.base))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAiChatMiddleware(env, server.config.base))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const previewPort = Number(process.env.PORT)
  return {
    plugins: [react(), tailwindcss(), aiApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // vercel dev 会注入 PORT；本地 npm run preview 仍默认 4173
    preview: {
      host: true,
      port: Number.isFinite(previewPort) && previewPort > 0 ? previewPort : 4173,
      strictPort: false,
    },
  }
})
