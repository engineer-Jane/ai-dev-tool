import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runChatRequest, type ChatBody } from '../server/aiChatCore.ts'

function parseBody(req: VercelRequest): ChatBody {
  const raw = req.body
  if (raw == null) return {}
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString('utf8')
    return s.trim() ? (JSON.parse(s) as ChatBody) : {}
  }
  if (typeof raw === 'string') {
    return raw.trim() ? (JSON.parse(raw) as ChatBody) : {}
  }
  return raw as ChatBody
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }
  let body: ChatBody
  try {
    body = parseBody(req)
  } catch {
    res.status(400).json({ error: '无效的 JSON 请求体' })
    return
  }

  const result = await runChatRequest(body, process.env as Record<string, string | undefined>)
  res.status(result.status).json(result.json)
}
