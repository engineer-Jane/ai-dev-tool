import type { OutputTarget } from '@/lib/outputTarget'

export type HistoryEntry = {
  id: string
  createdAt: number
  prompt: string
  provider: string
  outputTarget: OutputTarget
  raw: string
  mock?: boolean
  usedTools?: boolean
}

const STORAGE_KEY = 'ai-dev-studio-history-v1'
const MAX_ITEMS = 40

function safeParse(raw: string | null): HistoryEntry[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is HistoryEntry =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as HistoryEntry).id === 'string' &&
        typeof (x as HistoryEntry).prompt === 'string' &&
        typeof (x as HistoryEntry).raw === 'string',
    )
  } catch {
    return []
  }
}

export function loadHistory(): HistoryEntry[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

export function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)))
}

export function appendHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): HistoryEntry[] {
  const full: HistoryEntry = {
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? Date.now(),
    prompt: entry.prompt,
    provider: entry.provider,
    outputTarget: entry.outputTarget,
    raw: entry.raw,
    mock: entry.mock,
    usedTools: entry.usedTools,
  }
  const prev = loadHistory().filter((h) => h.id !== full.id)
  const next = [full, ...prev].slice(0, MAX_ITEMS)
  saveHistory(next)
  return next
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function deleteHistoryItem(id: string): HistoryEntry[] {
  const next = loadHistory().filter((h) => h.id !== id)
  saveHistory(next)
  return next
}
