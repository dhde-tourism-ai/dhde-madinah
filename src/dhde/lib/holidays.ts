/**
 * Saudi public holidays: Founding Day (22 Feb), National Day (23 Sep) and the Eid
 * breaks. Eid dates follow the Umm al-Qura calendar and are approximate until announced;
 * a date missing here just counts as a normal day.
 */
const HOLIDAYS = new Set([
  // 2026: Founding Day, Eid al-Fitr (~20–23 Mar), Eid al-Adha (~26–29 May), National Day
  '2026-02-22', '2026-03-20', '2026-03-21', '2026-03-22', '2026-03-23',
  '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-09-23',
  // 2027: Founding Day, Eid al-Fitr (~9–12 Mar), Eid al-Adha (~16–19 May), National Day
  '2027-02-22', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12',
  '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19', '2027-09-23',
])

export function isHoliday(iso: string): boolean {
  return HOLIDAYS.has(iso)
}
