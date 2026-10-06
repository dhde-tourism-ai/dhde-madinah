import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtCompact, fmtDate, fmtNum, fmtPct, fmtSar } from '../lib/format'
import { Card, DemoBadge, Kpi, Prov } from '../components/ui'

const AXIS = { stroke: '#34425e', tick: { fill: '#7f8ba3', fontSize: 12 } }
const TIP = { contentStyle: { background: '#17233a', border: '1px solid rgba(160,185,230,.2)', borderRadius: 8, color: '#e9eef8' }, labelStyle: { color: '#aeb9cd' } }

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <b className="tnum">
          {value}
          {unit}
        </b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

export default function StrategyView({ data }: { data: AppData }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const [convert, setConvert] = useState(10) // % of Haram-only visitors who add Quba
  const [shadeMin, setShadeMin] = useState(10) // extra minutes at open-air sites
  const [extraNights, setExtraNights] = useState(0.5) // extra nights per visitor, on average

  const seg = Object.fromEntries(tel.segments.map((s) => [s.id, s]))
  const fact = (id: string) => data.context?.facts.find((f) => f.id === id)
  const num = (id: string) => {
    const v = fact(id)?.value
    return typeof v === 'number' ? v : null
  }
  // Real anchors (Ministry of Tourism via SPA, H1 2025); demo fallbacks only if the facts file is missing
  const visitorsH1 = num('madinah_visitors_h1_2025')
  const annualVisitors = visitorsH1 ? visitorsH1 * 2 : 20_000_000
  const stayNights = num('avg_length_of_stay_madinah') ?? 4
  const spendPerNight = num('madinah_spend_per_night_h1_2025') ?? 200
  const anchorsReal = visitorsH1 != null && fact('avg_length_of_stay_madinah') != null && fact('madinah_spend_per_night_h1_2025') != null
  const openAirIds = data.sites!.sites.filter((s) => s.open_air).map((s) => s.id)
  const openAirVisitors = openAirIds.reduce((a, id) => a + (tel.sites[id]?.daily_devices[0] ?? 0), 0)

  // spend per visitor-hour on site, from the demo sites (excluding the Haram)
  const spendPerHour = useMemo(() => {
    let spend = 0
    let hours = 0
    for (const [id, s] of Object.entries(tel.sites)) {
      if (id === 'haram') continue
      spend += Object.values(s.spend_sar_day).reduce((a, b) => a + b, 0)
      hours += s.daily_devices[0] * (s.dwell.median_min / 60)
    }
    return spend / Math.max(1, hours)
  }, [tel])

  const qubaSpend = (() => {
    const q = tel.sites.quba
    return Object.values(q.spend_sar_day).reduce((x, y) => x + y, 0) / Math.max(1, q.daily_devices[0])
  })()
  // yearly values
  const upliftConvert = annualVisitors * seg['haram-only'].share * (convert / 100) * qubaSpend
  const upliftShade = openAirVisitors * 365 * (shadeMin / 60) * spendPerHour
  const upliftStay = annualVisitors * extraNights * spendPerNight
  const total = upliftConvert + upliftShade + upliftStay

  const facts = data.context?.facts ?? []
  const spend = data.spend
  const weeks = spend?.weeks ?? []

  const levers = [
    {
      en: 'Shade and rest points on walking routes',
      ar: 'مظلات واستراحات على مسارات المشي',
      data: ['Time on site by hour and heat', 'مدة البقاء حسب الساعة والحرارة'],
      measure: ['Longer summer visits at Uhud, Shuhada, wells', 'زيارات أطول صيفًا في أحد والشهداء والآبار'],
    },
    {
      en: 'Park-and-ride and shuttles timed to prayers',
      ar: 'مواقف وحافلات ترددية مرتبطة بأوقات الصلاة',
      data: ['Origin of trips, car-park exits', 'منشأ الرحلات وخروج المواقف'],
      measure: ['Faster exits; more bus use', 'خروج أسرع؛ استخدام أكبر للحافلات'],
    },
    {
      en: 'Free Wi-Fi zones with a welcome page',
      ar: 'مناطق واي فاي مجانية بصفحة ترحيب',
      data: ['Where visitors wait longest', 'أين ينتظر الزوار أطول'],
      measure: ['Zone use, feedback, dwell counts', 'الاستخدام والتقييم وعدادات البقاء'],
    },
    {
      en: 'Quiet-time suggestions between prayers',
      ar: 'اقتراحات أوقات الهدوء بين الصلوات',
      data: ['Visitors per site and hour', 'الزوار لكل موقع وساعة'],
      measure: ['Share reaching a second site', 'نسبة من يصل لموقع ثانٍ'],
    },
    {
      en: 'Signed circuits linking sites',
      ar: 'جولات موسومة تربط المواقع',
      data: ['Site network and next stops', 'شبكة المواقع والوجهة التالية'],
      measure: ['More visits to Quba, Uhud, Khandaq, Qiblatain', 'زيارات أكثر لقباء وأحد والخندق والقبلتين'],
    },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{t('Strategy', 'الاستراتيجية')}</div>
          <h1 className="display page-title">{t('Keep visitors in Madinah longer, and spending at more sites', 'إبقاء الزوار في المدينة مدة أطول، وإنفاقهم في مواقع أكثر')}</h1>
          <p className="page-lede">
            {t(
              'MRDA’s goal: move the average stay from 4–5 days to 7–8, and draw visitors from the Haram to the historic sites. Three levers, and what each could be worth.',
              'هدف الهيئة: رفع متوسط الإقامة من ٤–٥ أيام إلى ٧–٨ أيام، وجذب الزوار من الحرم إلى المواقع التاريخية. ثلاث روافع، وقيمة كل منها.',
            )}
          </p>
        </div>
        <DemoBadge />
      </header>

      <div className="kpi-row">
        <Kpi
          label={t('Average stay today', 'متوسط الإقامة حاليًا')}
          prov={fact('avg_length_of_stay_madinah') ? 'real' : 'reported'}
          value={fact('avg_length_of_stay_madinah') ? `${fmtNum(stayNights, lang)} ${t('nights', 'ليالٍ')}` : t('4–5 days', '٤–٥ أيام')}
          sub={t('Ministry of Tourism via SPA, H1 2025; MRDA cites 4–5 days', 'وزارة السياحة عبر واس، النصف الأول ٢٠٢٥؛ والهيئة تذكر ٤–٥ أيام')}
        />
        <Kpi label={t('Target', 'الهدف')} prov="reported" value={t('7–8 days', '٧–٨ أيام')} sub={t('MRDA Smart City Program', 'برنامج المدينة الذكية')} />
        <Kpi label={t('Visitors to Madinah, H1 2025', 'زوار المدينة، النصف الأول ٢٠٢٥')} prov={visitorsH1 ? 'real' : 'pending'} value={fmtCompact(visitorsH1, lang)} sub={`${fmtSar(spendPerNight, lang)} ${t('spent per night', 'إنفاق لكل ليلة')}`} />
        <Kpi label={t('Never leave the Haram area', 'لا يغادرون منطقة الحرم')} prov="illustrative" value={fmtPct(seg['haram-only'].share, lang)} sub={t('visitor–place graph', 'مخطط الزائر–المكان')} />
        <Kpi label={t('Card spend per hour on site', 'الإنفاق لكل ساعة في الموقع')} prov="illustrative" value={fmtSar(spendPerHour, lang)} sub={t('historic sites, excl. Haram', 'المواقع التاريخية دون الحرم')} />
      </div>

      <div className="grid-2">
        <Card title={t('What-if: value of keeping visitors longer', 'ماذا لو: قيمة إبقاء الزوار مدة أطول')} sub={t('Extra card spend per year from each lever. Built on demo data; the method stays when STC data arrives.', 'إنفاق إضافي سنوي من كل رافعة. مبني على بيانات تجريبية؛ ويبقى الأسلوب عند وصول بيانات STC.')} prov="modelled" className="span-2">
          <div className="scenario">
            <div className="scenario-inputs">
              <Slider label={t('Haram-only visitors who add Quba', 'زوار الحرم فقط الذين يضيفون قباء')} value={convert} min={0} max={30} step={1} unit="%" onChange={setConvert} />
              <Slider label={t('Extra minutes at open-air sites (shade, water, Wi-Fi)', 'دقائق إضافية في المواقع المكشوفة (ظل وماء وواي فاي)')} value={shadeMin} min={0} max={30} step={5} unit={t(' min', ' د')} onChange={setShadeMin} />
              <Slider label={t('Extra nights per visitor, on average', 'ليالٍ إضافية لكل زائر في المتوسط')} value={extraNights} min={0} max={3} step={0.25} unit={t(' nights', ' ليلة')} onChange={setExtraNights} />
            </div>
            <div className="scenario-out">
              {[
                [t('Haram-only → add Quba', 'الحرم فقط ← إضافة قباء'), upliftConvert, '#3987e5'],
                [t('Longer visits at open-air sites', 'زيارات أطول في المواقع المكشوفة'), upliftShade, '#199e70'],
                [t('Longer stays in Madinah', 'إقامة أطول في المدينة'), upliftStay, '#c98500'],
              ].map(([label, v, c]) => (
                <div key={label as string} className="scn-row">
                  <span className="scn-label">{label}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${((v as number) / Math.max(1, total)) * 100}%`, background: c as string }}></span>
                  </span>
                  <span className="tnum scn-val">{fmtSar(v as number, lang)}</span>
                </div>
              ))}
              <div className="scn-total">
                <span>{t('Extra spend a year', 'إنفاق إضافي سنويًا')}</span>
                <span className="display">{fmtSar(total, lang)}</span>
              </div>
              <p className="muted small">
                {t(
                  `Longer stays: ${fmtCompact(annualVisitors, lang)} visitors a year × extra nights × ${fmtSar(spendPerNight, lang)} per night (${anchorsReal ? 'real, Ministry of Tourism H1 2025, doubled' : 'placeholder'}). Quba and open-air levers use demo spend per visitor and per hour on site until STC and stc pay data arrive.`,
                  `الإقامة الأطول: ${fmtCompact(annualVisitors, lang)} زائر سنويًا × الليالي الإضافية × ${fmtSar(spendPerNight, lang)} لكل ليلة (${anchorsReal ? 'حقيقي، وزارة السياحة النصف الأول ٢٠٢٥ مضاعفًا' : 'افتراضي'}). رافعتا قباء والمواقع المكشوفة تستخدمان إنفاقًا تجريبيًا حتى وصول بيانات STC وstc pay.`,
                )}
              </p>
            </div>
          </div>
        </Card>

        <Card title={t('Five levers, each with a measure of success', 'خمس روافع، لكل منها مقياس نجاح')} prov="modelled" className="span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('Lever', 'الرافعة')}</th>
                <th>{t('What the data decides', 'ما تحدده البيانات')}</th>
                <th>{t('Measure of success', 'مقياس النجاح')}</th>
              </tr>
            </thead>
            <tbody>
              {levers.map((l) => (
                <tr key={l.en}>
                  <td>
                    <b>{t(l.en, l.ar)}</b>
                  </td>
                  <td>{t(l.data[0], l.data[1])}</td>
                  <td>{t(l.measure[0], l.measure[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title={t('Card spending in Madinah, week by week', 'الإنفاق بالبطاقات في المدينة أسبوعيًا')}
          sub={t('Saudi Central Bank (SAMA) point-of-sale statistics', 'إحصاءات نقاط البيع، البنك المركزي السعودي')}
          prov={(spend?.status === 'real' || spend?.status === 'partial') && weeks.length ? 'real' : 'pending'}
        >
          {weeks.length > 0 && spend?.status === 'partial' && <p className="muted small">{t('Compiled from press reports of the SAMA weekly bulletin; some weeks missing.', 'مجمّعة من تقارير صحفية عن نشرة ساما الأسبوعية؛ بعض الأسابيع مفقودة.')}</p>}
          {weeks.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weeks} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2a3f" vertical={false} />
                <XAxis dataKey="week_end" {...AXIS} tickFormatter={(d) => fmtDate(d, lang)} minTickGap={24} reversed={lang === 'ar'} />
                <YAxis {...AXIS} tickFormatter={(v) => fmtCompact(v, lang)} width={52} orientation={lang === 'ar' ? 'right' : 'left'} />
                <Tooltip {...TIP} formatter={(v) => [fmtSar(Number(v), lang), t('value', 'القيمة')]} labelFormatter={(d) => fmtDate(String(d), lang, { day: 'numeric', month: 'short', year: 'numeric' })} />
                <Line isAnimationActive={false} type="monotone" dataKey="value_sar" stroke="#fab219" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">{spend?.note ?? t('Not yet collected.', 'لم تُجمع بعد.')}</p>
          )}
        </Card>

        <Card title={t('Published facts', 'حقائق منشورة')} sub={t('With sources', 'مع المصادر')} prov={facts.length ? 'real' : 'pending'}>
          {facts.length ? (
            <ul className="facts">
              {facts.map((f) => (
                <li key={f.id}>
                  <span className="fact-val display">
                    {typeof f.value === 'number' ? fmtCompact(f.value, lang) : f.value}
                    {f.unit ? ` ${f.unit}` : ''}
                  </span>
                  <span className="fact-label">
                    {f.label}
                    {f.period ? ` · ${f.period}` : ''} ·{' '}
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.source_name}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('Collecting published figures.', 'جارٍ جمع الأرقام المنشورة.')}</p>
          )}
          <p className="muted small">
            <Prov kind="real" /> {t('Each figure links to its source.', 'كل رقم مرتبط بمصدره.')}
          </p>
        </Card>
      </div>
    </div>
  )
}
