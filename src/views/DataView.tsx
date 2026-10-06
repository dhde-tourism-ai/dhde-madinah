import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtDate } from '../lib/format'
import { Card, Prov } from '../components/ui'
import type { Provenance } from '../types/data'

export default function DataView({ data }: { data: AppData }) {
  const { t, lang } = useLang()
  const status = (has: unknown, s: Provenance): Provenance => (has ? s : 'pending')
  const when = (iso?: string) => (iso ? fmtDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '–')

  const rows: { layer: [string, string]; file: string; prov: Provenance; source: string; date?: string; replaces?: [string, string] }[] = [
    { layer: ['Historic sites', 'المواقع التاريخية'], file: 'sites.json', prov: 'real', source: 'MRDA site list; DHDE Madinah prototype; OpenStreetMap coordinates' },
    { layer: ['Bus stops, Haramain rail, stations, car parks', 'محطات الحافلات وقطار الحرمين والمحطات والمواقف'], file: 'transport.json', prov: status(data.transport, 'real'), source: 'OpenStreetMap (Overpass API), ODbL', date: data.transport?.fetched_at },
    { layer: ['Madinah Bus route lines', 'مسارات حافلات المدينة'], file: 'transport.json', prov: data.transport?.bus_routes.length ? 'real' : 'pending', source: 'Not mapped in OpenStreetMap yet', replaces: ['Route files from Madinah Bus or the Transport General Authority (GTFS)', 'ملفات المسارات من حافلات المدينة أو الهيئة العامة للنقل (GTFS)'] },
    { layer: ['Food, shops, hotels, services, shade near sites', 'مطاعم ومتاجر وفنادق وخدمات وظل قرب المواقع'], file: 'pois.json', prov: status(data.pois, 'real'), source: 'OpenStreetMap, ODbL', date: data.pois?.fetched_at },
    { layer: ['Walking reach 5/10/15 min', 'نطاق المشي ٥/١٠/١٥ دقيقة'], file: 'isochrones.json', prov: status(data.isochrones, 'modelled'), source: 'Computed on the OpenStreetMap walking network at 4.5 km/h', date: data.isochrones?.fetched_at },
    { layer: ['Main roads', 'الطرق الرئيسية'], file: 'roads.json', prov: status(data.roads, 'real'), source: 'OpenStreetMap, ODbL', date: data.roads?.fetched_at },
    { layer: ['Prayer times', 'أوقات الصلاة'], file: 'prayer_times.json', prov: status(data.prayers, 'real'), source: 'Umm al-Qura calendar via Aladhan API' },
    { layer: ['Card spending in Madinah (weekly)', 'الإنفاق بالبطاقات في المدينة (أسبوعيًا)'], file: 'spend.json', prov: (data.spend?.status === 'real' || data.spend?.status === 'partial') && data.spend.weeks.length ? 'real' : 'pending', source: 'Saudi Central Bank (SAMA) weekly point-of-sale bulletin, Madinah city; compiled from press reports, some weeks missing', date: data.spend?.fetched_at },
    { layer: ['Published tourism and transport facts', 'حقائق منشورة عن السياحة والنقل'], file: 'context.json', prov: status(data.context?.facts.length, 'real'), source: 'Ministry of Tourism, GASTAT, Transport General Authority and others; one link per fact' },
    { layer: ['Temperature and feels-like', 'الحرارة والحرارة المحسوسة'], file: 'Open-Meteo (live)', prov: 'real', source: 'Open-Meteo forecast API, fetched in the browser' },
    { layer: ['Visitors per site and hour', 'الزوار لكل موقع وساعة'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Simulated', replaces: ['STC: visitor numbers, by type and nationality', 'STC: أعداد الزوار حسب النوع والجنسية'] },
    { layer: ['Time on site', 'مدة البقاء'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Simulated', replaces: ['STC: time on site and walking range', 'STC: مدة البقاء ونطاق المشي'] },
    { layer: ['Trips between sites; visitor–place graph', 'الرحلات بين المواقع؛ مخطط الزائر–المكان'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Simulated', replaces: ['STC: movement, origin and next stop', 'STC: التنقل والمنشأ والوجهة التالية'] },
    { layer: ['Length of stay by nationality', 'مدة الإقامة حسب الجنسية'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Simulated', replaces: ['STC: length of stay', 'STC: مدة الإقامة'] },
    { layer: ['Card spend by site and category', 'الإنفاق حسب الموقع والفئة'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Simulated', replaces: ['stc pay / point-of-sale aggregates', 'بيانات stc pay ونقاط البيع المجمعة'] },
    { layer: ['Traffic on main roads', 'الحركة على الطرق الرئيسية'], file: 'model in app', prov: 'illustrative', source: 'Commute and prayer-time profile on real roads', replaces: ['Road sensors or STC handover counts', 'حساسات الطرق أو بيانات التنقل بين الخلايا'] },
    { layer: ['Wi-Fi zones', 'مناطق الواي فاي'], file: 'telecom_demo.json', prov: 'illustrative', source: 'Proposed locations', replaces: ['Wi-Fi session counts at pilot sites', 'أعداد جلسات الواي فاي في المواقع التجريبية'] },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{t('Data', 'البيانات')}</div>
          <h1 className="display page-title">{t('Every source, its status, and what the STC data replaces', 'كل مصدر وحالته وما ستحل محله بيانات STC')}</h1>
          <p className="page-lede">
            {t(
              'Each number in the dashboard carries a label. Real: published or open data. Modelled: calculated from real data. Illustrative: simulated to show use; never quote. Pending: requested.',
              'كل رقم في اللوحة يحمل تصنيفًا. حقيقي: بيانات منشورة أو مفتوحة. نموذج: محسوب من بيانات حقيقية. توضيحي: محاكاة لعرض الاستخدام؛ لا يُقتبس. قيد الانتظار: مطلوب.',
            )}
          </p>
        </div>
      </header>
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('Layer', 'الطبقة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th>{t('Source', 'المصدر')}</th>
              <th>{t('Updated', 'آخر تحديث')}</th>
              <th>{t('Replaced by', 'تحل محلها')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.layer[0]}>
                <td>
                  <b>{t(r.layer[0], r.layer[1])}</b>
                  <div className="muted small mono">{r.file}</div>
                </td>
                <td>
                  <Prov kind={r.prov} />
                </td>
                <td>{r.source}</td>
                <td className="tnum">{when(r.date)}</td>
                <td>{r.replaces ? t(r.replaces[0], r.replaces[1]) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={t('Safeguards for the STC data', 'ضمانات بيانات STC')}>
        <ul className="plain-list">
          <li>{t('At least 25 devices behind every figure; smaller cells are hidden, as in the demo.', '٢٥ جهازًا على الأقل خلف كل رقم؛ وتُخفى الخلايا الأصغر كما في البيانات التجريبية.')}</li>
          <li>{t('No individual data leaves STC; visitor–place graphs are built inside STC or from an opt-in panel.', 'لا تخرج بيانات فردية من STC؛ وتُبنى مخططات الزائر–المكان داخل STC أو من عينة بموافقة.')}</li>
          <li>{t('Research use only; publication with STC’s approval.', 'للبحث فقط؛ والنشر بموافقة STC.')}</li>
        </ul>
      </Card>
    </div>
  )
}
