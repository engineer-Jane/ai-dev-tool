export type CodeBlock = {
  lang: string
  code: string
}

const FENCE = /```(?:([\w+-]*)\n)?([\s\S]*?)```/g

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  for (const m of markdown.matchAll(FENCE)) {
    const lang = (m[1] ?? '').trim().toLowerCase()
    const code = (m[2] ?? '').replace(/\n$/, '')
    if (code) blocks.push({ lang: normalizeLang(lang), code })
  }
  return blocks
}

function normalizeLang(lang: string): string {
  if (lang === 'tsx' || lang === 'javascript' || lang === 'js') return 'jsx'
  if (lang === 'postgresql' || lang === 'mysql') return 'sql'
  if (lang === 'vue' || lang === 'sfc') return 'vue'
  return lang || 'text'
}

export function htmlForPreview(blocks: CodeBlock[]): string | null {
  const html = blocks.find((b) => b.lang === 'html')
  if (html) return sanitizeHtmlFragment(html.code)

  const vue = blocks.find((b) => b.lang === 'vue')
  if (vue) {
    const fromVue = vueTemplateTableToHtml(vue.code)
    if (fromVue) return sanitizeHtmlFragment(fromVue)
  }

  const jsx = blocks.find((b) => b.lang === 'jsx')
  if (jsx) {
    const fromJsx = naiveJsxTableToHtml(jsx.code)
    if (fromJsx) return sanitizeHtmlFragment(fromJsx)
  }

  const raw = blocks[0]?.code ?? ''
  if (/<table[\s\S]*<\/table>/i.test(raw)) {
    return sanitizeHtmlFragment(raw.match(/<table[\s\S]*<\/table>/i)![0])
  }

  return null
}

function vueTemplateTableToHtml(vue: string): string | null {
  const tmpl = vue.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)
  const inner = tmpl ? tmpl[1] : vue
  const table = inner.match(/<table[\s\S]*?<\/table>/i)
  return table ? table[0] : null
}

function naiveJsxTableToHtml(jsx: string): string | null {
  const match = jsx.match(/<table[\s\S]*?<\/table>/i)
  if (!match) return null
  return match[0]
    .replace(/className=/g, 'class=')
    .replace(/\{["']([^"']+)["']\}/g, '$1')
    .replace(/\{[^}]+\}/g, '')
}

function sanitizeHtmlFragment(html: string): string {
  let out = html
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  out = out.replace(/<\/?(?:iframe|object|embed|link|meta)\b[^>]*>/gi, '')
  out = out.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(/javascript:/gi, '')
  return out
}
