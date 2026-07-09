# GarageHunt — Technical Architecture & Data Model

*Built to support the screens and flows already designed: Discover map, Route Planner (manual + auto), List a Sale, matching/alerts, seller dashboard, sale detail.*

---

## 1. High-Level Architecture

```
┌─────────────────────┐
│   Mobile App         │  iOS + Android (single codebase)
│   (React Native)     │
└──────────┬───────────┘
           │ HTTPS / REST or GraphQL
┌──────────▼───────────┐
│   API Layer           │  Auth, listings, search, matching, routing orchestration
│   (Node.js / NestJS)   │
└──────────┬───────────┘
           │
   ┌───────┼─────────────┬──────────────┬──────────────┐
   ▼                     ▼              ▼              ▼
┌─────────┐      ┌──────────────┐ ┌──────────┐  ┌───────────────┐
│ Postgres │      │ Object storage│ │ Push     │  │ Maps/Routing  │
│ + PostGIS│      │ (photos)      │ │ (FCM/APNs)│ │ (Mapbox/Google)│
└─────────┘      └──────────────┘ └──────────┘  └───────────────┘
   │
   ▼
┌───────────────────────┐
│ Moderation pipeline     │  Image + text screening (async, on upload)
└───────────────────────┘
```

**Why these choices:**
- **React Native** — one codebase for iOS/Android, matches the "flashy but not custom-native-per-platform" scope of an MVP, and the mockups we built translate directly (flex layouts, chips, cards).
- **PostGIS (Postgres extension)** — the entire app is geospatial-first (radius search, distance sort, route stops). PostGIS gives native `ST_Distance`, `ST_DWithin` queries instead of hand-rolled lat/lng math.
- **Mapbox** (decided) — chosen over Google Maps Platform for this budget-conscious, single-city launch. Mapbox's free tier (50,000 map loads, 100,000 Directions API requests, 50,000 static images per month) comfortably covers a London, Ontario–scale launch at effectively no cost, and its per-request pricing beyond that ($5/1,000, dropping to $3/1,000 above 200,000) stays cheaper than Google's at scale — Google's route optimization specifically lands in its pricier "Advanced" tier. The tradeoff: Mapbox has no hard spending cap (unlike Google's budget-alert feature), so a **server-side throttle is required from day one** — cap the number of stops/radius per route request and rate-limit repeat requests per user. This doubles as basic abuse/scraping protection, consistent with the moderation plan.
- **Map rendering vs. routing, split in practice:** Mapbox's native map-rendering SDK (`@rnmapbox/maps`) requires native code that doesn't run inside Expo Go — using it means switching to a custom development build (EAS Build) before any visual map can be shown at all. To keep moving without that jump, the actual map display uses **`react-native-maps`** (Apple Maps on iOS, free, works natively in Expo Go), while **Mapbox's Directions/Optimization API is still used for route calculation** — that's a plain REST API call, not a native module, so it works fine in Expo Go. Revisit `@rnmapbox/maps` (and the EAS Build step it requires) later if fully custom-branded map styling becomes worth the added build complexity — not needed for MVP.
- **Object storage (S3-compatible)** — photos are the one large binary asset in the app; keep them out of the database, store URLs/keys in Postgres.

---

## 2. Core Data Model

### `users`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email / phone | string | unique |
| display_name | string | |
| home_location | geography(point) | for default map center + radius |
| role_flags | jsonb / enum[] | buyer, seller, organizer (most users: buyer+seller) |
| is_verified_organizer | boolean | gates event creation |
| notification_prefs | jsonb | push toggle, radius, categories |
| seller_avg_rating | numeric | denormalized, recalculated on new review; nullable until first review |
| seller_review_count | int | denormalized count, used alongside avg_rating for display (e.g., "4.8★ · 23 reviews") |
| buyer_checkin_count | int | default 0; denormalized count of the user's `check_ins` rows, incremented via trigger on insert. Sole basis for the buyer tier — no separate points/bonus system. |
| created_at | timestamp | |

**Buyer tier is derived, not stored** — same philosophy as the Hot Listing threshold and sale status: `buyer_checkin_count` maps to a tier at display time via named threshold constants, not a column that needs separate updating. **Launch values:** no badge below 10 check-ins; Regular (10+), Trusted Shopper (100+), Super Shopper (250+) — starting points, not fixed forever; easy to retune post-launch once there's real usage data to look at, same as the Hot Listing threshold.

### `sale_listings`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| seller_id | uuid | FK → users |
| exact_location | geography(point) | never exposed directly to buyer queries pre-reveal |
| fuzzed_location | geography(point) | randomized offset (~100–150m) generated at creation, returned by default |
| address_text | string | full address, same visibility rule as exact_location |
| reveal_at | timestamp | defaults to midnight of start_date; nullable override if seller opts into immediate reveal |
| immediate_reveal_opt_in | boolean | logged per the privacy decision — true means seller explicitly accepted the warning |
| start_date | date | first day of the sale |
| end_date | date | last day of the sale; equals start_date for a single-day sale |
| daily_start_time / daily_end_time | time | shared hours applied to every day in the range (e.g., 9am–2pm each day) |
| status | enum | `draft`, `published`, `cancelled` — only real, explicitly-set states a seller controls. **"Scheduled" / "Live" / "Ended" are not separately stored** — they're derived at display/query time from `start_date`/`end_date` vs. the current date, for any listing with `status = published`. This avoids needing a cron job or scheduled server-side task just to flip a status column on a timer, which isn't worth the added infrastructure at this stage. A practical side benefit: a seller extending `end_date` on an already-"ended" (by date) listing naturally makes it "live" or "scheduled" again automatically, with no special-case logic needed. |
| title | text | nullable; seller-editable headline. If null, display falls back to the existing auto-derived address-based title (e.g., "Maple Street garage sale") — this is additive, not a change to current default behavior. |
| description | text | nullable |
| other_items | text[] | nullable; free-tag entries from the "Other" category input (e.g., "guitar," "vinyl records") — stored as a list, not appended into `description`, so each tag is a discrete match target for the same keyword-matching pipeline used against buyers' `saved_searches.keywords` |
| event_id | uuid | FK → town_wide_events, nullable |
| view_count / favorite_count | int | denormalized counters, updated async |
| checkin_count | int | default 0; denormalized count of `check_ins` rows for this specific listing, incremented via trigger on insert. Distinct from `users.buyer_checkin_count` (a buyer's total across all sales) — this is a seller-facing tally of foot traffic for one specific sale. |
| created_at / updated_at | timestamp | |

**Editing after publish:** sellers can update a listing in `scheduled` or `live` status — photos, categories, description, and `end_date` (extend or shorten the range) are all editable post-publish, since two-day sales commonly need updates between days (e.g., marking items sold, adding new ones). **`exact_location`, `fuzzed_location`, and `address_text` are locked from direct editing once published** — an address correction must go through the same review path as a new listing rather than a silent in-place edit, since silently changing a live listing's location is a safety/trust risk.

### `categories`
Static reference table: id, name, icon. Seeded with the fixed list from the listing form (Furniture, Kids & baby, Tools, Clothing, Electronics, Sporting goods, Books & media, Kitchenware, Antiques, Garden, Other).

### `listing_categories`
Join table: `listing_id`, `category_id` — many-to-many.

### `listing_photos`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| listing_id | uuid | FK |
| storage_key | string | object storage path |
| sort_order | int | |
| moderation_status | enum | pending, approved, rejected |

### `town_wide_events`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organizer_id | uuid | FK → users |
| name | string | |
| boundary | geography(polygon) | drawn area or neighborhood boundary |
| start_at / end_at | timestamp | |
| join_requests_enabled | boolean | organizer can close intake |
| origin | enum | `association` (formal, proactively-applied organizer) or `self_organized` (claimed via a cluster suggestion) — buyers see no visible difference on the event card; this is purely internal, mainly for the moderation/verification distinction below |

**Organizer verification, by origin:** `association` events require the full manual review process (Section 7 of the feature spec). `self_organized` events skip that review — the claiming user is already a phone-verified account with a real, live listing physically inside the cluster, which is a materially lower risk profile than a stranger applying cold.

### `cluster_suggestions`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| center_location | geography(point) | centroid of the detected cluster |
| radius_m | int | e.g., 500–1000m |
| date_from / date_to | date | overlapping window shared by the clustered listings |
| listing_ids | uuid[] | the listings making up the cluster |
| status | enum | suggested, claimed, dismissed, expired |
| claimed_by_user_id | uuid | nullable FK → users |
| created_event_id | uuid | nullable FK → town_wide_events, set once claimed |
| created_at | timestamp | |

Generated by a scheduled job (e.g., runs daily) that scans for listings meeting the clustering threshold (Section 5a, feature spec). Each affected seller receives a push notification referencing this row; whoever claims it first triggers creation of the `town_wide_events` row with `origin = self_organized`, and the other listings in `listing_ids` get a "request to join" prompt against the new event (reusing the existing `event_join_requests` flow).

A lighter version of the same detection (below-threshold, informational only) powers the Profile screen's "neighbors are also planning sales nearby" nudge — same underlying query, just surfaced earlier and without creating a formal suggestion row.

### `event_join_requests`
`id`, `event_id`, `listing_id`, `status` (pending/approved/denied) — supports the "Request to join" step from the listing flow.

### `saved_searches` (the "I'm Looking For" feature)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | FK |
| keywords | text[] | nullable |
| category_ids | uuid[] | nullable |
| center_location | geography(point) | |
| radius_km | int | |
| date_from / date_to | date | nullable = "any date" |
| notify_enabled | boolean | default true |

### `matches`
Generated when a new `sale_listings` row is published: for each active `saved_search` in range, if keyword or category overlap → insert a `matches` row (`saved_search_id`, `listing_id`, `matched_at`, `notified_at`). Powers both the push notification and the "Matches for you" list.

### `favorites`
`user_id`, `listing_id` — simple join table, powers the heart icon, the "X people interested" count on Discover cards and Sale Detail, and the route-planner "manual pick" pool. Listing's `favorite_count` (already in `sale_listings`) is a denormalized count of this table, updated async. **"Hot listing" badge is a three-tier progression**, not a single threshold — derived at display time from `favorite_count` via named constants (same philosophy as sale status and buyer tiers, not stored/duplicated values): 🔥 Hot Listing (11+), 🔥🔥 Blazing Hot (26+), 🔥🔥🔥 Inferno Hot (51+). Launch thresholds — keep as named constants in one place, not scattered magic numbers, so they're easy to tune post-launch. On **My Listings**, a seller's own listing below its *next* tier shows a progress note (e.g., "14 interested · 12 more for 🔥🔥 Blazing Hot") using the same constants, so the UI and the actual trigger values can never drift out of sync.

### `reviews`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| listing_id | uuid | FK → sale_listings — the specific sale being reviewed |
| reviewer_id | uuid | FK → users |
| seller_id | uuid | FK → users, denormalized from the listing for fast seller-level aggregate queries |
| visited | boolean | answer to "did you visit this sale?" — if false, no rating/comment collected, review row still logged for prompt-dismissal tracking but excluded from aggregates |
| rating | int | 1–5 (five-star scale), nullable if `visited = false` |
| comment | text | nullable |
| moderation_status | enum | pending, approved, rejected — reuses the existing moderation pipeline |
| created_at | timestamp | |

**Constraint:** one review per (`listing_id`, `reviewer_id`) pair — prevents pile-ons. `visited` is set true automatically if a `check_ins` row exists for the same (`listing_id`, `reviewer_id`) pair — surfaced in the UI as "Verified visit" rather than a self-report.

**Trigger mechanism:** no scheduled server job or push notification (not built yet — see Section on push notifications being deferred pending an Apple Developer account). Eligibility is checked **when the app opens** (or when Profile/Discover gains focus): query for listings the current user favorited where derived status is "ended" and no `reviews` row exists yet for that pair. On submission, `users.seller_avg_rating` and `seller_review_count` recalculate for the listing's seller via trigger.

### `check_ins`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| listing_id | uuid | FK → sale_listings |
| buyer_id | uuid | FK → users |
| checked_in_at | timestamp | |

**Constraint:** one check-in per (`listing_id`, `buyer_id`) pair. **Eligibility (enforced app-side before insert):** the listing's derived status must be `live`, and the buyer's current device location must be within ~150m of the listing's real (unfuzzed) coordinates — verified via a single one-time GPS read, not background tracking. On insert, `users.buyer_checkin_count` increments by 1 via trigger.

### `buyer_ratings`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| listing_id | uuid | FK → sale_listings |
| seller_id | uuid | FK → users — always the listing's seller |
| buyer_id | uuid | FK → users — must have a `check_ins` row for this listing (sellers only rate checked-in buyers, not every favoriter) |
| thumbs_up | boolean | lightweight, single-tap — not a 5-star system; a seller isn't reviewing a dozen strangers in depth |
| created_at | timestamp | |

**Constraint:** one rating per (`listing_id`, `buyer_id`) pair. This is a separate, qualitative signal from `buyer_points`/tier — points reward showing up, this rewards being good to deal with. Aggregate similarly to seller ratings if/when buyer profiles need to display it (e.g., a simple thumbs-up percentage).

### `reports`
`id`, `listing_id`, `photo_id`, or `review_id`, `reporter_id`, `reason` (enum: inappropriate, scam, wrong_address, fake_listing, fake_review), `status` (open/reviewed/actioned), `created_at`.

---

## 3. Key Backend Flows

### Address privacy enforcement
This is a query-time concern, not just a storage concern — the API must never let `exact_location`/`address_text` leak into a response before `reveal_at`, regardless of which endpoint is called.
- Server computes `is_revealed = now() >= reveal_at OR immediate_reveal_opt_in = true`.
- If `is_revealed` is false: API returns `fuzzed_location` and a truncated address string (e.g., "Maple Street area") — never the real fields, not even to the listing's own seller-facing edit view unless explicitly requested (avoids accidental leakage through shared screenshots).
- `fuzzed_location` is generated once at creation (consistent per listing, not re-randomized per request) so the map pin doesn't jitter between app opens.

### Route planning (both modes)
1. **Manual pick:** client sends the list of favorited `listing_id`s → API resolves each to a resolved location (respecting reveal rules) → calls Mapbox/Google Optimization API with the stop set → returns ordered stops + total distance/time.
2. **Auto-suggest:** API queries listings within radius + date window, scores each by `distance_weight + category_match_weight` (category match = overlap with the user's `saved_searches` or stated interests), takes the top-N cluster, then feeds that set through the same optimization call as manual mode. The "swap" action re-runs the scoring query excluding already-selected/rejected listings and substitutes the next-best result.

### Matching & notifications
- On listing publish (status → scheduled or live): async job scans `saved_searches` within the listing's radius, inserts `matches` rows for hits, triggers push via FCM/APNs.
- Category matching is exact-set overlap for MVP (Phase 1). Keyword matching against free-text `description` is a Phase 2 addition — needs at least basic text search (Postgres full-text search or a lightweight embedding-based match) rather than naive substring matching, to catch synonyms.

### Moderation pipeline
- Photo upload → async job calls image moderation API → sets `moderation_status`; listing can't move from draft to scheduled/live until all photos are approved (or listing has zero photos).
- Description text → synchronous lightweight profanity/spam check at submit time (fast enough to block submission if it fails); async deeper scam-pattern check can flag for manual review without blocking publish.
- New accounts: first listing published flagged for manual review queue but not blocked — published immediately, pulled down only if review fails, to avoid delaying a time-sensitive listing.

### Monetization
- Free tier: ad SDK (e.g., Google AdMob) integrated at natural break points — between Discover list results, not interstitial popups that block core flows like Route Planner or List a Sale.
- Paid tier: handled via native App Store/Play Store subscription billing (required by platform policy for digital goods) — backend just checks entitlement status via receipt validation, doesn't process payment itself.

---

---

## 5. Authentication & Security

**Decision: use a managed auth provider — do not build authentication in-house.** Password storage, session handling, and breach response carry real risk if implemented from scratch, and this is a solved problem at low cost.

**Recommended provider: Supabase Auth** (Firebase Authentication is a comparable alternative). Supabase is Postgres-native, so auth data lives in the same database as `sale_listings`, `saved_searches`, etc., rather than syncing two separate systems. Both offer free tiers well beyond London-launch scale.

### Login methods
- **Email/password** — provider handles hashing/storage; the app never touches raw passwords.
- **Social login (Google, Apple)** — lower-friction signup. **Apple Sign-In is required by App Store guidelines whenever another third-party social login (e.g., Google) is offered**, so both need to ship together, not just Google alone.
- **Phone/SMS verification** — reused for the organizer application flow (Section on organizer approval, feature spec) and doubles as a contact channel for safety/reporting follow-up.

### Two-factor authentication
- **Off by default for regular buyer/seller accounts** — avoids adding friction to a low-stakes action (browsing, listing) that would hurt signup conversion.
- **Required for organizer accounts**, given their elevated permissions (approving join requests, managing event data, viewing unfuzzed addresses of participants). SMS-based 2FA via the phone number already on file is sufficient at this scale — no authenticator-app requirement needed yet.
- **Optional, user-enabled 2FA available to any account** via settings.

### Baseline security practices
- Session tokens expire and auto-refresh (handled by the auth provider) — no indefinite logins.
- Login attempts are rate-limited to block brute-force attempts (default behavior on most managed providers).
- Password reset via emailed link only — never email a plaintext password.
- `is_verified_organizer` and any future admin/moderator role flags gate access at the API layer, not just the UI — the mobile app hiding a button is not sufficient; the backend must independently reject unauthorized requests to organizer/admin endpoints.

---

## 6. AI-Assisted Listing Content

**Feature:** "✨ Get AI suggestions" on List a Sale/Edit Listing generates a suggested title and description from the seller's already-entered categories, "Other" tags, and one optional free-text prompt. Reference Section 3, step 8 of the feature spec for the exact behavior (seller always reviews/accepts/edits — nothing auto-inserted).

**Architecture:** a **Supabase Edge Function** (serverless, runs on Supabase's infrastructure — no separate backend server to stand up or maintain) receives the seller's input, calls the Anthropic API (Claude) server-side, and returns the suggestion to the app. The Anthropic API key lives only in the Edge Function's environment — **never bundled into the mobile app**, where it could be extracted and stolen. This is the same "serverless, not a dedicated backend" philosophy used throughout the rest of the app.

**Cost:** pay-per-use, not a subscription. A short title + description generation is a small fraction of a cent per call with a fast/cheap model — not meaningfully impactful at London-launch scale, but it is real, ongoing, usage-based cost (unlike the mostly-free-tier services used elsewhere), and it scales with usage rather than being fixed.

**Abuse/cost protection:** regeneration is rate-limited per user (e.g., a handful of requests per hour) — same philosophy already applied to Mapbox route requests, since this is a real metered API call that a bad actor (or just an enthusiastic user mashing "regenerate") could otherwise run up unnecessarily.

---

## 7. Open Technical Decisions

- **Push provider** — FCM covers Android + can also route to iOS; still need APNs certs configured either way for a React Native app.
- **Full-text/keyword matching approach for Phase 2** — plain Postgres `tsvector` search is simplest to ship; an embedding-based similarity search would catch more synonyms but adds real infrastructure (vector DB or pgvector) for a marginal MVP gain — recommend deferring.
- **Fuzzing algorithm specifics** — random offset within an annulus (not a simple bounding box) so the fuzzed point doesn't systematically land in a shape that reveals the true point's boundary.
