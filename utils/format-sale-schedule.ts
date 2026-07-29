/**
 * Mirrors sale_listings.start_date / end_date / daily_start_time / daily_end_time
 * from garage-sale-app-technical-architecture.md — one shared daily time window
 * applied across every day in the date range. start_date === end_date for a
 * single-day sale, per the feature spec (Section 3, step 3).
 */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export type SaleSchedule = {
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
};

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function formatSaleDateRange(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (startDate === endDate) {
    if (isSameCalendarDay(start, new Date())) {
      return 'Today';
    }
    return `${WEEKDAY_LABELS[start.getDay()]}, ${MONTH_LABELS[start.getMonth()]} ${start.getDate()}`;
  }

  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${WEEKDAY_LABELS[start.getDay()]}–${WEEKDAY_LABELS[end.getDay()]}, ${MONTH_LABELS[start.getMonth()]} ${start.getDate()}–${end.getDate()}`;
  }

  // Include the year when the range crosses one, or the label reads as
  // nonsense: a sale running Jul 19 2026 → Jul 11 2027 rendered as
  // "Sun Jul 19 – Sun Jul 11", which looks like the end date precedes the
  // start. Same-year ranges stay year-less, which is the common case.
  const crossesYear = start.getFullYear() !== end.getFullYear();
  const startLabel = `${WEEKDAY_LABELS[start.getDay()]} ${MONTH_LABELS[start.getMonth()]} ${start.getDate()}${
    crossesYear ? `, ${start.getFullYear()}` : ''
  }`;
  const endLabel = `${WEEKDAY_LABELS[end.getDay()]} ${MONTH_LABELS[end.getMonth()]} ${end.getDate()}${
    crossesYear ? `, ${end.getFullYear()}` : ''
  }`;
  return `${startLabel} – ${endLabel}`;
}

export function formatSaleSchedule(schedule: SaleSchedule): string {
  const dateLabel = formatSaleDateRange(schedule.startDate, schedule.endDate);
  return `${dateLabel} · ${schedule.dailyStartTime}–${schedule.dailyEndTime}`;
}
