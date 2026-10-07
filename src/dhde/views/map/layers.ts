import type { IconName } from '../../lib/icons'

export type LayerId =
  | 'people'
  | 'density'
  | 'flow'
  | 'traffic'
  | 'transport'
  | 'rail'
  | 'weather'
  | 'survey'
  | 'social'
  | 'reviews'
  | 'sentiment'
  | 'hotels'
  | 'rsi'
  | 'economics'
  | 'nudges'
  | 'coaches'
export type BasemapId = 'hybrid' | 'dark' | 'streets'
export type GroupId = 'actions' | 'movement' | 'conditions' | 'voice' | 'market' | 'economics'

export interface LayerDef {
  id: LayerId
  group: GroupId
  en: string
  ja: string
  icon: IconName
  demo: boolean
  hint_en: string
  hint_ja: string
  /** Hover text for government users: what the layer shows and how to read it. */
  tip_en: string
  tip_ja: string
}

export const GROUPS: { id: GroupId; en: string; ja: string }[] = [
  { id: 'actions', en: 'Actions', ja: 'الإجراءات' },
  { id: 'movement', en: 'Movement', ja: 'الحركة' },
  { id: 'conditions', en: 'Conditions', ja: 'الظروف' },
  { id: 'voice', en: 'Voice of visitor', ja: 'صوت الزائر' },
  { id: 'market', en: 'Market', ja: 'السوق' },
  { id: 'economics', en: 'Economics', ja: 'الاقتصاد' },
]

export const LAYERS: LayerDef[] = [
  { id: 'nudges', group: 'actions', en: 'Action nudges', ja: 'الإجراءات المقترحة', icon: 'flag', demo: true, hint_en: 'Demand, heat-route and hotel alerts on the map', hint_ja: 'تنبيهات الطلب والحرارة والفنادق على الخريطة', tip_en: 'Suggested actions for MRDA and operators: where to act, why, and what to do. The flag colour shows the priority.', tip_ja: 'إجراءات مقترحة للهيئة والمشغلين: أين ولماذا وماذا نفعل. لون العلم يبين الأولوية.' },
  { id: 'people', group: 'movement', en: 'People', ja: 'الزوار', icon: 'people', demo: true, hint_en: 'Visitors on site, actual vs forecast', hint_ja: 'الزوار في الموقع: الفعلي والمتوقع', tip_en: 'How many people are at each site, now and forecast, in the shape of the STC request (telecom device counts). A bigger circle means more people; the colour shows how crowded it is.', tip_ja: 'عدد الأشخاص في كل موقع الآن والمتوقع، بصيغة طلب STC. الدائرة الأكبر تعني عددًا أكبر؛ واللون يبين الازدحام.' },
  { id: 'density', group: 'movement', en: 'Crowd density', ja: 'كثافة الحشود', icon: 'density', demo: true, hint_en: 'Where visitors concentrate', hint_ja: 'أماكن تجمع الزوار', tip_en: 'Shading shows where visitors gather across the city.', tip_ja: 'التظليل يبين أماكن تجمع الزوار في المدينة.' },
  { id: 'flow', group: 'movement', en: 'People flow', ja: 'تدفق الزوار', icon: 'flow', demo: true, hint_en: 'Visitors moving in and out of each site', hint_ja: 'الزوار القادمون والمغادرون لكل موقع', tip_en: 'Moving dots show visitors travelling to (blue) and from (pink) the Haram and each site on the main roads, and arriving from the airport and the Haramain railway.', tip_ja: 'النقاط المتحركة تبين الزوار المتجهين (أزرق) والمغادرين (وردي) بين الحرم والمواقع، والقادمين من المطار وقطار الحرمين.' },
  { id: 'traffic', group: 'movement', en: 'Traffic flow', ja: 'حركة المرور', icon: 'traffic', demo: true, hint_en: 'Road congestion and reroutes', hint_ja: 'ازدحام الطرق والمسارات البديلة', tip_en: 'Road colour shows congestion, busiest around prayer times near the Haram. Green lines are suggested detours, such as on Fridays for Jumu’ah.', tip_ja: 'لون الطريق يبين الازدحام، ويشتد حول أوقات الصلاة قرب الحرم. الخطوط الخضراء مسارات بديلة مقترحة، كما في الجمعة.' },
  { id: 'coaches', group: 'movement', en: 'Tour coaches (operators)', ja: 'حافلات الرحلات (المشغلون)', icon: 'bus', demo: true, hint_en: 'Booked coaches from hotels, the airport and the station to the sites', hint_ja: 'الحافلات المحجوزة من الفنادق والمطار والمحطة إلى المواقع', tip_en: 'Every coach booked through the operator console, moving on real roads from its hotel, the airport or the Haramain station to its sites and back, timed to arrive at its slot. Colour follows the site cluster.', tip_ja: 'كل حافلة محجوزة عبر لوحة المشغل، تتحرك على الطرق الفعلية من فندقها أو المطار أو محطة الحرمين إلى المواقع ثم تعود، في موعد فترتها. اللون حسب مجموعة الموقع.' },
  { id: 'transport', group: 'movement', en: 'City buses', ja: 'حافلات المدينة', icon: 'bus', demo: false, hint_en: 'Madinah Bus and shuttle lines, stops, moving buses', hint_ja: 'خطوط حافلات المدينة والترددية والمحطات', tip_en: 'Madinah Bus, Haram shuttle and sightseeing lines with their stops; buses move on the published timetable or headway. Stops appear as you zoom in.', tip_ja: 'خطوط حافلات المدينة والنقل الترددي والجولات السياحية ومحطاتها؛ وتتحرك الحافلات حسب الجدول أو التواتر المنشور.' },
  { id: 'rail', group: 'movement', en: 'Haramain railway', ja: 'قطار الحرمين', icon: 'train', demo: false, hint_en: 'Haramain High Speed Railway and Madinah station', hint_ja: 'قطار الحرمين السريع ومحطة المدينة', tip_en: 'The Haramain High Speed Railway into Madinah station (OpenStreetMap). Trains run on the published Madinah timetable where available.', tip_ja: 'قطار الحرمين السريع حتى محطة المدينة (OpenStreetMap). تسير القطارات حسب جدول المدينة المنشور حيثما توفر.' },
  { id: 'weather', group: 'conditions', en: 'Weather and heat', ja: 'الطقس والحرارة', icon: 'weather', demo: false, hint_en: 'Temperature, feels-like and heat alerts', hint_ja: 'الحرارة والتنبيهات', tip_en: 'Real hourly forecast (Open-Meteo). Heat alerts fire at 40 °C or more for the open-air sites.', tip_ja: 'توقعات حقيقية بالساعة (Open-Meteo). تنبيهات الحرارة عند ٤٠° فأكثر للمواقع المكشوفة.' },
  { id: 'survey', group: 'voice', en: 'Survey', ja: 'الاستبيان', icon: 'survey', demo: true, hint_en: 'Satisfaction, recommendation, reasons, origin', hint_ja: 'الرضا والتوصية والأسباب والمنشأ', tip_en: 'Visitor survey results (proposed QR survey at the Wi-Fi zones): satisfaction, recommendation, why they came and where they are from.', tip_ja: 'نتائج استبيان الزوار (استبيان QR مقترح في مناطق الواي فاي): الرضا والتوصية وسبب الزيارة والمنشأ.' },
  { id: 'social', group: 'voice', en: 'Social media', ja: 'وسائل التواصل', icon: 'social', demo: true, hint_en: 'Posts about each site', hint_ja: 'منشورات عن كل موقع', tip_en: 'Posts and comments naming each site (Instagram, X, TikTok, YouTube), counted with language and sentiment. Demo until the Apify collection runs.', tip_ja: 'منشورات وتعليقات تذكر كل موقع (إنستغرام، إكس، تيك توك، يوتيوب) مع اللغة والانطباع. تجريبي حتى يعمل جمع Apify.' },
  { id: 'reviews', group: 'voice', en: 'Reviews', ja: 'التقييمات', icon: 'star', demo: true, hint_en: 'Rating, count, 30-day change', hint_ja: 'التقييم والعدد والتغير خلال ٣٠ يومًا', tip_en: 'Google review rating for each site and how it changed in the last 30 days. Demo until the Google reviews collection runs.', tip_ja: 'تقييم Google لكل موقع وتغيره خلال ٣٠ يومًا. تجريبي حتى يعمل جمع التقييمات.' },
  { id: 'sentiment', group: 'voice', en: 'Sentiment', ja: 'الانطباع', icon: 'sentiment', demo: true, hint_en: 'How positive posts about each site are', hint_ja: 'مدى إيجابية المنشورات', tip_en: 'Where people write positively (blue) or negatively (red).', tip_ja: 'أين يكتب الناس بإيجابية (أزرق) أو سلبية (أحمر).' },
  { id: 'hotels', group: 'market', en: 'Hotels', ja: 'الفنادق', icon: 'bed', demo: true, hint_en: 'How full hotels are, rooms left', hint_ja: 'إشغال الفنادق والغرف المتاحة', tip_en: 'How full hotels are on the selected night and how many rooms are left, by district.', tip_ja: 'نسبة إشغال الفنادق في الليلة المختارة والغرف المتبقية، حسب الحي.' },
  { id: 'rsi', group: 'market', en: 'Search intent', ja: 'اهتمام البحث', icon: 'search', demo: true, hint_en: 'How often each site is looked up', hint_ja: 'عدد مرات البحث عن كل موقع', tip_en: 'How often people look up each site (maps and search). A rise usually means more visitors soon.', tip_ja: 'عدد مرات البحث عن كل موقع. الارتفاع يعني عادة زوارًا أكثر قريبًا.' },
]

/** Layers drawn as cards on towns rather than on sites: only one at a time (MapView's toggle). */
export const TOWN_LAYERS: LayerId[] = ['hotels', 'rsi']

/** Tooltip for a "Partly estimated or demo" badge that covers several layers. */
export const OVERVIEW_NOTE = [
  'Some layers use real data (weather, roads, railway, prayer times); visitor, flow and voice layers are demo until STC and collection data arrive.',
  'بعض الطبقات حقيقية (الطقس والطرق والقطار وأوقات الصلاة)؛ وطبقات الزوار والتدفق والآراء تجريبية حتى وصول بيانات STC.',
] as const

export const DEFAULT_LAYERS: LayerId[] = ['nudges', 'people', 'flow', 'coaches', 'rail']

/** The viewer's last layer choice, or null on a first visit. */
export function readStoredLayers(): LayerId[] | null {
  try {
    const raw = window.localStorage.getItem('dhde-madinah.layers')
    if (raw === null) return null
    const valid = new Set(LAYERS.map((l) => l.id))
    return raw.split(',').filter((x): x is LayerId => valid.has(x as LayerId))
  } catch {
    return null
  }
}

/** Whether the layer panel was left open; it starts collapsed. */
export function readPanelOpen(): boolean {
  try {
    return window.localStorage.getItem('dhde-madinah.layersPanel') === 'open'
  } catch {
    return false
  }
}

export function storePanelOpen(open: boolean) {
  try {
    window.localStorage.setItem('dhde-madinah.layersPanel', open ? 'open' : 'closed')
  } catch {
    /* storage blocked: the panel still toggles for this visit */
  }
}

export function storeLayers(layers: Iterable<LayerId>) {
  try {
    window.localStorage.setItem('dhde-madinah.layers', [...layers].join(','))
  } catch {
    /* storage blocked: the choice still holds for this visit */
  }
}

export const BASEMAPS: { id: BasemapId; en: string; ja: string }[] = [
  { id: 'hybrid', en: 'Hybrid', ja: 'هجين' },
  { id: 'dark', en: 'Dark', ja: 'داكن' },
  { id: 'streets', en: 'Streets', ja: 'شوارع' },
]

/**
 * ?layers=people,flow&base=dark&t=2026-10-02T14&panel=nudges (and the older ?layer=economics) make
 * shareable views. `t` is a JST date and hour (`tAt`), since the timeline moves with the clock; an
 * older link's plain hour index (`t=38`) still works but points at a different date each day.
 */
export function readUrlState(): { layers: LayerId[] | null; base: BasemapId | null; t: number | null; tAt: string | null; panel: 'board' | 'nudges' | null } {
  const p = new URLSearchParams(window.location.search)
  const valid = new Set(LAYERS.map((l) => l.id))
  let layers: LayerId[] | null = null
  const raw = p.get('layers')
  if (raw !== null) layers = raw.split(',').filter((x): x is LayerId => valid.has(x as LayerId))
  if (p.get('layer') === 'economics') layers = [...(layers ?? DEFAULT_LAYERS), 'economics']
  const b = p.get('base')
  const base = b === 'hybrid' || b === 'dark' || b === 'streets' ? b : null
  const t = p.get('t')
  const pn = p.get('panel')
  const tAt = t !== null && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(t) ? t : null
  return { layers, base, t: t !== null && !tAt && !isNaN(Number(t)) ? Number(t) : null, tAt, panel: pn === 'nudges' || pn === 'board' ? pn : null }
}
