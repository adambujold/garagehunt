import { MockSale } from '@/components/garagehunt/sale-card';

function parseDateOnly(dateStr: string, endOfDay = false): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// A multi-day sale matches a date filter if its date range overlaps the
// window at all, not just if it starts on the window's first day.
function saleOverlapsRange(sale: Pick<MockSale, 'startDate' | 'endDate'>, rangeStart: Date, rangeEnd: Date): boolean {
  const saleStart = parseDateOnly(sale.startDate);
  const saleEnd = parseDateOnly(sale.endDate, true);
  return saleStart <= rangeEnd && saleEnd >= rangeStart;
}

export function matchesToday(sale: Pick<MockSale, 'startDate' | 'endDate'>, now: Date = new Date()): boolean {
  const start = startOfDay(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
  return saleOverlapsRange(sale, start, end);
}

// "This weekend" is the upcoming (or currently in progress) Saturday–Sunday,
// computed from `now` rather than hardcoded, so it doesn't quietly go stale
// after the first launch weekend passes.
export function getWeekendRange(now: Date): { start: Date; end: Date } {
  const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
  const daysUntilSaturday = day === 0 ? -1 : 6 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 23, 59, 59, 999);
  return { start, end };
}

export function matchesThisWeekend(sale: Pick<MockSale, 'startDate' | 'endDate'>, now: Date = new Date()): boolean {
  const { start, end } = getWeekendRange(now);
  return saleOverlapsRange(sale, start, end);
}

// Rolling 7-calendar-day window starting today (today through today+6
// inclusive) — not the 7 days *after* today.
export function matchesNext7Days(sale: Pick<MockSale, 'startDate' | 'endDate'>, now: Date = new Date()): boolean {
  const start = startOfDay(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
  return saleOverlapsRange(sale, start, end);
}

export function matchesCategory(sale: Pick<MockSale, 'categories'>, category: string): boolean {
  return sale.categories.includes(category);
}

// Town-wide events aren't built yet — sale_listings.event_id is always null
// today, so this correctly (and expectedly) matches nothing until that
// feature exists.
export function matchesTownWide(sale: Pick<MockSale, 'eventId'>): boolean {
  return sale.eventId != null;
}

// Mirrors the buyer-side "Item Seeker" matching described in feature spec
// Section 4c: once "Other" is selected, matching switches from the fixed
// category list to free text — the seller's other_items tags plus their
// description. An empty query matches everything, so selecting "Other"
// before typing doesn't hide every listing.
export function matchesOtherKeyword(sale: Pick<MockSale, 'description' | 'otherItems'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (sale.description.toLowerCase().includes(needle)) return true;
  return sale.otherItems.some((item) => item.toLowerCase().includes(needle));
}

// Backs the top search bar ("Search categories or items") — broader than
// matchesOtherKeyword since a query here can also match one of the 11 fixed
// category names, not just free text.
export function matchesSearchQuery(
  sale: Pick<MockSale, 'categories' | 'description' | 'otherItems'>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const categoryMatch = sale.categories.some((category) => category.toLowerCase().includes(needle));
  return categoryMatch || matchesOtherKeyword(sale, needle);
}
