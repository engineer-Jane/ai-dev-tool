export type OutputTarget = 'react' | 'vue' | 'sql'

export const OUTPUT_OPTIONS: { value: OutputTarget; label: string; hint: string }[] = [
  {
    value: 'react',
    label: 'React',
    hint: 'HTML + JSX 组件 + SQL',
  },
  {
    value: 'vue',
    label: 'Vue',
    hint: 'HTML + Vue SFC + SQL',
  },
  {
    value: 'sql',
    label: 'SQL',
    hint: '侧重 SQL + 预览用 HTML',
  },
]

export function normalizeOutputTarget(v: unknown): OutputTarget {
  const s = String(v ?? 'react').toLowerCase()
  if (s === 'vue' || s === 'sql') return s
  return 'react'
}
