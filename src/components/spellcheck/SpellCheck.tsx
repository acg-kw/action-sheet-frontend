import {
  Children, cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { checkEnglish, type SpellMatch } from './englishSpeller'
import './spellcheck.css'

/**
 * English spell check for one text field of an action sheet, quiet like
 * Outlook: a soft wavy line under misspelled words once you have moved past
 * them; suggestions when you rest the mouse on such a word, or click it.
 *
 * Wrap one field: <SpellCheck value={text}><textarea … /></SpellCheck>.
 * Nothing changes in the field itself or the layout around it: an invisible
 * copy of the text is laid exactly over the field and draws only the lines.
 * The words are checked in the page, on the user's PC (englishSpeller.ts):
 * no text is sent anywhere. Arabic text is left alone.
 */

const IGNORE_KEY = 'actionsheet.spell.ignore'
const CHECK_DELAY = 450
/** How long the mouse rests on an underlined word before its card opens. */
const HOVER_DELAY = 350
/** How long the card stays after the mouse leaves the word or the card (time to reach the card). */
const HOVER_GRACE = 500

function loadIgnored(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')) } catch { return new Set() }
}

/** Matches found for an older text, moved to where they are in the new one (or dropped if edited). */
function follow(matches: SpellMatch[], from: string, to: string): SpellMatch[] {
  if (from === to) return matches
  let start = 0
  while (start < from.length && start < to.length && from[start] === to[start]) start++
  let end = 0
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++
  const delta = to.length - from.length
  const out: SpellMatch[] = []
  for (const m of matches) {
    const mEnd = m.offset + m.length
    if (mEnd < start) out.push(m)
    else if (m.offset >= from.length - end) out.push({ ...m, offset: m.offset + delta })
  }
  return out.filter(m => to.substr(m.offset, m.length) === m.word)
}

// The field's text layout, copied to the overlay so the copy lines up exactly.
const COPIED = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight', 'letterSpacing',
  'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction', 'tabSize', 'boxSizing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
] as const

export default function SpellCheck({ value, children }: { value: string; children: ReactElement }) {
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [found, setFound] = useState<{ text: string; matches: SpellMatch[] }>({ text: '', matches: [] })
  const [ignored, setIgnored] = useState<Set<string>>(loadIgnored)
  const [caret, setCaret] = useState<number | null>(null)
  const [typing, setTyping] = useState(false)
  // `hover`: opened by resting the mouse on the word; it closes when the mouse leaves.
  const [open, setOpen] = useState<{ match: SpellMatch; rect: DOMRect; hover: boolean } | null>(null)
  const [hot, setHot] = useState<number | null>(null)          // underlined word under the mouse
  const [active, setActive] = useState(0)
  const [flash, setFlash] = useState<{ offset: number; length: number; key: number } | null>(null)

  // ── The field ────────────────────────────────────────────────────────────
  // The overlay sits right after the field (see render): the field is the
  // element just before it, whatever component draws it.
  useLayoutEffect(() => {
    const prev = anchorRef.current?.previousElementSibling as HTMLElement | null
    const field = prev && (prev.matches('textarea, input') ? prev : prev.querySelector('textarea, input'))
    fieldRef.current = field as HTMLTextAreaElement | HTMLInputElement | null
    // Our lines replace the browser's own, so they are not drawn twice.
    field?.setAttribute('spellcheck', 'false')
  })

  // ── Layout: keep the overlay exactly over the field ──────────────────────
  const place = useCallback(() => {
    const el = fieldRef.current
    const ov = overlayRef.current
    if (!el || !ov) return
    const cs = getComputedStyle(el)
    for (const p of COPIED) (ov.style as any)[p] = cs[p]
    const isInput = el.tagName === 'INPUT'
    ov.style.whiteSpace = isInput ? 'pre' : 'pre-wrap'
    ov.style.overflowWrap = isInput ? 'normal' : 'break-word'
    ov.style.borderStyle = 'solid'
    ov.style.borderColor = 'transparent'
    ov.dir = el.dir || 'auto'
    // Same box as the field, wherever both are placed
    const cb = ov.offsetParent as HTMLElement | null
    if (cb && el.offsetParent === cb) {
      ov.style.top = `${el.offsetTop}px`
      ov.style.left = `${el.offsetLeft}px`
    } else {
      const r = el.getBoundingClientRect()
      const c = (cb || document.body).getBoundingClientRect()
      ov.style.top = `${r.top - c.top + (cb?.scrollTop || 0) - (cb?.clientTop || 0)}px`
      ov.style.left = `${r.left - c.left + (cb?.scrollLeft || 0) - (cb?.clientLeft || 0)}px`
    }
    ov.style.width = `${el.offsetWidth}px`
    ov.style.height = `${el.offsetHeight}px`
    // A scrollbar in the field narrows its text: narrow the copy the same way.
    const bl = parseFloat(cs.borderLeftWidth) || 0
    const br = parseFloat(cs.borderRightWidth) || 0
    const bar = Math.max(0, el.offsetWidth - el.clientWidth - bl - br)
    if (bar) {
      const side = cs.direction === 'rtl' ? 'paddingLeft' : 'paddingRight'
      ov.style[side] = `${(parseFloat(cs[side]) || 0) + bar}px`
    }
    // A one-line field centres its text: so does the copy.
    if (isInput) {
      ov.style.lineHeight = `${el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)}px`
    }
    ov.scrollTop = el.scrollTop
    ov.scrollLeft = el.scrollLeft
  }, [])

  useLayoutEffect(place)

  // ── The field's events ───────────────────────────────────────────────────
  // Registered once; each calls the latest code through this ref. Replacing
  // listeners on every render would make the browser skip the one that opens
  // the card whenever a render happens between two listeners of one click.
  const on = useRef<{
    click: () => void; menu: (e: Event) => void; key: (e: KeyboardEvent) => void
    move: (e: MouseEvent) => void; leave: () => void
  }>({
    click: () => {}, menu: () => {}, key: () => {}, move: () => {}, leave: () => {},
  })
  const typingTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const sync = () => {
      if (overlayRef.current) {
        overlayRef.current.scrollTop = el.scrollTop
        overlayRef.current.scrollLeft = el.scrollLeft
      }
    }
    const caretNow = () => setCaret(document.activeElement === el && el.selectionStart === el.selectionEnd ? el.selectionStart : null)
    // While typing, the word under the caret is not underlined yet (like Outlook).
    // Deferred: a state change inside this listener would make React redraw the
    // field with its old value before the page's own onChange has stored the
    // new character, and that character would be lost.
    const typed = () => {
      clearTimeout(typingTimer.current)
      setTimeout(() => setTyping(true), 0)
      typingTimer.current = setTimeout(() => setTyping(false), 1500)
    }
    const click = () => { caretNow(); on.current.click() }
    const menu = (e: Event) => on.current.menu(e)
    const key = (e: Event) => on.current.key(e as KeyboardEvent)
    const move = (e: Event) => on.current.move(e as MouseEvent)
    const leave = () => on.current.leave()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    el.addEventListener('scroll', sync)
    el.addEventListener('transitionend', place)        // the Subject line changes its font size
    el.addEventListener('input', typed)
    el.addEventListener('keyup', caretNow)
    el.addEventListener('click', click)
    el.addEventListener('contextmenu', menu)
    el.addEventListener('keydown', key)
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    el.addEventListener('focus', caretNow)
    el.addEventListener('blur', caretNow)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      clearTimeout(typingTimer.current)
      el.removeEventListener('scroll', sync)
      el.removeEventListener('transitionend', place)
      el.removeEventListener('input', typed)
      el.removeEventListener('keyup', caretNow)
      el.removeEventListener('click', click)
      el.removeEventListener('contextmenu', menu)
      el.removeEventListener('keydown', key)
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseleave', leave)
      el.removeEventListener('focus', caretNow)
      el.removeEventListener('blur', caretNow)
      window.removeEventListener('resize', place)
    }
  }, [place])

  // ── Checking ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!value.trim()) { setFound({ text: value, matches: [] }); return }
    let current = true
    const t = setTimeout(() => {
      checkEnglish(value)
        .then(matches => { if (current) setFound({ text: value, matches }) })
        .catch(() => { /* checker not available: the field simply has no lines */ })
    }, CHECK_DELAY)
    return () => { clearTimeout(t); current = false }
  }, [value])

  // What is underlined now: the last results, moved along with the typing,
  // without ignored words and, while typing, without the word being typed.
  const shown = useMemo(() => {
    return follow(found.matches, found.text, value)
      .filter(m => !ignored.has(m.word.toLowerCase()))
      .filter(m => !typing || caret === null || caret !== m.offset + m.length)
  }, [found, value, ignored, caret, typing])

  // ── Suggestions card ─────────────────────────────────────────────────────
  const openAt = useCallback((pos: number) => {
    const i = shown.findIndex(m => pos >= m.offset && pos <= m.offset + m.length)
    if (i < 0) return false
    const span = overlayRef.current?.querySelector(`[data-i="${i}"]`) as HTMLElement | null
    if (!span) return false
    setActive(0)
    setOpen({ match: shown[i], rect: span.getBoundingClientRect(), hover: false })
    return true
  }, [shown])

  on.current.click = () => {
    const el = fieldRef.current
    if (!el || el.selectionStart !== el.selectionEnd) return
    clearTimeout(hoverTimer.current)
    if (!openAt(el.selectionStart ?? -1)) setOpen(null)
  }

  // ── Hover: rest the mouse on an underlined word and its card opens ───────
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => { clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current) }, [])

  /** The underlined word under the mouse, and the line of it the mouse is on. */
  const wordAtPoint = (x: number, y: number): { i: number; rect: DOMRect } | null => {
    const spans = overlayRef.current?.querySelectorAll<HTMLElement>('[data-i]') || []
    for (const span of spans) {
      for (const r of span.getClientRects()) {        // a word can wrap over two lines
        if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 3) {
          return { i: Number(span.dataset.i), rect: r }
        }
      }
    }
    return null
  }
  // Whether the mouse is on the card. Checked when the close timer fires: the
  // browser can report "left the field" after "entered the card", so a timer
  // started by the field must never close the card the mouse is on.
  const overCard = useRef(false)
  useEffect(() => { if (!open) overCard.current = false }, [open])
  const closeSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!overCard.current) setOpen(o => (o?.hover ? null : o))
    }, HOVER_GRACE)
  }

  on.current.move = (e: MouseEvent) => {
    const at = e.buttons === 0 ? wordAtPoint(e.clientX, e.clientY) : null   // not while selecting text
    const i = at?.i ?? null
    if (i !== hot) {
      setHot(i)
      clearTimeout(hoverTimer.current)
      if (i !== null && !typing && !(open && open.match === shown[i])) {
        const rect = at!.rect
        hoverTimer.current = setTimeout(() => {
          clearTimeout(closeTimer.current)
          setActive(0)
          setOpen(o => (o && !o.hover ? o : { match: shown[i], rect, hover: true }))   // a clicked card stays
        }, HOVER_DELAY)
      }
    }
    if (i === null && open?.hover) closeSoon()
    else if (i !== null && open?.match === shown[i]) clearTimeout(closeTimer.current)
  }
  on.current.leave = () => {
    setHot(null)
    clearTimeout(hoverTimer.current)
    if (open?.hover) closeSoon()
  }
  on.current.menu = (e: Event) => {
    const el = fieldRef.current
    if (el && el.selectionStart === el.selectionEnd && openAt(el.selectionStart ?? -1)) e.preventDefault()
  }

  // Typing, scrolling the page or clicking elsewhere closes the card.
  useEffect(() => { setOpen(null) }, [value])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || e.target === fieldRef.current) return
      setOpen(null)
    }
    const away = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(null) }
    document.addEventListener('mousedown', outside)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
    }
  }, [open])

  const ignore = (word: string) => {
    const next = new Set(ignored)
    next.add(word.toLowerCase())
    setIgnored(next)
    try { localStorage.setItem(IGNORE_KEY, JSON.stringify([...next])) } catch { /* private window */ }
    setOpen(null)
  }

  /** Puts the chosen word in place (Ctrl+Z still works) with its little flight and glow. */
  const apply = (m: SpellMatch, word: string, from: HTMLElement | null) => {
    const el = fieldRef.current
    if (!el) return
    const startRect = from?.getBoundingClientRect()
    el.focus()
    el.setSelectionRange(m.offset, m.offset + m.length)
    if (!document.execCommand('insertText', false, word)) {
      // Older engines: set the value the way React notices
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value.slice(0, m.offset) + word + value.slice(m.offset + m.length))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    el.setSelectionRange(m.offset + word.length, m.offset + word.length)
    setOpen(null)
    setFlash({ offset: m.offset, length: word.length, key: Date.now() })
    if (startRect) fly(word, startRect)
  }

  // The chosen word flies from the card into the text, then dissolves.
  const fly = (word: string, from: DOMRect) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = overlayRef.current?.querySelector('.sc-flash') as HTMLElement | null
      if (!target) return
      const to = target.getBoundingClientRect()
      const ghost = document.createElement('div')
      ghost.className = 'sc-ghost'
      ghost.textContent = word
      document.body.appendChild(ghost)
      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      ghost.style.left = `${from.left}px`
      ghost.style.top = `${from.top}px`
      ghost.style.width = `${from.width}px`
      ghost.style.height = `${from.height}px`
      const run = ghost.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 18}px) scale(0.95)`, opacity: 0.95, filter: 'blur(0px)', offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0, filter: 'blur(6px)' },
      ], { duration: 620, easing: 'cubic-bezier(.22,.9,.24,1)' })
      run.onfinish = () => ghost.remove()
    }))
  }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [flash])

  // Keyboard on the card while the field keeps focus: arrows, Enter, Escape.
  on.current.key = (e: KeyboardEvent) => {
    if (!open) return
    const n = open.match.suggestions.length
    if (e.key === 'Escape') { e.preventDefault(); setOpen(null) }
    else if (n && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { e.preventDefault(); setActive(a => (a + 1) % n) }
    else if (n && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); setActive(a => (a - 1 + n) % n) }
    else if (n && e.key === 'Enter') {
      e.preventDefault()
      const pill = popRef.current?.querySelector(`[data-s="${active}"]`) as HTMLElement | null
      apply(open.match, open.match.suggestions[active], pill)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const segments = useMemo(() => {
    const parts: (string | ReactElement)[] = []
    let at = 0
    const marks = [
      ...shown.map((m, i) => ({
        start: m.offset, end: m.offset + m.length, i,
        cls: `sc-miss${open?.match === m ? ' sc-open' : hot === i ? ' sc-hot' : ''}`,
      })),
      ...(flash ? [{ start: flash.offset, end: flash.offset + flash.length, cls: 'sc-flash', i: -1 }] : []),
    ].sort((a, b) => a.start - b.start)
    for (const mk of marks) {
      if (mk.start < at) continue
      if (mk.start > at) parts.push(value.slice(at, mk.start))
      parts.push(
        <span key={mk.i >= 0 ? `m${mk.i}-${mk.start}` : `f${flash?.key}`} className={mk.cls} data-i={mk.i >= 0 ? mk.i : undefined}>
          {value.slice(mk.start, mk.end)}
        </span>,
      )
      at = mk.end
    }
    parts.push(value.slice(at) + '​')
    return parts
  }, [value, shown, flash, open, hot])

  const child = Children.only(children)
  if (!isValidElement(child)) return child

  const card = open && (() => {
    const W = 300
    const below = open.rect.bottom + 10
    const up = below + 190 > window.innerHeight
    const left = Math.min(Math.max(12, open.rect.left + open.rect.width / 2 - W / 2), window.innerWidth - W - 12)
    return (
      <motion.div
        ref={popRef}
        key={`${open.match.offset}-${open.match.word}`}
        className="sc-card"
        role="dialog"
        aria-label="Spelling suggestions"
        style={{ left, width: W, ...(up ? { bottom: window.innerHeight - open.rect.top + 10 } : { top: below }) }}
        initial={{ opacity: 0, y: up ? 10 : -10, scale: 0.94, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: up ? 6 : -6, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.16 } }}
        transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }}
        onMouseDown={e => e.preventDefault()}          // keep the caret in the field
        onMouseEnter={() => { overCard.current = true; clearTimeout(closeTimer.current) }}
        onMouseLeave={() => { overCard.current = false; if (open.hover) closeSoon() }}
      >
        <div className="sc-card-glow" aria-hidden />
        <div className="sc-card-head">
          <span className="sc-chip">Spelling</span>
          <span className="sc-word">{open.match.word}</span>
        </div>
        {open.match.suggestions.length > 0 ? (
          <motion.div className="sc-list" role="listbox"
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } } }}>
            {open.match.suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                role="option"
                aria-selected={i === active}
                data-s={i}
                className={`sc-pill${i === 0 ? ' sc-best' : ''}${i === active ? ' sc-active' : ''}`}
                variants={{ hidden: { opacity: 0, y: 8, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                whileHover={{ y: -2, scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onMouseEnter={() => setActive(i)}
                onClick={e => apply(open.match, s, e.currentTarget)}
              >
                {s}
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <div className="sc-none">No suggestions</div>
        )}
        <div className="sc-foot">
          <button type="button" className="sc-ignore" onClick={() => ignore(open.match.word)}>
            Ignore
          </button>
          <span className="sc-hint">↵ to choose · Esc to close</span>
        </div>
      </motion.div>
    )
  })()

  return (
    <>
      {cloneElement(child as ReactElement<any>)}
      <span ref={anchorRef} hidden />
      <div ref={overlayRef} className="sc-overlay" aria-hidden>{segments}</div>
      {createPortal(<AnimatePresence>{card}</AnimatePresence>, document.body)}
    </>
  )
}
