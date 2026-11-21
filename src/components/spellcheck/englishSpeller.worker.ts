/// <reference lib="webworker" />
// Checks English spelling for SpellCheck.tsx, in the background so typing
// stays smooth. Runs in the page on the user's PC: no text is sent anywhere.
//
// Dictionary: the open-source English (US) Hunspell dictionary (package
// dictionary-en, MIT and BSD), read by nspell (MIT).
import nspell from 'nspell'
import affUrl from '../../../node_modules/dictionary-en/index.aff?url'
import dicUrl from '../../../node_modules/dictionary-en/index.dic?url'
import type { SpellMatch } from './englishSpeller'

const MAX_SUGGESTIONS = 5
/** Words of this company that are not in a general dictionary. */
const COMPANY_WORDS = ['Ahlia', 'Alahlia']

let speller: Promise<ReturnType<typeof nspell>> | null = null
const suggestions = new Map<string, string[]>()

function load() {
  if (!speller) {
    speller = Promise.all([fetch(affUrl).then(r => r.text()), fetch(dicUrl).then(r => r.text())]).then(([aff, dic]) => {
      const s = nspell(aff, dic)
      for (const w of COMPANY_WORDS) s.add(w)
      return s
    })
    speller.catch(() => { speller = null })     // try again on the next check
  }
  return speller
}

/**
 * How likely `word` is what was meant when `typed` was typed: the cost of the
 * typing slips between them, cheapest first. A doubled letter too many or too
 * few (bussiness, occured), a swapped pair (recieved), one vowel for another
 * (approvel), a missing letter (revew, atached), an extra letter, any other
 * wrong letter. Used to put the likeliest suggestion first: the dictionary's
 * own order put "renew" before "review" for "revew".
 */
function slipCost(typed: string, word: string): number {
  const a = typed.toLowerCase()
  const b = word.toLowerCase()
  const vowel = (c: string) => 'aeiou'.includes(c)
  const d = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) d[i][0] = i * 0.9
  for (let j = 1; j <= b.length; j++) d[0][j] = j * 0.8
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const extra = i > 1 && a[i - 1] === a[i - 2] ? 0.5 : 0.9
      const missing = j > 1 && b[j - 1] === b[j - 2] ? 0.5 : 0.8
      const wrong = a[i - 1] === b[j - 1] ? 0 : vowel(a[i - 1]) && vowel(b[j - 1]) ? 0.6 : 1
      d[i][j] = Math.min(d[i - 1][j] + extra, d[i][j - 1] + missing, d[i - 1][j - 1] + wrong)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 0.7)
    }
  }
  return d[a.length][b.length]
}

/** The dictionary's suggestions, likeliest first (ties keep the dictionary's order). */
function rank(typed: string, list: string[]): string[] {
  return list
    .filter(x => !/\s/.test(x))
    .map((x, i) => ({ x, cost: slipCost(typed, x), i }))
    .sort((p, q) => p.cost - q.cost || p.i - q.i)
    .map(p => p.x)
}

// Like Outlook's defaults: words in capitals (GM, PDF), words with numbers
// (3rd, A1) and internet or file addresses are not checked.
const CHUNK = /\S+/g
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g
const ADDRESS = /@|:\/\/|^www\.|[\\/]|\.(?:com|net|org|kw|gov|edu)\b/i

function check(s: ReturnType<typeof nspell>, text: string): SpellMatch[] {
  const out: SpellMatch[] = []
  for (const chunk of text.matchAll(CHUNK)) {
    const c = chunk[0]
    if (ADDRESS.test(c)) continue
    for (const w of c.matchAll(WORD)) {
      const word = w[0]
      const at = w.index ?? 0
      if (word.length < 2 || word === word.toUpperCase()) continue
      if (/\d/.test(c[at - 1] ?? '') || /\d/.test(c[at + word.length] ?? '')) continue
      const plain = word.replace(/’/g, "'")
      if (s.correct(plain)) continue
      let list = suggestions.get(plain)
      if (!list) {
        list = rank(plain, s.suggest(plain)).slice(0, MAX_SUGGESTIONS)
        suggestions.set(plain, list)
      }
      out.push({ offset: (chunk.index ?? 0) + at, length: word.length, word, suggestions: list, language: 'en-US' })
    }
  }
  return out
}

self.onmessage = async (e: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = e.data
  try {
    const s = await load()
    self.postMessage({ id, matches: check(s, text) })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
