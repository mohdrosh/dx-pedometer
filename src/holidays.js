/* ============================================================================
   Japanese public holidays.

   This table used to live in App.jsx, where only the browser could see it.
   The browser refreshes it from the web on load, so the copy here is the
   floor rather than the truth — but it has to be a floor the SERVER can
   stand on too, because 佐野's new rule turns on one:

     「締切は毎週月曜の朝9時（月曜が祝日の場合は火曜の9時）」

   A deadline that moves when the Monday is a holiday cannot be decided in
   the browser: the server is what refuses a late request, and a client
   that simply did not fetch the list would be arguing for a different
   Monday. So the table is shared, and the server reads it without a
   network call — a schedule that depends on an outbound fetch at the
   moment somebody presses a button is a schedule that breaks when the
   fetch does.

   Company 休業日 set in 設定 are merged over the top of this by
   closureMap(), so an office can shut on a day the nation works.
   ========================================================================= */

export const PUBLIC_HOLIDAYS = {
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日', '2025-02-24': '休日', '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日', '2025-05-06': '休日', '2025-07-21': '海の日',
  '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日', '2025-11-23': '勤労感謝の日',
  '2025-11-24': '休日',
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-05-06': '休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-03-22': '休日',
  '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日',
};

/** Is this YYYY-MM-DD a public holiday, or a day the company has closed? */
export function isHoliday(iso, extra = null) {
  if (!iso) return false;
  if (extra && extra[iso]) return true;
  return !!PUBLIC_HOLIDAYS[iso];
}
