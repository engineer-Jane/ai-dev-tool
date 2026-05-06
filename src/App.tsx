import { useCallback, useMemo, useState } from 'react'
import { Check, Copy, History, Loader2, Sparkles, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CodeHighlight } from '@/components/CodeHighlight'
import { PreviewPane } from '@/components/PreviewPane'
import {
  extractCodeBlocks,
  htmlForPreview,
  type CodeBlock,
} from '@/lib/parseGenerated'
import {
  appendHistory,
  clearHistory,
  deleteHistoryItem,
  loadHistory,
  type HistoryEntry,
} from '@/lib/history'
import { OUTPUT_OPTIONS, type OutputTarget } from '@/lib/outputTarget'
import { cn } from '@/lib/utils'

type Provider = 'deepseek' | 'openai' | 'qwen'

const EXAMPLES = [
  '帮我生成一个包含姓名和年龄的表格',
  '用表格展示三天的天气预报：日期、气温、天气状况',
  '帮我生成一个登录页面（包含账号登录、手机登录）',
]

function langTabLabel(lang: string): string {
  if (lang === 'jsx') return 'React'
  if (lang === 'vue') return 'Vue'
  if (lang === 'sql') return 'SQL'
  return lang.toUpperCase()
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export default function App() {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Provider>('deepseek')
  const [outputTarget, setOutputTarget] = useState<OutputTarget>('react')
  const [useFunctionCalling, setUseFunctionCalling] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mockNotice, setMockNotice] = useState<string | null>(null)
  const [toolsNotice, setToolsNotice] = useState<string | null>(null)
  const [raw, setRaw] = useState('')
  const [activeLang, setActiveLang] = useState<string>('html')
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [copyState, setCopyState] = useState<'idle' | 'done'>('idle')

  const blocks = useMemo(() => extractCodeBlocks(raw), [raw])

  const previewHtml = useMemo(() => htmlForPreview(blocks), [blocks])

  const activeBlock: CodeBlock | null = useMemo(() => {
    const byTab = blocks.find((b) => b.lang === activeLang)
    if (byTab) return byTab
    return blocks[0] ?? null
  }, [blocks, activeLang])

  const pickActiveLang = useCallback((content: string, target: OutputTarget) => {
    const nextBlocks = extractCodeBlocks(content)
    const langs = [...new Set(nextBlocks.map((b) => b.lang))]
    if (langs.includes('html')) setActiveLang('html')
    else if (target === 'vue' && langs.includes('vue')) setActiveLang('vue')
    else if (langs.includes('jsx')) setActiveLang('jsx')
    else if (langs.includes('sql')) setActiveLang('sql')
    else if (langs[0]) setActiveLang(langs[0])
  }, [])

  async function generate() {
    setError(null)
    setMockNotice(null)
    setToolsNotice(null)
    setLoading(true)
    setRaw('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          prompt: prompt.trim(),
          outputTarget,
          useFunctionCalling,
        }),
      })
      const data = (await res.json()) as {
        content?: string
        error?: string
        detail?: string
        mock?: boolean
        usedTools?: boolean
      }
      if (!res.ok) {
        throw new Error(data.detail ?? data.error ?? `请求失败 (${res.status})`)
      }
      const content = data.content ?? ''
      setRaw(content)
      pickActiveLang(content, outputTarget)
      if (data.mock) {
        setMockNotice(
          '当前为离线演示：未配置所选提供商的 API Key，展示的是内置示例代码。在 .env 填写密钥并重启 npm run dev 后将调用真实模型。',
        )
      }
      if (data.usedTools) {
        setToolsNotice(
          '本次响应经由 Function Calling（emit_code_snippets）结构化生成；也可在下方关闭该选项改为纯文本 fenced 输出。',
        )
      }
      if (content.trim()) {
        setHistory(
          appendHistory({
            prompt: prompt.trim(),
            provider,
            outputTarget,
            raw: content,
            mock: data.mock,
            usedTools: data.usedTools,
          }),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function copyActiveCode() {
    if (!activeBlock?.code) return
    try {
      await navigator.clipboard.writeText(activeBlock.code)
      setCopyState('done')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setError('复制失败：浏览器未授予剪贴板权限')
    }
  }

  function restoreEntry(h: HistoryEntry) {
    setPrompt(h.prompt)
    setProvider(h.provider as Provider)
    setOutputTarget(h.outputTarget)
    setRaw(h.raw)
    pickActiveLang(h.raw, h.outputTarget)
    setError(null)
    setMockNotice(
      h.mock
        ? '本条来自历史记录（当时为离线演示）。'
        : null,
    )
    setToolsNotice(h.usedTools ? '本条历史记录当时使用了 Function Calling。' : null)
  }

  function handleClearHistory() {
    clearHistory()
    setHistory([])
  }

  const tabLangs = [...new Set(blocks.map((b) => b.lang))]

  return (
    <div className="min-h-screen bg-zinc-950 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)] text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:py-14">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Sparkles className="size-3.5" aria-hidden />
              AI 工程化 Demo
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              自然语言 → 代码 → 即时预览
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              支持 React / Vue / SQL 输出偏好、一键复制、localStorage 历史、OpenAI 兼容 Function Calling；MCP
              宿主可拉取{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
                GET /api/mcp/tools
              </code>{' '}
              工具定义。
            </p>
          </div>
        </header>

        <Card className="border-zinc-800/80">
          <CardHeader className="gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
            <div className="min-w-[200px] flex-1">
              <CardTitle>描述你的需求</CardTitle>
              <p className="text-sm text-zinc-500">
                选择输出形态；表格场景将组合 HTML 预览与组件 / SQL（随选项变化）。
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
              <div className="flex w-full min-w-[140px] flex-1 flex-col gap-2">
                <Label htmlFor="provider">模型提供商</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                  className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  <option value="deepseek">DeepSeek（默认）</option>
                  <option value="openai">OpenAI</option>
                  <option value="qwen">通义千问（DashScope）</option>
                </select>
              </div>
              <div className="flex w-full min-w-[160px] flex-1 flex-col gap-2">
                <Label htmlFor="outputTarget">输出语言 / 栈</Label>
                <select
                  id="outputTarget"
                  value={outputTarget}
                  onChange={(e) =>
                    setOutputTarget(e.target.value as OutputTarget)
                  }
                  className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  {OUTPUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} — {o.hint}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={useFunctionCalling}
                onChange={(e) => setUseFunctionCalling(e.target.checked)}
                className="size-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/50"
              />
              <Wrench className="size-4 text-zinc-500" aria-hidden />
              启用 Function Calling（emit_code_snippets，OpenAI 兼容 tools）
            </label>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">自然语言</Label>
              <textarea
                id="prompt"
                rows={3}
                placeholder={EXAMPLES[0]}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[88px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">示例：</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-200"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Button type="button" disabled={loading || !prompt.trim()} onClick={generate}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden />
                    生成代码
                  </>
                )}
              </Button>
              <p className="text-xs text-zinc-500">
                <code className="rounded bg-zinc-800 px-1 py-0.5">POST /api/chat</code>
                {' · '}
                <code className="rounded bg-zinc-800 px-1 py-0.5">GET /api/mcp/tools</code>
              </p>
            </div>
            {toolsNotice ? (
              <p className="rounded-lg border border-sky-500/35 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
                {toolsNotice}
              </p>
            ) : null}
            {mockNotice ? (
              <p className="rounded-lg border border-amber-500/35 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
                {mockNotice}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-800/80">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-zinc-500" aria-hidden />
              历史记录
              <span className="text-xs font-normal text-zinc-500">
                （浏览器 localStorage，最多 40 条）
              </span>
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-red-300"
              disabled={history.length === 0}
              onClick={handleClearHistory}
            >
              <Trash2 className="size-4" aria-hidden />
              清空
            </Button>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">生成成功后会自动保存到此。</p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-200">{h.prompt}</p>
                      <p className="text-xs text-zinc-500">
                        {formatTime(h.createdAt)} · {h.provider} · {h.outputTarget}
                        {h.mock ? ' · 演示' : ''}
                        {h.usedTools ? ' · FC' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => restoreEntry(h)}>
                        恢复
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-zinc-500 hover:text-red-300"
                        onClick={() => setHistory(deleteHistoryItem(h.id))}
                      >
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="min-h-[320px] border-zinc-800/80">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">生成代码</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {tabLangs.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {tabLangs.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setActiveLang(lang)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition',
                          activeLang === lang
                            ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                        )}
                      >
                        {langTabLabel(lang)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-zinc-500">等待生成</span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-zinc-300"
                  disabled={!activeBlock?.code}
                  onClick={copyActiveCode}
                >
                  {copyState === 'done' ? (
                    <>
                      <Check className="size-4 text-emerald-400" aria-hidden />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden />
                      复制当前
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeBlock ? (
                <CodeHighlight code={activeBlock.code} lang={activeBlock.lang} />
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
                  生成结果将显示在此（Prism.js 语法高亮）
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[320px] border-zinc-800/80">
            <CardHeader>
              <CardTitle className="text-base">实时预览</CardTitle>
              <p className="text-xs text-zinc-500">
                iframe 沙箱渲染 HTML；从 Vue SFC 的 &lt;template&gt; 中抽取表格预览。
              </p>
            </CardHeader>
            <CardContent>
              <PreviewPane html={previewHtml} />
            </CardContent>
          </Card>
        </div>

        <footer className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          React + TypeScript + Vite · Tailwind · Function Calling · MCP tools 发现接口
        </footer>
      </div>
    </div>
  )
}
