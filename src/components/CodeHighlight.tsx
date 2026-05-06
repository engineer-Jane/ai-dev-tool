import { useLayoutEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism-tomorrow.css'
import { cn } from '@/lib/utils'

function prismLang(lang: string): string {
  if (lang === 'html') return 'markup'
  if (lang === 'jsx' || lang === 'tsx') return 'jsx'
  if (lang === 'vue' || lang === 'sfc') return 'markup'
  if (lang === 'sql') return 'sql'
  return lang
}

export function CodeHighlight({
  code,
  lang,
  className,
}: {
  code: string
  lang: string
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const effective = prismLang(lang)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const grammar = Prism.languages[effective]
    if (grammar) {
      el.innerHTML = Prism.highlight(code, grammar, effective)
    } else {
      el.textContent = code
    }
  }, [code, effective])

  return (
    <pre
      className={cn(
        '!m-0 max-h-[min(52vh,560px)] overflow-auto rounded-lg border border-zinc-800 bg-[#2d2d2d] p-4 text-[13px] leading-relaxed',
        className,
      )}
    >
      <code ref={ref} className={`language-${effective}`} />
    </pre>
  )
}
