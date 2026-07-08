// Converts the List a Sale form's free-text date/time display strings (e.g.
// "Sat, Jul 11", "9am–2pm") into real ISO date/time values Postgres can
// store. The form's fields stay plain text inputs — only the publish step
// needs parseable values — so this throws a clear, user-facing error instead
// of silently guessing when the input doesn't match the expected shape.

const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// The inverse of parseDisplayDate — an ISO "YYYY-MM-DD" (as stored/returned
// by Postgres) back into the form's plain-text display shape ("Sat, Jul 11")
// so the Edit Listing screen can prefill its date fields from a fetched row.
export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_ABBR[date.getDay()]}, ${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
}

export function parseDisplayDate(display: string): string {
  const match = display.match(/([A-Za-z]{3,})\s+(\d{1,2})/);
  const monthKey = match?.[1]?.slice(0, 3).toLowerCase();
  const month = monthKey ? MONTH_ABBR[monthKey] : undefined;
  const day = match ? parseInt(match[2], 10) : NaN;

  if (month === undefined || Number.isNaN(day)) {
    throw new Error(`Couldn't understand the date "${display}" — try a format like "Sat, Jul 11".`);
  }

  const today = new Date();
  let year = today.getFullYear();
  let candidate = new Date(year, month, day);
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    year += 1;
    candidate = new Date(year, month, day);
  }

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSingleTime(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    throw new Error(`Couldn't understand the time "${raw}" — try a format like "9am" or "2:30pm".`);
  }

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function parseDisplayTimeRange(display: string): { startTime: string; endTime: string } {
  const parts = display.split(/[–-]/).map((part) => part.trim());
  if (parts.length !== 2) {
    throw new Error(`Couldn't understand the time range "${display}" — try a format like "9am–2pm".`);
  }
  return { startTime: parseSingleTime(parts[0]), endTime: parseSingleTime(parts[1]) };
}

// Converts a Postgres "HH:MM:SS" time value back into the app's short
// display format ("9am", "2:30pm"), matching formatSaleSchedule's input shape.
export function formatTimeOfDay(pgTime: string): string {
  const [hourStr, minuteStr] = pgTime.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const meridiem = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return minute === 0 ? `${hour}${meridiem}` : `${hour}:${String(minute).padStart(2, '0')}${meridiem}`;
}
