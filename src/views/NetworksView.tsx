import { useMemo, useState } from 'react'
import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtCompact, fmtNum, fmtPct, fmtSar } from '../lib/format'
import { clusterOf } from '../lib/sites'
import { Card, DemoBadge, Prov } from '../components/ui'
import { go } from '../lib/route'

const LABEL_BELOW = new Set(['biography-museum', 'gharas-well', 'quba', 'al-hayy'])
const W = 640
const H = 460

export default function NetworksView({ data, selected }: { data: AppData; selected: string | null }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const sites = data.sites!.sites
  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites])
  const [segment, setSegment] = useState<string>('all')
  const sel = selected && siteById[selected] ? selected : null
  const name = (id: string) => (siteById[id] ? t(siteById[id].name, siteById[id].name_ar) : id)

  // Geographic layout, Jabal Ayr pulled in so the core stays readable
  const pos = useMemo(() => {
    const pts = sites.map((s) => ({ id: s.id, lat: s.id === 'jabal-ayr' ? 24.415 : s.lat, lon: s.lon }))
    const la = pts.map((p) => p.lat)
    const lo = pts.map((p) => p.lon)
    const [la0, la1, lo0, lo1] = [Math.min(...la), Math.max(...la), Math.min(...lo), Math.max(...lo)]
    const pad = 50
    return Object.fromEntries(
      pts.map((p) => [p.id, { x: pad + ((p.lon - lo0) / (lo1 - lo0)) * (W - 2 * pad), y: pad + ((la1 - p.lat) / (la1 - la0)) * (H - 2 * pad) }]),
    ) as Record<string, { x: number; y: number }>
  }, [sites])

  const maxTrips = Math.max(...tel.od.map((o) => o.trips_day))
  const strength = useMemo(() => {
    const m: Record<string, { in: number; out: number }> = {}
    sites.forEach((s) => (m[s.id] = { in: 0, out: 0 }))
    tel.od.forEach((o) => {
      if (m[o.from]) m[o.from].out += o.trips_day
      if (m[o.to]) m[o.to].in += o.trips_day
    })
    return m
  }, [tel, sites])
  const ranked = [...sites].sort((a, b) => strength[b.id].in + strength[b.id].out - (strength[a.id].in + strength[a.id].out))

  const users = tel.users.filter((u) => segment === 'all' || u.segment === segment).slice(0, 24)
  const placesUsed = sites.filter((s) => users.some((u) => u.visits.some((v) => v.site === s.id)))
  const uY = (i: number) => 30 + i * ((H - 60) / Math.max(1, users.length - 1))
  const pY = (i: number) => 30 + i * ((H - 60) / Math.max(1, placesUsed.length - 1))
  const segColour: Record<string, string> = { 'haram-only': '#7f8ba3', 'quba-add': '#3987e5', circuit: '#199e70', explorer: '#c98500' }
  const maxStay = Math.max(...tel.groups.map((g) => g.stay_days), 8)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{t('Visitor networks', 'شبكات الزوار')}</div>
          <h1 className="display page-title">{t('How visitors link the sites, and which visitor types to target', 'كيف يربط الزوار بين المواقع، وأي أنواع الزوار نستهدف')}</h1>
          <p className="page-lede">
            {t(
              'The site network uses aggregate trips, which STC can share directly. The visitor–place graph needs STC-side processing or an opt-in panel; it shows visitor types and repeat routes.',
              'تعتمد شبكة المواقع على رحلات مجمعة يمكن لـ STC مشاركتها مباشرة. أما مخطط الزائر–المكان فيحتاج معالجة داخل STC أو عينة بموافقة المشاركين؛ ويُظهر أنواع الزوار والمسارات المتكررة.',
            )}
          </p>
        </div>
        <DemoBadge />
      </header>

      <div className="grid-2">
        <Card title={t('Site network: trips between sites per day', 'شبكة المواقع: الرحلات اليومية بين المواقع')} sub={t('Line width = trips; circle size = visitors. Click a site to focus.', 'عرض الخط = الرحلات؛ حجم الدائرة = الزوار. اضغط على موقع للتركيز.')} prov="illustrative">
          <svg viewBox={`0 0 ${W} ${H}`} className="net-svg" role="img" aria-label={t('Network of trips between historic sites', 'شبكة الرحلات بين المواقع التاريخية')}>
            {tel.od.map((o) => {
              const a = pos[o.from]
              const b = pos[o.to]
              if (!a || !b) return null
              const hot = !sel || o.from === sel || o.to === sel
              const dx = b.x - a.x
              const dy = b.y - a.y
              const cx = (a.x + b.x) / 2 - dy * 0.12
              const cy = (a.y + b.y) / 2 + dx * 0.12
              return (
                <path
                  key={`${o.from}-${o.to}`}
                  d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`}
                  fill="none"
                  stroke="#d55181"
                  strokeOpacity={hot ? 0.6 : 0.07}
                  strokeWidth={0.8 + 9 * Math.sqrt(o.trips_day / maxTrips)}
                  strokeLinecap="round"
                >
                  <title>{`${name(o.from)} → ${name(o.to)}: ${fmtNum(o.trips_day, lang)}`}</title>
                </path>
              )
            })}
            {sites.map((s) => {
              const p = pos[s.id]
              const v = tel.sites[s.id]?.daily_devices[0] ?? 0
              const r = 5 + 3.2 * Math.log10(Math.max(10, v))
              const dim = sel && sel !== s.id && !tel.od.some((o) => (o.from === sel && o.to === s.id) || (o.to === sel && o.from === s.id))
              return (
                <g key={s.id} className="net-node" opacity={dim ? 0.3 : 1} onClick={() => go('networks', sel === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r={r} fill={clusterOf(s).colour} fillOpacity={0.85} stroke={sel === s.id ? '#fff' : '#0a1120'} strokeWidth={sel === s.id ? 3 : 1.5} />
                  <text x={p.x} y={LABEL_BELOW.has(s.id) ? p.y + r + 14 : p.y - r - 5} textAnchor="middle" className="net-label">
                    {t(s.short, s.short_ar)}
                  </text>
                </g>
              )
            })}
          </svg>
        </Card>

        <Card title={t('Which sites hold the network together', 'المواقع التي تربط الشبكة')} sub={t('Trips in and out per day. Hubs are where a suggestion or shuttle reaches the most visitors.', 'الرحلات الداخلة والخارجة يوميًا. المحاور هي حيث يصل اقتراح أو حافلة لأكبر عدد من الزوار.')} prov="illustrative">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('Site', 'الموقع')}</th>
                <th className="num-cell">{t('Trips in', 'داخلة')}</th>
                <th className="num-cell">{t('Trips out', 'خارجة')}</th>
                <th className="num-cell">{t('Go on', 'يكملون')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s) => (
                <tr key={s.id} className={sel === s.id ? 'is-selected' : ''} onClick={() => go('networks', s.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="sw round" style={{ background: clusterOf(s).colour }}></span> {t(s.name, s.name_ar)}
                  </td>
                  <td className="num-cell tnum">{fmtCompact(strength[s.id].in, lang)}</td>
                  <td className="num-cell tnum">{fmtCompact(strength[s.id].out, lang)}</td>
                  <td className="num-cell tnum">{fmtPct(tel.sites[s.id]?.second_site_share, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title={t('Visitor–place graph: each visitor linked to the places they visit, in order', 'مخطط الزائر–المكان: كل زائر مرتبط بالأماكن التي يزورها بالترتيب')}
          sub={t('A sample of anonymised visitors. Needs STC-side processing or an opt-in panel.', 'عينة من زوار مجهولي الهوية. يحتاج معالجة داخل STC أو عينة بموافقة.')}
          prov="illustrative"
          className="span-2"
          right={
            <div className="seg" role="group" aria-label={t('Visitor type', 'نوع الزائر')}>
              <button aria-pressed={segment === 'all'} onClick={() => setSegment('all')}>
                {t('All', 'الكل')}
              </button>
              {tel.segments.map((s) => (
                <button key={s.id} aria-pressed={segment === s.id} onClick={() => setSegment(s.id)}>
                  {t(s.label, s.label_ar)}
                </button>
              ))}
            </div>
          }
        >
          <div className="bipartite-wrap">
            <svg viewBox={`0 0 ${W + 260} ${H}`} className="net-svg" role="img" aria-label={t('Visitors linked to places', 'زوار مرتبطون بأماكن')}>
              {users.map((u, i) =>
                u.visits.map((v) => {
                  const j = placesUsed.findIndex((p) => p.id === v.site)
                  if (j < 0) return null
                  return (
                    <path
                      key={`${u.id}-${v.site}-${v.order}`}
                      d={`M90,${uY(i)} C${(W + 260) / 2},${uY(i)} ${(W + 260) / 2},${pY(j)} ${W + 30},${pY(j)}`}
                      fill="none"
                      stroke={segColour[u.segment]}
                      strokeOpacity={0.45}
                      strokeWidth={0.8 + v.dwell_min / 40}
                    >
                      <title>{`${u.id} → ${name(v.site)} (#${v.order}), ${v.dwell_min} min, ${v.spend_sar} SAR`}</title>
                    </path>
                  )
                }),
              )}
              {users.map((u, i) => (
                <g key={u.id}>
                  <circle cx={80} cy={uY(i)} r={6} fill={segColour[u.segment]} />
                  <text x={66} y={uY(i) + 4} textAnchor="end" className="net-label small">
                    {u.id} · {fmtNum(u.stay_days, lang, 1)}d
                  </text>
                </g>
              ))}
              {placesUsed.map((p, j) => (
                <g key={p.id}>
                  <rect x={W + 30} y={pY(j) - 11} width={210} height={22} rx={11} fill="#17233a" stroke={clusterOf(p).colour} />
                  <text x={W + 42} y={pY(j) + 4} className="net-label">
                    {t(p.short, p.short_ar)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="legend">
            {tel.segments.map((s) => (
              <span key={s.id} className="legend-item">
                <span className="sw" style={{ background: segColour[s.id] }}></span>
                {t(s.label, s.label_ar)}
              </span>
            ))}
            <span className="legend-item muted">{t('Line width = time on site; label = days in Madinah', 'عرض الخط = مدة البقاء؛ التسمية = أيام الإقامة')}</span>
          </div>
        </Card>

        <Card title={t('Visitor types', 'أنواع الزوار')} sub={t('From the visitor–place graph: who stays where, and what they spend', 'من مخطط الزائر–المكان: من يبقى أين، وكم ينفق')} prov="illustrative">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('Type', 'النوع')}</th>
                <th className="num-cell">{t('Share', 'النسبة')}</th>
                <th className="num-cell">{t('Sites a day', 'مواقع يوميًا')}</th>
                <th className="num-cell">{t('Spend a day', 'إنفاق يومي')}</th>
              </tr>
            </thead>
            <tbody>
              {tel.segments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="sw" style={{ background: segColour[s.id] }}></span> {t(s.label, s.label_ar)}
                  </td>
                  <td className="num-cell tnum">{fmtPct(s.share, lang)}</td>
                  <td className="num-cell tnum">{fmtNum(s.sites_per_day, lang, 1)}</td>
                  <td className="num-cell tnum">{fmtSar(s.spend_sar_day, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="callout">
            {t(
              'Nearly half of visitors never leave the Haram area. Each step up, from Haram-only to a historic circuit, adds sites and spend: this is the group to move.',
              'قرابة نصف الزوار لا يغادرون منطقة الحرم. كل خطوة من "الحرم فقط" إلى جولة تاريخية تضيف مواقع وإنفاقًا: هذه هي الفئة المستهدفة.',
            )}
          </p>
        </Card>

        <Card title={t('Length of stay in Madinah, by nationality group', 'مدة الإقامة في المدينة حسب مجموعة الجنسية')} sub={t('MRDA target: 7 to 8 days', 'هدف الهيئة: ٧ إلى ٨ أيام')} prov="illustrative">
          <ul className="bar-list">
            {[...tel.groups]
              .sort((a, b) => a.stay_days - b.stay_days)
              .map((g) => (
                <li key={g.id}>
                  <span className="bar-label">{t(g.label, g.label_ar)}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(g.stay_days / maxStay) * 100}%`, background: g.stay_days < 3 ? '#e66767' : '#3987e5' }}></span>
                    <span className="bar-target" style={{ insetInlineStart: `${(7 / maxStay) * 100}%` }} title={t('Target 7 days', 'الهدف ٧ أيام')}></span>
                  </span>
                  <span className="bar-val tnum">
                    {fmtNum(g.stay_days, lang, 1)} {t('d', 'ي')}
                  </span>
                </li>
              ))}
          </ul>
          <p className="muted small">
            <Prov kind="pending" /> {t('Real figures: STC "length of stay" request, item 4.', 'الأرقام الحقيقية: طلب STC، البند ٤ "مدة الإقامة".')}
          </p>
        </Card>
      </div>
    </div>
  )
}
