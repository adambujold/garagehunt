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
| avatar_url | text | nullable; public URL to the user's uploaded profile photo in the `avatars` Storage bucket. Null = fall back to the existing initials-in-a-circle display, which stays as the default treatment, not something being replaced. |
| has_completed_onboarding | boolean | default false; set true on completing or skipping the first-time feature carousel (Section 2, feature spec). Checked once at app launch/first Discover load — never shown again once true, whether they finished it or skipped it. |
| home_location | geography(point) | for default map center + radius |
| role_flags | jsonb / enum[] | buyer, seller, organizer (most users: buyer+seller) |
| is_verified_organizer | boolean | gates event creation |
| notification_prefs | jsonb | push toggle, radius, categories |
| seller_avg_rating | numeric | denormalized, recalculated on new review; nullable until first review |
| seller_review_count | int | denormalized count, used alongside avg_rating for display (e.g., "4.8★ · 23 reviews") |
| buyer_checkin_count | int | default 0; denormalized count of the user's `check_ins` rows, incremented via trigger on insert. Sole basis for the buyer tier — no separate points/bonus system. |
| terms_accepted_at | timestamp | set at Sign Up when the required agreement checkbox is checked; nullable only for accounts created before this field existed |
| terms_version | text | e.g., "2026-07-11" — a simple date-string identifier for which version of the Terms was live at acceptance time, so there's a real record if the document is later updated. Doesn't need a full versioning system — just enough to answer "what did they actually agree to." |
| created_at | timestamp | |

**Buyer tier is derived, not stored** — same philosophy as the Hot Listing threshold and sale status: `buyer_checkin_count` maps to a tier at display time via named threshold constants, not a column that needs separate updating. **Launch values:** no badge below 10 check-ins; Regular (10+), Trusted Shopper (100+), Super Shopper (250+) — starting points, not fixed forever; easy to retune post-launch once there's real usage data to look at, same as the Hot Listing threshold.

**Avatar storage:** a separate `avatars` Storage bucket (public read, authenticated users can only upload/update/delete their own file — path scoped by their own user ID) — same policy pattern as the existing listing-photos bucket, just a distinct bucket rather than mixing user avatars into listing content.

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
| moderation_status | enum | `clean`, `pending_review`, `rejected` — default `clean`. Set by the Anthropic-based text moderation check at submit time, or forced to `pending_review` regardless of screening result if this is the seller's first-ever listing (account-level trust signal, Section 9 feature spec). A `pending_review` listing still publishes immediately (not blocked, given listings are time-sensitive) — pulled down only if manual review in the Supabase dashboard finds a real problem. |
| payment_method | enum | `cash_only`, `cash_and_etransfer` — default `cash_only`. Deliberately a simple binary, not a broader multi-select — cash is always implicitly available at a garage sale, this just captures whether e-Transfer is also accepted. Displayed as a badge on the listing card and Sale Detail; not currently a Discover filter. |
| day_of_photo_reminder_sent_date | date | nullable. The last calendar date a "snap fresh photos" reminder was sent for this listing — a date, not a boolean, since a multi-day sale should get this reminder once per day it's actually open, not just once for the whole listing. Compared against the scheduled job's current date to decide whether today's reminder has already fired. |
| other_items | text[] | nullable; free-tag entries from the "Other" category input (e.g., "guitar," "vinyl records") — stored as a list, not appended into `description`, so each tag is a discrete match target for the same keyword-matching pipeline used against buyers' `saved_searches.keywords` |
| event_id | uuid | FK → town_wide_events, nullable |
| view_count / favorite_count | int | denormalized counters, updated async |
| checkin_count | int | default 0; denormalized count of `check_ins` rows for this specific listing, incremented via trigger on insert. Distinct from `users.buyer_checkin_count` (a buyer's total across all sales) — this is a seller-facing tally of foot traffic for one specific sale. |
| highest_tier_notified | enum | `none`, `hot`, `blazing`, `inferno` — default `none`. Tracks the highest Hot Listing tier the seller has already been push-notified about, so a favorite count fluctuating around a threshold (someone unfavorites, someone else favorites again) doesn't re-fire the same "just went Hot!" notification repeatedly. A push only fires when the newly-crossed tier is strictly higher than this stored value, and this value only ever increases, never resets downward even if favorite_count later drops. |
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
| photo_type | enum | `planning` (default, taken when the listing was created) or `day_of` (Section 4f, feature spec) — day-of photos are additive, never replacing planning photos, and are featured first in the gallery/thumbnail on any day at least one exists for. |

### `organizer_applications`
*Retroactively documented — built directly during the organizer/events implementation without a docs update at the time.*

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users |
| full_name | text | |
| neighborhood | text | the area they want to organize for |
| affiliation_notes | text | formal affiliation (resident association, BIA) or informal vouching (neighbor names, community group link) |
| status | enum | `pending`, `approved`, `denied` |
| created_at | timestamp | |

**RLS:** a user can insert/select their own application; no client-side path to change `status` — approval happens only via direct edits in the Supabase dashboard, the intended manual-review workflow (Section 7, feature spec).

**Admin email notification (via Resend):** on insert, an email fires to the team's review address, since nothing else would surface a new pending application for review. This is a real dependency addition beyond what was originally planned — worth remembering if the notification target email or Resend account ever needs updating, since it's not something visible anywhere in the app's own UI.

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

**Trigger mechanism:** no scheduled server job — this stays pull-based (checked when the app opens/gains focus) even though push notifications now exist elsewhere in the app (Section 8). Push is being built specifically for Matches, the originally highest-value trigger; extending it to review prompts is a reasonable fast-follow once the core token infrastructure exists, but not required to change today since the pull-based version already works correctly. Eligibility is checked **when the app opens** (or when Profile/Discover gains focus): query for listings the current user favorited where derived status is "ended" and no `reviews` row exists yet for that pair. On submission, `users.seller_avg_rating` and `seller_review_count` recalculate for the listing's seller via trigger.

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
- **Originally implemented as a client-side "best-effort" side effect** (mobile app called `computeAndInsertMatches` after a successful publish) — **corrected during companion website Phase 2d work**, once building the website's saved-searches feature surfaced a real reliability gap: a client-side side effect isn't guaranteed to fire (e.g., app closing/crashing right after publish), and it also meant matches would never compute at all for listings published through the website, since that logic only ever existed in the mobile codebase.
- **Now implemented as a guaranteed backend trigger** — same `pg_net` trigger pattern already used for push notifications (Section 7). Fires on `sale_listings` publish (status → scheduled or live) **regardless of which client did the publishing**, scans `saved_searches` within the listing's radius, inserts `matches` rows for hits. This benefits mobile too, not just the website — a real reliability fix, not merely a website workaround.
- Category matching is exact-set overlap for MVP (Phase 1). Keyword matching against free-text `description` is a Phase 2 addition — needs at least basic text search (Postgres full-text search or a lightweight embedding-based match) rather than naive substring matching, to catch synonyms.
- **Website match notification channel: immediate per-match email**, not a batched/scheduled digest, via Resend (already integrated for admin notifications) — same trigger fires an email in addition to (or instead of, for a web-only user) the mobile push, keeping notification *timing* consistent across platforms even though the *channel* differs. Deliberately not a scheduled/cron-based digest, consistent with this project's "derive at query time over cron jobs" principle.

### Moderation pipeline
- **Reuses the existing Anthropic API integration** (already wired via Supabase Edge Function for AI-assisted listing descriptions) rather than adding a separate image/text moderation vendor — one already-paid-for, already-integrated service handles both.
- **Photo upload:** each photo sent to the Anthropic API (vision) for classification at upload time. Clearly inappropriate content is rejected immediately with a clear error; borderline/uncertain results set `listing_photos.moderation_status = 'pending_review'` rather than auto-rejecting — a listing can't move from draft to scheduled/live until every photo is either approved or has zero photos.
- **Description text:** sent to the Anthropic API with a moderation-classification prompt (a distinct prompt from the AI-suggestion feature, same underlying integration) — synchronous, at submit time, fast enough to block clearly bad content (hate speech, obvious scam scripts) before publish. Borderline content is allowed through but flagged (`sale_listings.moderation_status = 'pending_review'`) rather than blocked — avoid false-positive-blocking a legitimate seller.
- **Review queue: deliberately no custom admin UI.** Same pragmatic choice already made for organizer applications — flagged content and open reports are reviewed directly in the Supabase dashboard's Table Editor (filtered by `moderation_status = 'pending_review'` or `reports.status = 'open'`), not a dedicated in-app screen. Revisit only if review volume genuinely outgrows a filtered table view.
- **New accounts:** a user's first-ever listing is always flagged `pending_review` regardless of what automated screening returns — publishes immediately (not blocked, given listings are time-sensitive) but pulled down if manual review fails. Established accounts with a clean history skip this extra layer after their first listing.

### Monetization
- **Ads:** Google AdMob, integrated at natural break points in the Discover feed only — never interstitial popups, never in core flows like Route Planner, List a Sale, or Edit Listing. Hidden entirely when the signed-in user has an active ad-free entitlement (checked via the RevenueCat SDK client-side, cached locally).
- **Billing:** all real purchases (ad-free subscription, listing boosts) go through **RevenueCat**, which sits on top of native App Store/Play Store billing (required by platform policy for digital goods — no way to route around this with a third-party payment processor). RevenueCat handles cross-platform receipt validation so the app doesn't implement StoreKit and Play Billing separately.
- **Server-side sync:** RevenueCat webhooks call a Supabase Edge Function on purchase/renewal/expiration/cancellation events, updating `users.is_ad_free`/`ad_free_expires_at` (subscription) or `sale_listings.is_boosted`/`boost_expires_at` (one-time boost, tied to a specific listing via purchase metadata). This is necessary because ranking decisions (boost priority in Discover) and the ad-hide decision on any device need to be queryable from the backend, not just checked client-side on the purchasing device.
- **Admin email (Resend):** a separate, small dependency added directly during implementation, not originally planned — used specifically for the organizer application admin-notification email (see `organizer_applications` table). Not used for any user-facing transactional email at this point (password resets, etc. are handled through Supabase Auth's own built-in email, a separate system).
- **Boost ranking constraint:** `is_boosted`/`boost_expires_at` affects **Discover's default browse sort order only**. The "I'm Looking For" matching query (Section 3, Matching & notifications) must never reference these fields — relevance-based ranking there stays untouched by paid placement, by design.

---

## 4. Monetization Data Model

### `users` (additional fields)
| Field | Type | Notes |
|---|---|---|
| is_ad_free | boolean | default false; synced from RevenueCat webhook, not set directly by the client |
| ad_free_expires_at | timestamp | nullable; subscription can lapse — check both the boolean and expiry, don't trust a stale `true` alone |

### `sale_listings` (additional fields)
| Field | Type | Notes |
|---|---|---|
| is_boosted | boolean | default false; synced from RevenueCat webhook |
| boost_expires_at | timestamp | nullable; 48 hours from purchase (see feature spec Section 10). Discover's default sort checks `is_boosted AND boost_expires_at > now()` — an expired boost should stop affecting sort order without needing a cleanup job, same "derive at query time" philosophy used for sale status and Hot Listing tiers |

### RevenueCat product configuration (set up in App Store Connect / Play Console / RevenueCat dashboard, not in app code)
| Product | Type | Price (CAD) | Duration |
|---|---|---|---|
| Ad-free subscription | Auto-renewing subscription | $4.99/month | Ongoing until cancelled |
| Listing boost | Consumable one-time purchase | $2.99 | 48 hours per purchase, tied to one listing |

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

## 7. Push Notifications

**Provider: Expo push notification service** — not raw APNs/FCM directly. The app registers for a single "Expo push token" (via `expo-notifications`) regardless of platform; sending a notification is one call to Expo's push API, which routes to APNs (iOS) or FCM (Android) behind the scenes. Avoids maintaining two separate native notification integrations.

### `push_tokens`
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users |
| expo_push_token | text | |
| device_type | enum | ios, android |
| created_at / updated_at | timestamp | |

**One user can have multiple tokens** (e.g., testing on both iPhone and Android simultaneously, per Adam's actual dev setup) — send to all of a user's active tokens, don't assume one device per account.

**Registration flow:** on login/app open, request notification permission via `expo-notifications`, obtain the Expo push token, upsert into `push_tokens` keyed on (user_id, expo_push_token) — an upsert rather than a plain insert, since re-registering the same device shouldn't create duplicate rows.

**Send flow (Matches, the first trigger built):** originally designed around a Supabase **Database Webhook** on `matches` table insert calling an Edge Function — **actual implementation differs**: the `supabase_functions` schema needed for the Dashboard's native Webhooks feature wasn't provisioned on this project, so a **direct `pg_net` trigger** (migration 0019) calls the Edge Function instead, with error handling ensuring a notification failure can never block the listing publish itself. Functionally equivalent outcome, different mechanism — worth knowing if extending this pattern to new triggers later (e.g., review-prompt or cluster-suggestion push), since the webhook route may still be blocked on the same schema gap.

The Edge Function:
1. Checks the corresponding `saved_searches.notify_enabled` flag — skip if false
2. Looks up the matched user's `push_tokens`
3. Sends the notification via a single HTTPS call to Expo's push API (`https://exp.host/--/api/v2/push/send`) — **the response body must actually be parsed and checked**, not just assumed successful from a 200 status; Expo's API can return a 200 with a per-notification error inside the body (e.g., `DeviceNotRegistered`), which an early version of this Edge Function missed, silently treating real failures as successes.

**Respecting notification preferences:** `users.notification_prefs` (already in the data model from early planning, previously unused) now actually gates whether a user's tokens receive sends — the Settings toggle built early in this project needs to actually read/write this field for real, rather than being a local-only placeholder.

**Scope of this build:** Matches only, for now — the highest-value, most clearly-specified push trigger. Review prompts and cluster-suggestion nudges keep their existing pull-based (check-on-app-open) behavior; extending push to those is a reasonable low-effort follow-up once this core token/send infrastructure exists, not required as part of this pass.

**Second trigger added later: Hot Listing tier notifications.** Same `pg_net` trigger → Edge Function → Expo push API pattern as Matches, reusing the same infrastructure rather than building a parallel system. A trigger on `sale_listings` fires when `favorite_count` updates; the function computes the listing's tier from the same named threshold constants used for the visual badge (Hot 11+, Blazing 26+, Inferno 51+), compares against `highest_tier_notified`, and only sends + updates that column if the newly-computed tier is strictly higher. Notification goes to the listing's `seller_id`, respecting `notification_prefs` the same as Matches. Message copy: "🔥 Your listing just went Hot!" (or Blazing/Inferno equivalent), deep-linking to the listing's Sale Detail or My Listings.

---

## 8. Open Technical Decisions

- ~~Push provider~~ — **Resolved, see Section 7 (Push Notifications).**
- **Full-text/keyword matching approach for Phase 2** — plain Postgres `tsvector` search is simplest to ship; an embedding-based similarity search would catch more synonyms but adds real infrastructure (vector DB or pgvector) for a marginal MVP gain — recommend deferring.
- **Fuzzing algorithm specifics** — random offset within an annulus (not a simple bounding box) so the fuzzed point doesn't systematically land in a shape that reveals the true point's boundary.
- ~~**⚠️ Time-sensitive: legacy Supabase JWT-format API keys, deprecated by end of 2026.**~~ — **Resolved 2026-07-26, and the original premise turned out to be wrong.** This item previously stated that the newer `sb_secret_...` format "is an opaque token, **not** a JWT, and fails that verification outright — confirmed by direct testing," and therefore that every pg_net-triggered function would need `verify_jwt = false` plus a custom shared-secret header before the deadline.

  That is **no longer true** — Supabase's Edge Function gateway now accepts new-format keys. Verified two ways: (1) a direct `Authorization: Bearer sb_publishable_...` call to `send-hot-tier-notification` returns `200`, not `401`; (2) the Vault secret `service_role_key` — which all five pg_net callers now read from (see `0039_notification_webhooks_use_vault_key.sql`) — holds an `sb_`-prefixed key, and every notification path built on it delivers successfully in production.

  So no `verify_jwt` change and no custom header scheme are needed. The scope had also grown well beyond the two functions named here: there are now five pg_net callers (`send-match-notification`, `send-hot-tier-notification`, `send-organizer-approval-notification`, `send-organizer-application-alert`, `send-day-of-photos-reminder`). Because 0039 consolidated all of them onto a single Vault secret, any future key rotation is one `vault.create_secret` call rather than five migration edits.

  **A separate issue this surfaced, still open:** because the gateway accepts the *publishable* key — which ships in the website's JavaScript and is therefore public — these notification functions are invokable by anyone. Passing real ids would send genuine pushes/emails to arbitrary sellers. They are internal-only by design and none of them expose data back to the caller, so this is a notification-spam vector rather than a data leak, but it wants a real caller check (a shared secret the trigger sends and the function verifies) before launch.

---

## 9. Companion Website — Backend Considerations

### Phase 1 (public browsing)

**New RLS requirement, genuinely different from the mobile app:** every screen in the mobile app requires an authenticated session — there has never been a genuinely public, unauthenticated read path into the data. Phase 1 of the companion website needs exactly that, for its SEO-crawlable public pages (general browse, individual sale detail, town-wide event pages).

**What actually got built (bigger and better than originally planned):** this section originally called for a scoped `anon` RLS policy on `sale_listings` directly — but building this surfaced a real, pre-existing gap: address-fuzzing had **never** been enforced at the database level, for anyone, mobile included (only in the app's UI). The actual fix went further: `sale_listings` was renamed to `sale_listings_raw`, and a view named `sale_listings` now computes fuzzed fields per-row via `INSTEAD OF` triggers, gated on `now() >= reveal_at OR immediate_reveal_opt_in OR viewer_is_seller` — applied identically regardless of platform (app or website) or auth state (logged in or anonymous). Two Database Webhooks (hot-tier and match notifications) were repointed to `sale_listings_raw`; manual moderation review in the Supabase dashboard now also targets `sale_listings_raw`.

**Data fetching approach:** Next.js Server Components/Server-Side Rendering query Supabase directly for these public pages (using the `anon` key, reading from the `sale_listings` view, which handles fuzzing automatically) — this is what makes the pages genuinely crawlable, since content renders server-side before a search engine bot ever needs to execute client-side JavaScript.

### Phase 2a (auth — email/password + Google, this pass; Apple web sign-in deferred)

**Email/password and Google:** both should be able to reuse the exact same Supabase Auth configuration already set up for mobile — these are configured at the Supabase-project level, not per-platform. Google's OAuth redirect URI (`https://[project].supabase.co/auth/v1/callback`) is shared across every client using this Supabase project, so the existing Google Cloud OAuth client/secret should work for the website without creating a new one — **verify this rather than assume**, since it's the kind of thing worth confirming with a real test login rather than treating as certain.

**Apple Sign-In on web — explicitly deferred, real reason why:** mobile's native Apple Sign-In flow (`expo-apple-authentication` + `signInWithIdToken`) was specifically chosen to avoid needing a Services ID. Web has no equivalent native path — it requires Apple's actual OAuth flow, meaning a **Services ID** (a distinct Apple Developer Console credential type from the app's bundle ID) plus a **JWT-based client secret** that Apple requires regenerating periodically (up to every 6 months). This is real, separate Apple Developer Console setup — deliberately scoped as its own follow-up step, not bundled into this pass.

**Session handling:** Next.js middleware checks the Supabase session cookie on every request to gate logged-in-only routes (List a Sale, Favorites, Saved Searches once built) — redirecting to `/login` if absent, consistent with how the mobile app gates screens behind auth state.

### Phase 2b (List a Sale)

**Form fields, same as mobile's List a Sale flow (Section 3, feature spec):** address (Mapbox Search API autocomplete — the mobile implementation already calls this directly via `fetch`, a plain REST call that's directly portable to web with no SDK-specific rework needed), date range/time, categories + "Other" tags, title, **payment method toggle** (Cash only / Cash + e-Transfer — already in the schema, include it), description, AI-assisted title/description (reuses the exact same Anthropic Edge Function mobile calls, no new backend), join a town-wide event if one exists nearby, review, publish.

**Write path:** inserts go through the `sale_listings` view (not `sale_listings_raw` directly) — the `INSTEAD OF` triggers built for the address-fuzzing fix were specifically designed so any client's normal insert/update keeps working unchanged, mobile or web.

**Photo upload — file picker instead of camera, and web-specific HEIC handling:** unlike mobile (where `expo-image-manipulator` handles HEIC transcoding), that tool doesn't exist in a browser. Use a WebAssembly-based client-side library (e.g., `heic2any`) to detect and transcode HEIC/HEIF files to JPEG **before upload**, mirroring the exact same "transcode at the source, never store raw HEIC" principle established on mobile — not a different philosophy, just a different tool for a different runtime.

### Phase 2c (Favorites)

No new backend — reuses the existing `favorites` table and `favorite_count` trigger mobile already relies on. Heart toggle on listing cards (Discover) and Sale Detail, plus a `/favorites` page (already gated by Phase 2a's middleware). Logged-out users clicking the heart should redirect to `/login?redirectTo=...`, consistent with how the middleware already handles other protected routes — not a silently-failing click.

### Phase 2d (Saved searches + email alerts)

**Saved searches UI:** mirrors mobile's "I'm Looking For" flow — categories, keywords, radius. Writes to the existing `saved_searches` table, no new schema.

**Matching itself is now backend-guaranteed** (see "Matching & notifications" above) — the website doesn't need to compute or trigger matches itself at all, just create the `saved_searches` row and let the existing (now-corrected) backend trigger handle the rest, same as mobile.

**Email delivery:** extend the existing `pg_net`-trigger → Edge Function pattern (Section 7) to also send via Resend when a match is inserted for a saved search that has no corresponding mobile push token (or as a supplementary channel regardless — worth deciding whether email is web-only-fallback or sent alongside push for all users; recommend supplementary-for-all initially, since a user might genuinely prefer checking email over a push notification, and simplicity of "always send both channels" beats conditional logic for an MVP).

### Phase 3 (Route planning)

**Map:** Mapbox GL JS specifically (per the original spec's explicit call-out) — already the library Phase 1 uses for the browse/detail map, so this is reusing an existing dependency, not adding a new one.

**Route optimization:** mobile calls Mapbox's Directions/Optimization API directly via `fetch` — a plain REST call, not an SDK-specific feature, so this is directly portable to web with no rework, same principle as Phase 2b's address autocomplete port.

**Both modes, mirroring mobile:** Manual Pick (from the user's own favorites) and Auto-Suggest (weighted by proximity/category match to saved searches/quality signals) — **investigate the actual mobile Auto-Suggest implementation before designing the web version**, rather than assuming the mechanism, since it's not yet confirmed whether the scoring logic is client-side or partially server-side (the matching engine turned out to be more server-side than assumed going into Phase 2d — worth checking rather than guessing here too).

**Navigation — a real product decision, not just technical:** desktop/web has no native turn-by-turn equivalent to mobile's "Start Navigation." Decided approach: offer **both** (a) an immediate **"Open in Google Maps"** link using Google's multi-stop directions URL format (`google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...`), which works as a real link on any device (opens the app directly if installed, browser fallback otherwise), and (b) an **"Email me these directions"** action (reusing the Resend infrastructure from Phase 2d) — solving the real cross-device case of planning on a desktop but actually navigating from a phone later. Not an either/or — both serve genuinely different real moments.

**"Share my route"** — mobile already has this; port the same behavior to web for consistency (already using the `garagehunt://` deep link scheme for mobile shares; web shares should use real `https://garagehunt.ca/...` links instead, not the mobile-only custom scheme).

### Phase 4 (Organizer tools)

**Investigate the actual mobile implementation before designing** — same discipline as Phase 3's Auto-Suggest investigation, given this covers several distinct flows (application form, event creation/management, join-request approval, self-organized cluster claiming) and precise mechanics shouldn't be assumed from memory.

**Scope, mirroring mobile:**
- Organizer application form (available to any logged-in user, not gated on `is_verified_organizer`) — writes to `organizer_applications`, triggers the existing Resend admin-notification email, no new backend needed.
- Organizer dashboard (gated on `is_verified_organizer = true`): create a town-wide event, view/manage join requests from sellers, approve/deny requests, view the event's current joined listings.
- Self-organized cluster claiming — the "neighbors planning sales nearby, team up" flow that lets a regular (non-verified) seller claim and organize a cluster without needing prior organizer status. Worth deciding whether this belongs in Phase 4 or is closely enough related to general seller experience to include regardless of the "verified organizer tools" framing — lean toward including it here since it's part of the same underlying `cluster_suggestions` + event-creation surface.

---

## 10. Day-of Photos

**Cross-platform feature** (mobile + website both need it, since both have full List a Sale / photo upload flows) — not scoped to either platform specifically.

**The one deliberate exception to this project's "derive at query time over cron jobs" principle, and why:** every other notification trigger in this app (matches, Hot Listing tiers, organizer approvals) fires off a genuine database event — something changing. This feature has no event to hook onto: nothing in the database changes when a clock reaches a listing's `daily_start_time`, time simply passes. A lightweight **scheduled job** (Supabase's `pg_cron`, running every 10-15 minutes) checking "which currently-live listings just started today and haven't had a reminder sent yet" is the honest, correct answer here — not a violation of the general principle, just the one category of problem (pure time-based, no data change involved) that actually needs one.

**The check, each run:** for listings where today's date falls within `[start_date, end_date]`, current time has just passed `daily_start_time` (within the job's check window), and `day_of_photo_reminder_sent_date` is not already today's date — send the reminder (push via the existing Expo push infrastructure, email via the existing Resend infrastructure for web-primary users) and set `day_of_photo_reminder_sent_date = current_date`. The date-not-boolean field naturally handles multi-day sales getting a fresh reminder each day without extra logic.

**Reminder deep-links to a lightweight add-photos flow** — reuses the exact existing photo upload infrastructure (camera/library on mobile, file picker + `heic2any` HEIC handling on web), just tagging new uploads `photo_type = 'day_of'` instead of the default `planning`.

**Display logic:** gallery/card thumbnail shows the most recent `day_of` photo if one exists from today, falling back to `planning` photos otherwise — derived at query/render time, no separate "which photo is featured" field needed. The **"📸 Fresh Photos" badge** (same masking-tape system as Hot Listing/Live/Featured) shows specifically when a `day_of` photo exists from *today* — re-derived each day, not a permanent achievement, consistent with the real-time-freshness spirit of the feature.
