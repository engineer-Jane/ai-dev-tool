import { cn } from '@/lib/utils'

function wrapDoc(body: string): string {
  const safe = body.trim()
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
    *{box-sizing:border-box}
    body{margin:0;padding:20px;font-family:ui-sans-serif,system-ui,sans-serif;background:linear-gradient(160deg,#f1f5f9 0%,#e2e8f0 100%);color:#0f172a;line-height:1.5;min-height:100%}
    table{border-collapse:collapse;width:100%;max-width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    th,td{border:1px solid #e4e4e7;padding:10px 12px;text-align:left}
    th{background:#f4f4f5;font-weight:600}
    tr:nth-child(even) td{background:#fafafa}
  </style></head><body>${safe}</body></html>`
}

export function PreviewPane({
  html,
  className,
}: {
  html: string | null
  className?: string
}) {
  if (!html) {
    return (
      <div
        className={cn(
          'flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500',
          className,
        )}
      >
        <p className="max-w-xs">
          暂无可视化预览。若生成的是 SQL 或纯 JSX 组件，请在左侧查看代码；表格类 HTML
          将在此渲染。
        </p>
      </div>
    )
  }

  return (
    <iframe
      title="preview"
      sandbox="allow-same-origin"
      className={cn(
        'min-h-[min(52vh,560px)] w-full rounded-lg border border-zinc-800 bg-white',
        className,
      )}
      srcDoc={wrapDoc(html)}
    />
  )
}
