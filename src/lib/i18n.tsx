import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Lang = 'en' | 'ar'

export interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  /** Pick the string for the active language (falls back to English). */
  t: (en: string, ar?: string | null) => string
}

const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: (en) => en })

export function useLang(): LangCtx {
  return useContext(LangContext)
}

function readStored(): Lang {
  try {
    return window.localStorage.getItem('dhde-madinah.lang') === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem('dhde-madinah.lang', l)
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
  }, [])
  const value = useMemo(() => ({ lang, setLang, t: (en: string, ar?: string | null) => (lang === 'ar' && ar ? ar : en) }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
