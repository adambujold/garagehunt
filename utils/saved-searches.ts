import { supabase } from '@/utils/supabase';

// Mirrors saved_searches from
// supabase/migrations/0007_saved_searches_and_matches.sql. The current "I'm
// Looking For" UI only ever manages a single search per user (there's no
// multi-search list/management UI, matching the screen's existing scope
// before this feature) — fetchMySavedSearch returns the most recent one,
// and saving always updates that same row in place rather than
// accumulating duplicates every time someone tweaks their search.

export type SavedSearch = {
  id: string;
  keywords: string[];
  categoryNames: string[];
  radiusKm: number;
  dateFrom: string | null;
  dateTo: string | null;
  notifyEnabled: boolean;
};

type DbSavedSearchRow = {
  id: string;
  keywords: string[] | null;
  category_ids: string[] | null;
  radius_km: number;
  date_from: string | null;
  date_to: string | null;
  notify_enabled: boolean;
};

async function resolveCategoryNames(categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];
  const { data, error } = await supabase.from('categories').select('name').in('id', categoryIds);
  if (error) throw error;
  return (data ?? []).map((row) => row.name);
}

export async function fetchMySavedSearch(userId: string): Promise<SavedSearch | null> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, keywords, category_ids, radius_km, date_from, date_to, notify_enabled')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as DbSavedSearchRow;
  const categoryNames = await resolveCategoryNames(row.category_ids ?? []);

  return {
    id: row.id,
    keywords: row.keywords ?? [],
    categoryNames,
    radiusKm: row.radius_km,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    notifyEnabled: row.notify_enabled,
  };
}

export type SaveSavedSearchInput = {
  // Present => update the existing saved search in place. Absent => insert
  // a new one.
  id?: string;
  userId: string;
  keywords: string[];
  categoryNames: string[];
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  dateFrom: string | null;
  dateTo: string | null;
  notifyEnabled: boolean;
};

export type SavedSearchSaveResult = {
  id: string;
  categoryIds: string[];
};

export async function saveSavedSearch(input: SaveSavedSearchInput): Promise<SavedSearchSaveResult> {
  let categoryIds: string[] = [];
  if (input.categoryNames.length > 0) {
    const { data: categoryRows, error: categoryError } = await supabase
      .from('categories')
      .select('id, name')
      .in('name', input.categoryNames);
    if (categoryError) throw categoryError;
    categoryIds = (categoryRows ?? []).map((row) => row.id);
  }

  const payload = {
    user_id: input.userId,
    keywords: input.keywords,
    category_ids: categoryIds,
    center_latitude: input.centerLatitude,
    center_longitude: input.centerLongitude,
    radius_km: input.radiusKm,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    notify_enabled: input.notifyEnabled,
  };

  if (input.id) {
    const { error } = await supabase.from('saved_searches').update(payload).eq('id', input.id);
    if (error) throw error;
    return { id: input.id, categoryIds };
  }

  const { data, error } = await supabase.from('saved_searches').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, categoryIds };
}
