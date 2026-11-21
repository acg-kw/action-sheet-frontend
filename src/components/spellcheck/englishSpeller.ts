// The page's side of the English spell checker (englishSpeller.worker.ts).

/** One misspelled word: where it is, and what to write instead. */
export interface SpellMatch {
  offset: number
  length: number
  word: string
  suggestions: string[]
  language: string
}

let worker: Worker | null = null
let next = 0
const waiting = new Map<number, { ok: (m: SpellMatch[]) => void; fail: (e: Error) => void }>()

function start(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./englishSpeller.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<{ id: number; matches?: SpellMatch[]; error?: string }>) => {
    const p = waiting.get(e.data.id)
    if (!p) return
    waiting.delete(e.data.id)
    if (e.data.matches) p.ok(e.data.matches)
    else p.fail(new Error(e.data.error || 'Spell check failed'))
  }
  // If the checker cannot run, the fields simply show no lines.
  w.onerror = () => {
    for (const p of waiting.values()) p.fail(new Error('Spell check is not available'))
    waiting.clear()
    w.terminate()
    worker = null
  }
  worker = w
  return w
}

/** The misspelled English words in the text, in order. */
export function checkEnglish(text: string): Promise<SpellMatch[]> {
  return new Promise((ok, fail) => {
    const id = ++next
    waiting.set(id, { ok, fail })
    try {
      start().postMessage({ id, text })
    } catch (e) {
      waiting.delete(id)
      fail(e as Error)
    }
  })
}
