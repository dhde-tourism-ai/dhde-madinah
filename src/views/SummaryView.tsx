import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtCompact, fmtNum, fmtPct } from '../lib/format'
import { clusterOf } from '../lib/sites'
import { Card, DemoBadge, Icon, Kpi, Prov } from '../components/ui'
import type { IconName } from '../lib/icons'

export default function SummaryView({ data }: { data: AppData }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const sites = data.sites!.sites
  const historic = sites.filter((s) => s.id !== 'haram')
  const historicVisitors = historic.reduce((a, s) => a + (tel.sites[s.id]?.daily_devices[0] ?? 0), 0)
  const haram = tel.sites.haram.daily_devices[0]
  const haramOnly = tel.segments.find((s) => s.id === 'haram-only')?.share ?? 0
  const tr = data.transport

  const views: { href: string; icon: IconName; en: string; ar: string; den: string; dar: string }[] = [
    { href: '#/map', icon: 'map', en: 'Map', ar: 'الخريطة', den: 'Sites, visitors by hour, trips, buses, Haramain rail, car parks, walking reach, traffic', dar: 'المواقع والزوار بالساعة والرحلات والحافلات وقطار الحرمين والمواقف ونطاق المشي والحركة' },
    { href: '#/sites', icon: 'nodes', en: 'Sites', ar: 'المواقع', den: 'For each site: visitors around the prayers, time on site, who visits, spend, what is nearby', dar: 'لكل موقع: الزوار حول الصلوات، مدة البقاء، من يزور، الإنفاق، وما حوله' },
    { href: '#/networks', icon: 'network', en: 'Networks', ar: 'الشبكات', den: 'How visitors link sites; the visitor–place graph and visitor types', dar: 'كيف يربط الزوار المواقع؛ مخطط الزائر–المكان وأنواع الزوار' },
    { href: '#/strategy', icon: 'strategy', en: 'Strategy', ar: 'الاستراتيجية', den: 'Keeping visitors longer: levers, what-if values, measures of success', dar: 'إبقاء الزوار مدة أطول: الروافع والقيم المتوقعة ومقاييس النجاح' },
    { href: '#/data', icon: 'data', en: 'Data', ar: 'البيانات', den: 'Every source, its status, and what STC data replaces', dar: 'كل مصدر وحالته وما ستحل محله بيانات STC' },
  ]

  return (
    <div className="page">
      <header className="page-head hero">
        <div>
          <div className="eyebrow">{t('Madinah visitor-flow pilot · MRDA, STC, Taibah University, University of Fukui', 'مشروع تدفق الزوار في المدينة · الهيئة وSTC وجامعة طيبة وجامعة فوكوي')}</div>
          <h1 className="display page-title big">{t('Where visitors go in Madinah, how long they stay, and how to keep them longer', 'أين يذهب الزوار في المدينة، وكم يبقون، وكيف نبقيهم أطول')}</h1>
          <p className="page-lede">
            {t(
              'Open data for sites, transport and walking reach is real today. Visitor, time-on-site, flow and spend layers run on demo data in the exact shape of the STC request, so the dashboard is ready the day the data arrives.',
              'بيانات المواقع والنقل ونطاق المشي حقيقية اليوم. أما طبقات الزوار ومدة البقاء والتنقل والإنفاق فتعمل ببيانات تجريبية بنفس صيغة طلب STC، لتكون اللوحة جاهزة يوم وصول البيانات.',
            )}
          </p>
        </div>
        <DemoBadge />
      </header>

      <div className="kpi-row">
        <Kpi label={t('Historic sites tracked', 'المواقع التاريخية المتابعة')} prov="real" value={fmtNum(historic.length, lang)} sub={t('plus the central area', 'إضافة إلى المنطقة المركزية')} />
        <Kpi label={t('Visitors a day, central area', 'زوار يوميًا، المنطقة المركزية')} prov="illustrative" value={fmtCompact(haram, lang)} />
        <Kpi label={t('Visitors a day, historic sites', 'زوار يوميًا، المواقع التاريخية')} prov="illustrative" value={fmtCompact(historicVisitors, lang)} sub={`${fmtPct(historicVisitors / haram, lang)} ${t('of the central area', 'من المنطقة المركزية')}`} />
        <Kpi label={t('Never leave the Haram area', 'لا يغادرون منطقة الحرم')} prov="illustrative" value={fmtPct(haramOnly, lang)} />
        <Kpi
          label={t('Bus routes · stops · car parks', 'خطوط · محطات · مواقف')}
          prov={tr ? 'real' : 'pending'}
          value={tr ? `${fmtNum(tr.bus_routes.length, lang)} · ${fmtNum(tr.bus_stops.length, lang)} · ${fmtNum(tr.parking.length, lang)}` : '–'}
          sub="OpenStreetMap"
        />
      </div>

      <div className="grid-2">
        <Card title={t('What this dashboard is for', 'الغرض من اللوحة')} className="span-2">
          <div className="questions">
            {[
              ['How many visitors reach each historic site, and when?', 'كم زائرًا يصل لكل موقع تاريخي، ومتى؟', 'Opening hours, staffing, investment', 'ساعات العمل والتشغيل والاستثمار'],
              ['How long do they stay, and what cuts visits short?', 'كم يبقون، وما الذي يقصّر الزيارة؟', 'Shade, seating, water, facilities', 'الظل والمقاعد والماء والمرافق'],
              ['Where do they come from, and where do they go next?', 'من أين يأتون، وإلى أين يذهبون؟', 'Bus routes, shuttles, circuits', 'خطوط الحافلات والترددية والجولات'],
              ['Which visitor groups leave Madinah early?', 'أي المجموعات تغادر المدينة مبكرًا؟', 'Offers and information to extend stays', 'عروض ومعلومات لإطالة الإقامة'],
            ].map(([q, qa, d, da]) => (
              <div key={q} className="question">
                <p className="q">{t(q, qa)}</p>
                <p className="muted small">
                  {t('Informs', 'يدعم')}: {t(d, da)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('Views', 'العروض')} className="span-2">
          <div className="view-cards">
            {views.map((v) => (
              <a key={v.href} href={v.href} className="view-card">
                <Icon name={v.icon} size={20} />
                <span className="view-card-title">{t(v.en, v.ar)}</span>
                <span className="muted small">{t(v.den, v.dar)}</span>
              </a>
            ))}
          </div>
        </Card>

        <Card title={t('Historic sites', 'المواقع التاريخية')} sub={t('Visitors a day and time on site', 'الزوار يوميًا ومدة البقاء')} prov="illustrative" className="span-2">
          <div className="scards">
            {historic.map((s) => {
              const ts = tel.sites[s.id]
              return (
                <a key={s.id} className="scard" href={`#/sites/${s.id}`}>
                  {s.photo ? <img src={s.photo.url} alt="" loading="lazy" /> : <div className="scard-ph" style={{ background: clusterOf(s).colour }}></div>}
                  <span className="scard-body">
                    <span className="scard-name">{t(s.name, s.name_ar)}</span>
                    <span className="muted small tnum">
                      {fmtCompact(ts?.daily_devices[0], lang)} {t('a day', 'يوميًا')} · {ts?.dwell.median_min} {t('min', 'د')}
                    </span>
                    {s.pilot_phase && <span className="pilot-tag">{t('Pilot', 'تجريبي')}</span>}
                  </span>
                </a>
              )
            })}
          </div>
          <p className="muted small">
            <Prov kind="real" /> {t('Site list and descriptions: MRDA list, DHDE Madinah prototype.', 'قائمة المواقع ووصفها: قائمة الهيئة ونموذج DHDE للمدينة.')}
          </p>
        </Card>
      </div>
    </div>
  )
}
