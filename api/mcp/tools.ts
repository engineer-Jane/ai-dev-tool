import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildMcpToolsPayload } from '../../server/aiChatCore.ts'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }
  res.status(200).json(buildMcpToolsPayload('/api/chat'))
}
