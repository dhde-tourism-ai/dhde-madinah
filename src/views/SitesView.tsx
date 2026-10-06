import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AppData } from '../lib/data'
import { hhmmToHours, PRAYERS, prayersFor } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtCompact, fmtDate, fmtNum, fmtPct, fmtSar } from '../lib/format'
import { clusterOf } from '../lib/sites'
import { Card, DemoBadge, Kpi, Prov } from '../components/ui'
import { go } from '../lib/route'

const AXIS = { stroke: '#34425e', tick: { fill: '#7f8ba3', fontSize: 12 } }
const TIP = { contentStyle: { background: '#17233a', border: '1px solid rgba(160,185,230,.2)', borderRadius: 8, color: '#e9eef8' }, labelStyle: { color: '#aeb9cd' } }
const CAT_COLOUR: Record<string, string> = { food: '#d95926', retail: '#9085e9', transport: '#3987e5', services: '#199e70' }

export default function SitesView({ data, selected }: { data: AppData; selected: string | null }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const sites = data.sites!.sites
  const site = sites.find((s) => s.id === selected) ?? sites.find((s) => s.id === 'quba')!
  const ts = tel.sites[site.id]
  const [day, setDay] = useState(0)
  const date = tel.days[day].date
  const prayers = prayersFor(data, date)
  const groupLabel = (id: string) => {
    const g = tel.groups.find((x) => x.id === id)
    return g ? t(g.label, g.label_ar) : id
  }

  const hourly = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ h, v: ts?.hourly[day * 24 + h] ?? 0 })),
    [ts, day],
  )
  const dwell = (ts?.dwell.hist ?? []).map((b, i, arr) => ({
    label: b.upto_min == null ? `${arr[i - 1]?.upto_min ?? 0}+` : `≤${b.upto_min}`,
    share: b.share,
  }))
  const mix = [...(ts?.nationality_mix ?? [])].sort((a, b) => b.share - a.share)
  const spend = tel.spend_categories.map((c) => ({ id: c.id, label: t(c.label, c.label_ar), v: ts?.spend_sar_day[c.id] ?? 0 }))
  const spendTotal = spend.reduce((a, b) => a + b.v, 0)
  const poi = data.pois?.by_site[site.id]
  const c = clusterOf(site)

  return (
    <div className="page sites-page">
      <nav className="site-list" aria-label={t('Sites', 'المواقع')}>
        {sites.map((s) => (
          <a key={s.id} href={`#/sites/${s.id}`} aria-current={s.id === site.id ? 'page' : undefined} className="site-link">
            <span className="sw round" style={{ background: clusterOf(s).colour }}></span>
            <span className="site-link-name">{t(s.name, s.name_ar)}</span>
            <span className="muted tnum">{fmtCompact(tel.sites[s.id]?.daily_devices[day], lang)}</span>
          </a>
        ))}
      </nav>

      <div className="site-main">
        <header className="page-head">
          <div>
            <div className="eyebrow" style={{ color: c.colour }}>
              {t(c.en, c.ar)}
              {site.pilot_phase && ` · ${t('Pilot site', 'موقع تجريبي')}`}
            </div>
            <h1 className="display page-title">{t(site.name, site.name_ar)}</h1>
            <p className="page-lede">{t(site.desc, site.desc_ar)}</p>
          </div>
          <div className="page-head-right">
            <DemoBadge />
            <div className="seg" role="group" aria-label={t('Day', 'اليوم')}>
              {tel.days.map((d, i) => (
                <button key={d.date} aria-pressed={i === day} onClick={() => setDay(i)}>
                  {fmtDate(d.date, lang, { weekday: 'short' })}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => go('map', site.id)}>
              {t('Show on map', 'على الخريطة')}
            </button>
          </div>
        </header>

        <div className="kpi-row">
          <Kpi label={t('Visitors this day', 'زوار هذا اليوم')} prov="illustrative" value={fmtCompact(ts?.daily_devices[day], lang)} sub={t('unique devices, aggregated', 'أجهزة فريدة، مجمعة')} />
          <Kpi
            label={t('Time on site', 'مدة البقاء')}
            prov="illustrative"
            value={`${ts?.dwell.median_min ?? '–'} ${t('min', 'د')}`}
            sub={`${t('middle half', 'النصف الأوسط')} ${ts?.dwell.p25_min}–${ts?.dwell.p75_min} ${t('min', 'د')}`}
          />
          <Kpi label={t('Go on to another site', 'ينتقلون لموقع آخر')} prov="illustrative" value={fmtPct(ts?.second_site_share, lang)} sub={t('the share MRDA wants to grow', 'النسبة المراد زيادتها')} />
          <Kpi label={t('Card spend nearby', 'الإنفاق بالبطاقات قربه')} prov="illustrative" value={fmtSar(spendTotal, lang)} sub={`${fmtSar(spendTotal / Math.max(1, ts?.daily_devices[day] ?? 1), lang)} ${t('per visitor', 'لكل زائر')}`} />
        </div>

        <div className="grid-2">
          <Card title={t('Visitors on site, hour by hour', 'الزوار في الموقع ساعة بساعة')} sub={t('Peaks follow the five prayers; open-air sites dip in the midday heat', 'الذروات تتبع الصلوات الخمس؛ وتنخفض المواقع المكشوفة وقت حر الظهيرة')} prov="illustrative" className="span-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hourly} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2a3f" vertical={false} />
                <XAxis dataKey="h" {...AXIS} tickFormatter={(h) => `${h}:00`} interval={2} reversed={lang === 'ar'} />
                <YAxis {...AXIS} tickFormatter={(v) => fmtCompact(v, lang)} width={48} orientation={lang === 'ar' ? 'right' : 'left'} />
                <Tooltip {...TIP} formatter={(v) => [fmtNum(Number(v), lang), t('on site', 'في الموقع')]} labelFormatter={(h) => `${h}:00`} />
                {prayers &&
                  PRAYERS.map((p) => (
                    <ReferenceLine key={p.id} x={Math.round(hhmmToHours(prayers[p.id]))} stroke="#c98500" strokeDasharray="3 3" label={{ value: t(p.en, p.ar), fill: '#c98500', fontSize: 11, position: 'top' }} />
                  ))}
                <Area isAnimationActive={false} type="monotone" dataKey="v" stroke="#3987e5" fill="#3987e5" fillOpacity={0.25} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t('How long visitors stay', 'كم يبقى الزوار')} sub={t('Share of visits by minutes on site', 'نسبة الزيارات حسب الدقائق في الموقع')} prov="illustrative">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dwell} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2a3f" vertical={false} />
                <XAxis dataKey="label" {...AXIS} reversed={lang === 'ar'} />
                <YAxis {...AXIS} tickFormatter={(v) => fmtPct(v, lang)} width={44} orientation={lang === 'ar' ? 'right' : 'left'} />
                <Tooltip {...TIP} formatter={(v) => [fmtPct(Number(v), lang), t('of visits', 'من الزيارات')]} />
                <Bar isAnimationActive={false} dataKey="share" fill="#199e70" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t('Who visits', 'من يزور')} sub={t('By nationality group', 'حسب مجموعة الجنسية')} prov="illustrative">
            <ul className="bar-list">
              {mix.map((m) => (
                <li key={m.group}>
                  <span className="bar-label">{groupLabel(m.group)}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(m.share / mix[0].share) * 100}%` }}></span>
                  </span>
                  <span className="bar-val tnum">{fmtPct(m.share, lang)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('Card spend around the site', 'الإنفاق بالبطاقات حول الموقع')} sub={t('stc pay and point-of-sale style, per day', 'بصيغة stc pay ونقاط البيع، يوميًا')} prov="illustrative">
            <ul className="bar-list">
              {spend.map((s) => (
                <li key={s.id}>
                  <span className="bar-label">{s.label}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(s.v / Math.max(...spend.map((x) => x.v))) * 100}%`, background: CAT_COLOUR[s.id] }}></span>
                  </span>
                  <span className="bar-val tnum">{fmtSar(s.v, lang)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('Within a 10-minute walk', 'خلال ١٠ دقائق مشيًا')} sub={t('OpenStreetMap features inside the walking reach', 'معالم OpenStreetMap داخل نطاق المشي')} prov={poi ? 'real' : 'pending'}>
            {poi ? (
              <table className="tbl">
                <tbody>
                  {[
                    ['food', 'Restaurants and cafés', 'مطاعم ومقاهٍ'],
                    ['shop', 'Shops', 'متاجر'],
                    ['lodging', 'Hotels', 'فنادق'],
                    ['services', 'Toilets, water, ATMs, pharmacies', 'دورات مياه وماء وصراف وصيدليات'],
                    ['shade', 'Shelters and parks', 'مظلات وحدائق'],
                    ['mosque', 'Mosques', 'مساجد'],
                  ].map(([k, en, ar]) => (
                    <tr key={k}>
                      <td>{t(en, ar)}</td>
                      <td className="tnum num-cell">{fmtNum(poi[k] ?? 0, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{t('Waiting for the open-data build.', 'بانتظار بناء البيانات المفتوحة.')}</p>
            )}
            {poi && (poi.shade ?? 0) < 3 && site.open_air && (
              <p className="callout warn">{t('Few shade points within walking reach of an open-air site: a candidate for shade and rest points.', 'قلة نقاط الظل في نطاق المشي لموقع مكشوف: موقع مرشح لمظلات واستراحات.')}</p>
            )}
          </Card>

          <Card title={t('What the real data will answer here', 'ما ستجيب عنه البيانات الحقيقية هنا')} prov="pending">
            <ul className="plain-list">
              <li>{t('How many visitors reach this site each hour, and from which hotels or districts', 'كم زائرًا يصل كل ساعة، ومن أي فنادق أو أحياء')}</li>
              <li>{t('How long they stay, and whether heat or crowding cuts visits short', 'كم يبقون، وهل يقصّر الحر أو الازدحام الزيارة')}</li>
              <li>{t('Where they go next, and how they travel there', 'إلى أين يذهبون بعدها، وكيف')}</li>
              <li>{t('Which visitor groups leave Madinah early', 'أي مجموعات الزوار تغادر المدينة مبكرًا')}</li>
            </ul>
            <p className="muted small">
              <Prov kind="pending" /> {t('STC aggregates, at least 25 devices per figure.', 'بيانات STC مجمعة، ٢٥ جهازًا على الأقل لكل رقم.')}
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

