/**
 * Adapter: the ported DHDE map code calls t(english, alternate). In the Madinah app the
 * alternate language is Arabic; the Fukui files still carry Japanese literals in many
 * places, so the alternate is used only when it is actually Arabic text. Everything
 * else falls back to English until it is translated.
 */
import { useLang as useAppLang } from '../../lib/i18n'

/** Kept as 'en' | 'ja' so the ported code compiles unchanged; 'ja' branches never run. */
export type Lang = 'en' | 'ja'

const ARABIC = /[؀-ۿ]/

export interface LangCtx {
  lang: Lang
  /** true when the app is showing Arabic */
  ar: boolean
  setLang: (l: 'en' | 'ar') => void
  t: (en: string, alt?: string | null) => string
}

export function useLang(): LangCtx {
  const { lang, setLang } = useAppLang()
  const ar = lang === 'ar'
  return {
    lang: 'en',
    ar,
    setLang,
    t: (en: string, alt?: string | null) => (ar && alt && ARABIC.test(alt) ? alt : en),
  }
}
