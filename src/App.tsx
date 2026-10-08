import { lazy, Suspense, useEffect, useState } from 'react'
import { useAppData } from './lib/data'
import { useLang } from './lib/i18n'
import { Icon, Loading } from './components/ui'
import type { IconName } from './lib/icons'
import { parseHash } from './lib/route'
import type { Route, ViewId } from './lib/route'

const SummaryView = lazy(() => import('./views/SummaryView'))
const OversightView = lazy(() => import('./views/OversightView'))
const OperatorView = lazy(() => import('./views/OperatorView'))
const HeatView = lazy(() => import('./views/HeatView'))
const VerifyView = lazy(() => import('./views/VerifyView'))
const SitesView = lazy(() => import('./views/SitesView'))
const NetworksView = lazy(() => import('./views/NetworksView'))
const StrategyView = lazy(() => import('./views/StrategyView'))
const DataView = lazy(() => import('./views/DataView'))

const TABS: { id: ViewId; en: string; ar: string; icon: IconName }[] = [
  { id: 'summary', en: 'Summary', ar: 'الملخص', icon: 'home' },
  { id: 'map', en: 'Oversight', ar: 'الإشراف', icon: 'map' },
  { id: 'heat', en: 'Heat', ar: 'الحرارة', icon: 'weather' },
  { id: 'operator', en: 'Operator', ar: 'المشغل', icon: 'bus' },
  { id: 'sites', en: 'Sites', ar: 'المواقع', icon: 'nodes' },
  { id: 'networks', en: 'Networks', ar: 'الشبكات', icon: 'network' },
  { id: 'strategy', en: 'Strategy', ar: 'الاستراتيجية', icon: 'strategy' },
  { id: 'data', en: 'Data', ar: 'البيانات', icon: 'data' },
]

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#17233a" />
      <path d="M6 22c4-9 9-12 20-13" stroke="#8b9dff" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="1 3.2" />
      <circle cx="7" cy="21.5" r="2.6" fill="#0ca3a3" />
      <circle cx="15.5" cy="13.5" r="3.4" fill="#8b9dff" />
      <circle cx="25" cy="9.3" r="2.2" fill="#eda100" />
    </svg>
  )
}

export default function App() {
  const data = useAppData()
  const { lang, setLang, t } = useLang()
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const loading = <Loading what={t('Loading…', 'جارٍ التحميل…')} />

  return (
    <div className={`app view-${route.view}`}>
      <header className="appbar">
        <a className="brand" href="#/summary" aria-label="DHDE · Madinah Visitor Intelligence">
          <BrandMark />
          <span className="brand-name">
            DHDE<span className="dot">·</span>
            <span className="brand-sub">{t('Madinah Visitor Intelligence', 'ذكاء الزوار في المدينة المنورة')}</span>
          </span>
        </a>

        <nav className="tabs" aria-label={t('Views', 'العروض')}>
          {TABS.map((tab) => (
            <a key={tab.id} href={`#/${tab.id}`} className="tab" aria-current={route.view === tab.id ? 'page' : undefined}>
              <Icon name={tab.icon} />
              <span className="tab-label">{t(tab.en, tab.ar)}</span>
            </a>
          ))}
        </nav>

        <div className="appbar-right">
          {data.telecom?.demo && (
            <span className="fresh-chip stale" title={t('Visitor, time-on-site, flow and spend layers run on demo data until STC data arrives', 'طبقات الزوار والمدة والتنقل والإنفاق تعمل ببيانات تجريبية حتى وصول بيانات STC')}>
              <span className="fresh-dot" aria-hidden="true"></span>
              <span className="fresh-text-long">{t('STC data pending', 'بانتظار بيانات STC')}</span>
            </span>
          )}
          <div className="lang-toggle" role="group" aria-label={t('Language', 'اللغة')}>
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
            <button aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar">
              العربية
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {data.loading ? (
          loading
        ) : data.error ? (
          <div className="state-msg error" role="alert">
            {data.error}
          </div>
        ) : (
          <Suspense fallback={loading}>
            {route.view === 'summary' && <SummaryView data={data} />}
            {route.view === 'map' && <OversightView data={data} selected={route.site} />}
            {route.view === 'heat' && <HeatView data={data} />}
            {route.view === 'operator' && <OperatorView data={data} />}
            {route.view === 'verify' && <VerifyView data={data} payload={route.site} />}
            {route.view === 'sites' && <SitesView data={data} selected={route.site} />}
            {route.view === 'networks' && <NetworksView data={data} selected={route.site} />}
            {route.view === 'strategy' && <StrategyView data={data} />}
            {route.view === 'data' && <DataView data={data} />}
          </Suspense>
        )}
      </main>

      {route.view !== 'map' && route.view !== 'heat' && (
        <footer className="site-foot">
          DHDE · {t('Madinah Visitor Intelligence', 'ذكاء الزوار في المدينة المنورة')} ·{' '}
          {t(
            'University of Fukui and Taibah University, with MRDA. Visitor, flow and spend layers are illustrative until STC data arrives.',
            'جامعة فوكوي وجامعة طيبة، بالتعاون مع هيئة تطوير منطقة المدينة المنورة. طبقات الزوار والتنقل والإنفاق توضيحية حتى وصول بيانات STC.',
          )}
        </footer>
      )}
    </div>
  )
}
