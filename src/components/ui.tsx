import type { ReactNode } from 'react'
import { ICON_PATHS } from '../lib/icons'
import type { IconName } from '../lib/icons'
import { useLang } from '../lib/i18n'
import type { Provenance } from '../types/data'

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}

const PROV: Record<Provenance, { en: string; ar: string; tip: string }> = {
  real: { en: 'Real', ar: 'حقيقي', tip: 'Published or open data, with its source' },
  reported: { en: 'Reported', ar: 'مُبلَّغ', tip: 'Stated by MRDA or a partner; not yet independently measured' },
  modelled: { en: 'Modelled', ar: 'نموذج', tip: 'Calculated by a model from other data; see the method note' },
  illustrative: { en: 'Illustrative', ar: 'توضيحي', tip: 'Simulated to show how the real data would be used. Do not quote.' },
  pending: { en: 'Pending', ar: 'قيد الانتظار', tip: 'Data requested; not yet received' },
}

/** Every number on the dashboard carries one of these. */
export function Prov({ kind }: { kind: Provenance }) {
  const { t } = useLang()
  const p = PROV[kind]
  return (
    <span className={`prov prov-${kind}`} title={p.tip}>
      {t(p.en, p.ar)}
    </span>
  )
}

export function DemoBadge() {
  const { t } = useLang()
  return (
    <span className="demo-badge" title={t('Simulated in the shape of the STC request. Not observations; do not quote.', 'بيانات محاكاة بصيغة طلب STC. ليست قياسات؛ لا تُقتبس.')}>
      <Icon name="lab" size={11} />
      {t('Demo data · STC pending', 'بيانات تجريبية · بانتظار STC')}
    </span>
  )
}

export function Card({ title, sub, prov, children, className = '', right }: { title?: ReactNode; sub?: ReactNode; prov?: Provenance; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || prov || right) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          <div className="card-head-right">
            {right}
            {prov && <Prov kind={prov} />}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}

export function Kpi({ label, value, sub, prov }: { label: ReactNode; value: ReactNode; sub?: ReactNode; prov?: Provenance }) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        {label}
        {prov && <Prov kind={prov} />}
      </div>
      <div className="kpi-value display">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="state-msg" role="status">
      <span className="spinner" aria-hidden="true"></span>
      {what}
    </div>
  )
}
