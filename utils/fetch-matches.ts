import { MockSale } from '@/components/garagehunt/sale-card';
import { Coordinates } from '@/hooks/use-current-location';
import { DbSaleListingRow, LISTING_SELECT, mapRowToSaleView } from '@/utils/sale-listings';
import { supabase } from '@/utils/supabase';

// Read path for the `matches` table — see utils/matches.ts for the write
// path (computeAndInsertMatches) and why the two are split across files.

export type MatchedListing = {
  sale: MockSale;
  matchedAt: string;
  isNew: boolean;
};

// A match counts as "new" for the banner/badge if it landed within the last
// day — there's no separate "last viewed matches" timestamp in the schema
// to compare against, so this fixed window is the simplest honest proxy.
const NEW_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

type DbMatchRow = {
  matched_at: string;
  sale_listings: DbSaleListingRow | null;
};

export async function fetchMatches(savedSearchId: string, origin: Coordinates | null): Promise<MatchedListing[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(`matched_at, sale_listings(${LISTING_SELECT})`)
    .eq('saved_search_id', savedSearchId)
    .order('matched_at', { ascending: false });

  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as unknown as DbMatchRow[])
    .filter((row): row is DbMatchRow & { sale_listings: DbSaleListingRow } => row.sale_listings !== null)
    .map((row) => ({
      sale: mapRowToSaleView(row.sale_listings, origin),
      matchedAt: row.matched_at,
      isNew: now - new Date(row.matched_at).getTime() < NEW_MATCH_WINDOW_MS,
    }));
}
