import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { decodeTicket, ITINERARIES, ORIGIN_ICON } from '../lib/operator'
import { Card, Icon } from '../components/ui'

/** What a site steward sees after scanning a booking QR: the booking, decoded from the link itself. */
export default function VerifyView({ data, payload }: { data: AppData; payload: string | null }) {
  const { t } = useLang()
  const tk = payload ? decodeTicket(payload) : null
  const sites = data.sites?.sites ?? []
  const label = (v: string) => {
    const it = ITINERARIES.find((x) => x.value === v)
    if (it) return t(it.en, it.ar)
    const s = sites.find((x) => x.id === v.replace('site:', ''))
    return s ? t(s.name, s.name_ar) : v
  }
  const origin = data.sites?.origins.find((o) => o.id === tk?.f)
  const riyadhToday = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)

  return (
    <div className="page verify-page">
      <Card>
        {!tk ? (
          <div className="verify bad">
            <Icon name="alert" size={28} />
            <h1 className="display">{t('Booking code not recognised', 'رمز الحجز غير معروف')}</h1>
            <p className="muted">{t('Scan the QR on the operator’s confirmation again.', 'امسح رمز QR في تأكيد المشغل مرة أخرى.')}</p>
          </div>
        ) : (
          <div className={`verify ${tk.d === riyadhToday ? 'ok' : 'warn'}`}>
            <div className="eyebrow">{tk.d === riyadhToday ? t('Valid today', 'صالح اليوم') : tk.d < riyadhToday ? t('Date has passed', 'انتهى التاريخ') : t('Booked for a later date', 'محجوز لتاريخ لاحق')}</div>
            <h1 className="display mono">{tk.c}</h1>
            <dl className="verify-list">
              <dt>{t('Operator', 'المشغل')}</dt>
              <dd>{tk.o}</dd>
              <dt>{t('Site or itinerary', 'الموقع أو المسار')}</dt>
              <dd>{label(tk.v)}</dd>
              <dt>{t('Date and slot', 'التاريخ والفترة')}</dt>
              <dd>
                {tk.d} · {tk.s}
              </dd>
              <dt>{t('Group', 'المجموعة')}</dt>
              <dd>
                {tk.n} {t('visitors', 'زائر')} · {tk.k} {t('coach(es)', 'حافلة')} · {tk.g ? t('with guide', 'مع مرشد') : t('no guide', 'بدون مرشد')}
              </dd>
              <dt>{t('From', 'من')}</dt>
              <dd>{origin ? `${ORIGIN_ICON[origin.id] ?? ''} ${t(origin.label, origin.label_ar)}` : tk.f}</dd>
            </dl>
            <p className="muted small">{t('Demo booking check: the details travel inside the QR link; no server is involved.', 'تحقق تجريبي: التفاصيل داخل رابط الرمز؛ دون خادم.')}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
