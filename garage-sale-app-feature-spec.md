# GarageHunt (working title) — Feature Spec & User Flows

*A Canada-wide garage sale discovery app*

---

## 1. User Types

| Type | Description |
|---|---|
| **Seller** | Registered user hosting a garage sale, lists it with details |
| **Buyer** | Registered user browsing/searching for sales to visit |
| **Organizer** | Verified user who can create/manage town-wide or community-wide sale events |
| *(Most users can be both Seller and Buyer on the same account)* |

---

## 2. Onboarding Flow

1. Download app → Sign up (email, phone, or social login) — **includes a required "I agree to the Terms of Service and Privacy Policy" checkbox**, unchecked by default, with tappable links to both real hosted documents. "Create account" stays disabled until checked. Acceptance is recorded (timestamp + which terms version) at the moment of signup — a real record for legal defensibility if the Terms are ever updated later, not just a UI gate.
2. Choose home location (postal code / city) — sets default map center & notification radius
3. Optional: choose interests (categories they usually shop for) — powers personalized alerts later
4. **First-time guided tour** — a hybrid spotlight/bubble tour, shown once ever (never again after completion or skip), covering every major exciting piece of the app rather than a generic "here's the app" intro. Two parts:

   **Part A — live spotlight on the real Discover screen** (dims the background, circles/highlights the actual real element, tooltip bubble, "Next"): things that are always present regardless of how new the account is, so there's always something real to point at.
   - Bottom tab bar, one stop per tab: **Discover**, **I'm Looking For**, **List a Sale**, **Profile**
   - The **map itself** — "Every sale near you, live"
   - The **map/list toggle**
   - A sample listing card's **heart/favorite icon** — "Favorite the ones you don't want to miss — enough interest and a listing goes 🔥 Hot"
   - The **town-wide event card** (purple, at the top of Discover) — "One card, dozens of sales — team up with neighbors and find the whole event without hunting down each seller one by one" (directly per your callout — town-wide events are joinable/discoverable as one unit, not something you need to already know individual sellers to find)
   - The **"Plan my route"** button — "Let the app map your whole Saturday, or build your own stop by stop"

   **Part B — illustrated concept cards** (floating cards, not tied to real on-screen data, since a brand-new account has none yet): the exciting mechanics that need something to already exist to demonstrate live.
   - **Hot Listing tiers** — the 🔥 → 🔥🔥 → 🔥🔥🔥 escalation, framed as real momentum sellers can watch build
   - **Shopper tiers & check-ins** — Regular → Trusted Shopper → Super Shopper, earned by GPS-verified check-ins at real sales
   - **"I'm Looking For" + notifications** — set it once, get pushed the moment something matching shows up nearby, no more manually checking
   - **Trust & safety** — verified reviews, GPS-confirmed check-ins, and address-reveal timing that protects sellers — a quick "this is a real community, not just a marketplace" beat

   **Skip** available on every screen of both parts; final card's action reads "Get Started," not "Next."
5. Land on **Map/Discover** home screen

---

## 3. Seller Flow — "List My Sale"

**Goal:** Get a sale live in under 3 minutes.

1. Tap **"+ List a Sale"**
2. **Location** — auto-pulled from device GPS or manually entered address (street-level, not exact pin optional for privacy until day-of). **Manual entry uses live address autocomplete** as the seller types (via Mapbox's Search API), showing real matching addresses to pick from — reduces typos and speeds up entry, same principle as any modern address form.
3. **Date range & time** — a start date and end date (e.g., Sat–Sun), with one shared daily time window (e.g., 9am–2pm) applied across every day in the range. A single-day sale is simply a range where start date = end date — no separate "add another day" step needed. **Fields start empty (no stale/incorrect pre-filled default), and tapping opens a real visual calendar picker** — never a raw text field requiring the seller to erase and retype an existing value. This is a genuine bug fix, not just a preference: an earlier implementation defaulted to a date over a week in the past and required manual text editing to correct, found during real-device testing.
4. **Photos** — upload up to 10 (teaser shots of items, signage, etc.)
5. **Categories carried** — multi-select tags:
   - Furniture, Kids/Baby, Clothing, Tools, Electronics, Sporting Goods, Books/Media, Kitchenware, Antiques/Collectibles, Garden/Outdoor, Other
   - **Selecting "Other" reveals a tag-style text input** — *"What else are you bringing?"* Typing something and pressing return/enter adds it as a removable bubble/chip, and the field clears for the next entry, so a seller can add several other items (e.g., "guitar," "vinyl records," "power tools") rather than being limited to one. These entries are stored as a list on the listing and feed into the same keyword-matching pipeline as the description (see 4c) — not just appended as plain text.
6. **Title** (optional) — a short, editable headline for the listing (e.g., "Huge Moving Sale — Furniture & Tools"). If left blank, defaults to an auto-derived title from the address (e.g., "Maple Street garage sale"), as it does today — this is a new field, not a change to existing default behavior.
7. **Payment accepted** — a simple two-option toggle: **"Cash only"** or **"Cash + e-Transfer."** Cash is always assumed available (implicit in every garage sale), so this isn't a broader multi-select — just whether the seller also accepts Interac e-Transfer, a real convenience signal for buyers who don't carry cash. Defaults to "Cash only" if not changed. Displayed as a small tag on the listing card and Sale Detail, reusing the existing masking-tape badge system (consistent visual language, not a new component) — not a Discover filter for now, just a visible label.
8. **Description** — free text (optional): "Moving sale, everything must go," etc.
9. **AI-assisted title & description ("✨ Get AI suggestions"):** a button on this step generates a suggested title and description from whatever the seller's already provided (selected categories, any "Other" tags), plus one optional free-text prompt for anything else to mention. The seller sees the suggestion and can **accept, edit, or regenerate** — nothing is inserted without them seeing and approving it. This calls Anthropic's Claude API via a Supabase Edge Function (keeps the API key secret server-side, never bundled in the app). **Regeneration is rate-limited per user** (e.g., a handful per hour) — same cost/abuse-protection philosophy already applied to route requests, since this is a real pay-per-use API call, not free.
10. **Join a town-wide event?** — if an Organizer has created an event in their area/date, seller can request to be added to it
11. Review → **Publish**
12. Confirmation screen: "Your sale is live!" with share-to-social option

**Sale lifecycle states:** Draft → Scheduled → Live (auto-flips on start date/time) → Ended (auto-archives) → (optional) Sold Out/Cancelled toggle

**Editing a published listing:** Sellers can edit a Scheduled or Live listing at any time — this matters in practice, since a two-day sale often needs updates between days (e.g., "Day 2: table sold, still have the tools"). Editable fields: photos, categories, description, title, and the date range itself (extend to add a day, or shorten if everything sold early). **Address is locked from editing after publish** — changing a live listing's location silently is a safety/trust risk, so an address correction requires re-submitting through review rather than a direct edit.

---

## 4. Buyer Flow — "Find Sales"

### 4a. Discover / Map View (home screen)
- Map with pins for all sales in radius (default: user's set radius, adjustable)
- Toggle: **List view** vs **Map view**
- Filters: date (today/this weekend/custom), category, distance, "town-wide events only"
- Each pin/card shows: thumbnail photo, distance, categories, time window

**Two distinct empty states, not one generic message:**
- **Genuine cold-start** (zero listings exist in the radius at all, no filters applied) — this is the real "new market, day one" moment, and the default "no results" message undersells it badly. Instead: an inviting call to action — *"No sales here yet — be the first!"* / *"List yours and put [area name] on the map."* — with a prominent **"+ List a Sale"** button directly in the empty state, not buried in the tab bar. Turns a dead end into the exact action that fixes the problem for everyone after them.
- **Filtered-empty** (listings exist in the radius, but the buyer's active filters exclude all of them) — a completely different message: *"No sales match your filters"* with a clear way to reset/loosen them. Showing the "be the first" invitation here would be actively wrong — sales exist, they're just filtered out.

### 4b. Route Planning — Two Modes
**Mode 1: Manual Pick**
1. Buyer browses/favorites sales (♥ icon) as they scroll map or list
2. Tap **"Plan My Route"**
3. App optimizes order of favorited stops (shortest total drive time), shows turn-by-turn or opens in native maps app
4. Buyer can drag to manually reorder if they want to override

**Mode 2: Auto-Suggest**
1. Buyer sets an area + time window (e.g., "Saturday morning, 10km radius")
2. Taps **"Suggest a Route"**
3. App auto-selects a high-value cluster of sales (weighted by: proximity, category match to buyer's interests, ratings/photos quality) and builds an optimized route
4. Buyer can swap out any stop before confirming

Both modes end in the same **Route Summary** screen: ordered stop list, total distance/time, start navigation button.

### 4c. Item Seeker / Matching
1. Buyer taps **"I'm Looking For..."**
2. Selects category(ies) and/or types keywords (e.g., "kids bike," "dining table")
3. **Selecting "Other" among the categories reveals a tag-style text input** — *"What else are you looking for?"* Same interaction as the seller side: type, press return/enter to add it as a removable bubble, repeat to add more. Each entry appends to the buyer's saved search keyword list — this is really the same underlying field as the main keyword search box above it, just fed through a second entry point.
4. Sets area + optional date range
5. App matches against seller category tags (and description text, phase 2) in that area
6. Buyer gets **push notification** when a matching new listing goes live: *"A sale near you is listing: Furniture — 2km away, starts Sat 9am"*
7. Matches also surface in a dedicated **"Matches for You"** tab
8. **Discover's "Other" filter:** the same tag-style free-text pattern used here and in List a Sale extends to Discover's filter row too — selecting "Other" among the filter chips reveals a text input, letting a buyer narrow the browse list by something outside the fixed category set (e.g., typing "guitar" filters to listings whose `other_items` or description mention it).
9. **Matching precision (MVP):** all keyword/Other matching — on Discover, in List a Sale, and here — is a **case-insensitive substring match**, not exact-character-only but also not fuzzy or synonym-aware. Searching "bike" matches a listing containing the word "bike," but won't surface one that only says "bicycle," and won't tolerate typos. True fuzzy/synonym matching needs real added infrastructure (full-text search ranking or embedding-based similarity) — deliberately deferred past MVP per the technical architecture doc, worth revisiting once real listing volume makes literal matching feel limiting.

---

## 4d. Interest Signals & Reviews

**Interest ("hearting"):** The favorite/heart mechanism already exists structurally (Section 4a/6). This makes it a visible momentum signal, not just a personal bookmark:
- Heart/interest count now shows on **Discover feed cards**, not only the Sale Detail page — momentum should be visible while browsing.
- Framed explicitly as social proof: *"14 people interested"* rather than a bare number next to an icon.
- **"Hot listing" badge tiers:** once a listing's favorite count crosses a threshold, the plain interest count is replaced with an escalating badge — three tiers, not a single on/off state:
  - **🔥 Hot listing** — 11+ interested
  - **🔥🔥 Blazing Hot** — 26+ interested
  - **🔥🔥🔥 Inferno Hot** — 51+ interested
  
  Each tier increases visual intensity (more fire emoji, bolder text, a thicker/more saturated tag border) while staying the same masking-tape tag shape as every other badge — escalating, not a different design per tier. These are launch thresholds, tunable later like everything else in this system.
- **Seller-facing progress indicator:** on **My Listings**, a seller's own listing below the *next* tier shows a progress note near the interest count — e.g., *"14 interested · 12 more for 🔥🔥 Blazing Hot"* once Hot Listing is already reached, not just before the first tier. Once Inferno Hot is reached, no further progress note is needed. This is seller-facing only (My Listings, not the public Discover/Sale Detail views) — buyers don't need to see "how close" a sale is, only its current tier.
- **Proactive push notification on tier crossing:** the seller gets pushed the moment their listing genuinely crosses a new tier ("🔥 Your listing just went Hot!") — this shouldn't be something they only discover by happening to open the app. Fires only once per tier per listing, even if the favorite count later fluctuates back down and up around that same threshold.

**Post-sale reviews:**
1. When a listing's status flips to `ended`, roughly a day later, everyone who favorited that listing gets a push notification: *"How was [seller]'s sale on Maple Street?"*
2. **The prompt asks "Did you visit this sale?" before asking for a rating.** There's no attendance verification (no check-in, no GPS proximity check at MVP) — favoriting is only a proxy for intent to go, not proof of attendance. Letting someone honestly say "no, didn't make it" avoids uninformed reviews rather than pretending the app can verify who showed up.
3. If yes: a short rating (1–5 stars) plus an optional comment.
4. **Reputation aggregates at the seller level, not per-listing** — a seller's rating and review count carry across all their sales (e.g., "4.8★ · 23 reviews"), which is what actually builds momentum for a repeat seller rather than each sale starting from zero.
5. Seller rating displays on their listings, My Listings dashboard, and Profile.
6. **Moderation:** reviews reuse the existing report/moderation pipeline (Section 7) — reportable for fake or retaliatory content, reviewed the same way as listing reports. Capped at one review per listing per reviewer to prevent pile-ons.
7. **Known limitation, worth revisiting later:** the honesty gate (self-reported attendance) isn't bulletproof. A stronger version — e.g., GPS proximity confirmation while the sale is live — is a reasonable Phase 2/3 addition if fake reviews turn out to be a real problem, but adds real complexity (location permissions, battery/privacy tradeoffs) not worth taking on for MVP.

---

## 4e. Buyer Check-In & Shopper Tiers

Extends the review system above rather than replacing it — the self-report "did you visit?" question stays as a fallback, but check-in gives a *verified* alternative.

**Check-in:**
- On Sale Detail, a **"Check in here"** button appears only when the sale's derived status is Live **and** the buyer's current device location is within ~150m of the listing's real (unfuzzed) location.
- Tapping it verifies via a **one-time GPS read** at that moment — no background location tracking or "always allow" permission needed, keeping this to the same location access level already used for map/distance features.
- A review submitted by someone who checked in for that listing displays as **"Verified visit"** — a stronger trust signal than a self-reported one, without blocking reviews from buyers who simply forgot to check in.

**Points & tiers:**
- Buyer tiers are based purely on **verified check-in count** — no separate points/bonus system, just a straightforward count of real check-ins.
- Tiers: **Regular** (10+ check-ins), **Trusted Shopper** (100+), **Super Shopper** (250+). Below 10 check-ins, no badge shows at all — a brand-new buyer's profile stays clean rather than displaying an "unranked" label. Launch values, easy to retune later based on real usage.
- Tier is **derived at display time** from the check-in count (same philosophy as the Hot Listing threshold and sale status), not a separately-maintained value that could drift out of sync.
- The tier badge displays on the buyer's own **Profile**, and next to their name when a seller is rating checked-in buyers post-sale (below) — **not** shown publicly on every listing or favorite. A public leaderboard/visibility model is a bigger fairness and privacy question not scoped for MVP; this stays a personal-status reward for now.
- **In-app explanation required:** a badge system with no visible explanation just feels arbitrary. On Profile, next to the tier badge (or in its place, for a buyer with fewer than 10 check-ins), show how it's earned — e.g., a small "How to earn badges" info link/icon opening a short explainer of the three tiers and their thresholds. For a buyer under the first tier, show progress the same way My Listings shows progress toward Hot Listing (e.g., *"6 check-ins · 4 more for Regular"*) — same established pattern, so it's immediately familiar rather than a new UI convention.

**Sellers rating buyers:**
- After a sale ends, sellers see a lightweight list of buyers who **checked in** for that sale (not just favorited — check-in is the stronger signal), each with a simple optional thumbs-up — not a full 5-star system, since a seller isn't writing reviews for a dozen strangers at a busy sale.
- This feeds a separate, qualitative "seller-rated" signal on the buyer's profile, distinct from the points/tier system — points reward *showing up*, seller ratings reward *being good to deal with*.
- **Per-listing check-in tally:** the seller sees a simple total count of how many people checked in at *that specific sale* — displayed on My Listings and on the checked-in-buyers list screen (e.g., *"14 people checked in"*). This is distinct from a buyer's personal cumulative check-in count (which drives their own tier) — this number is about the sale's real foot traffic, useful proof of turnout for the seller.

---

## 4f. Day-of Photos

Identified as a real, domain-specific gap: pre-listing photos are typically taken whenever the listing is created (often days ahead of the actual sale) and show individual items, not the actual scene — tables set up, everything laid out, the real scale of what's happening. This feature captures the moment that actually creates urgency, distinct from planning photos.

**The prompt:** at the start of each day of a multi-day sale (not just once for the whole listing), the seller gets notified — "Your sale is starting! Snap a fresh photo to bring in more buyers today 📸" — deep-linking to a lightweight add-photos flow (reusing the existing photo upload infrastructure, camera/library on mobile, file picker + HEIC handling on web).

**Kept alongside originals, not replacing them** — day-of photos are additive, tagged distinctly from planning photos, and featured first in the gallery/card thumbnail on any day they exist for, falling back to the original planning photos otherwise. This preserves detail from the original listing while still leading with the freshest, most exciting content.

**"Fresh Photos" badge** — same masking-tape badge system as Hot Listing/Live/Featured, shown on Discover cards and Sale Detail specifically on days a day-of photo has actually been added *today* — not a permanent one-time achievement, since the whole point is real-time freshness, matching the spirit of the existing "Live now" badge.

---

**Who:** Verified/approved Organizers only (community associations, BIAs, street reps — verification process TBD, likely manual review or municipal partnership)

1. Organizer applies for verified status (one-time)
2. Creates event: name, area/boundary (drawn on map or neighborhood list), date range
3. Individual sellers in that area can **request to join** the event (or organizer invites them)
4. Event page aggregates all joined sales into one map + shareable event listing
5. Buyers see event as a single prominent card: *"Riverdale Community Garage Sale — 42 homes participating, Sat June 14"*
6. Event page has its own optimized "shop this event" route option (feeds into the same route engine as 4b)

### 5a. Self-organized clusters (auto-suggested, not organizer-initiated)

A second path into a town-wide event, distinct from the formal organizer flow above: the app **detects clustering on its own** and prompts sellers to team up, rather than waiting for a verified organizer to set one up proactively.

1. A background process periodically scans for clusters: multiple independent, unaffiliated sale listings within a radius (e.g., 500m–1km) with overlapping dates.
2. When a cluster crosses a threshold (e.g., 4+ houses), **every seller in the cluster gets a prompt**: *"3 other sales are happening near you this weekend — want to team up as a community sale? More sales together means more buyer traffic for everyone."*
3. The rationale is made explicit to sellers, not just implied: clustering genuinely increases buyer traffic for everyone in the group, which is worth surfacing as the actual pitch, not just a passive notification.
4. Whoever accepts first becomes the organizer of a newly created event, using the same underlying event structure as a formal organizer-run event (Section 5).
5. **Verification shortcut for this path specifically:** since the claiming user is already a phone-verified account with a real, live listing physically inside the cluster, this path **skips the full manual organizer review** described in the moderation section. The risk profile is meaningfully lower than a stranger cold-applying to organize a neighborhood they have no presence in — full manual review remains required for anyone proactively applying to organize without already being a participant in the cluster.
6. The resulting event is flagged internally as **self-organized** vs. **association-organized**, though buyers see no meaningful difference on the event card itself.

---

## 5b. Profile

Previously a placeholder ("coming soon"); now specified properly, since it's more than an account settings page — it's also where a seller plans ahead and sees cluster opportunities.

**Standard account info:**
- Display name, **avatar/photo** — tappable, opens the same photo picker pattern already used for listings (library or camera), uploads to a dedicated Storage bucket. Falls back to the existing initials-in-a-circle treatment when no photo has been set — this isn't a replacement for that fallback, just an upgrade path on top of it.
- Home location/area (used for default map center and radius — editable)
- Contact info (email/phone on file)
- Member since date
- Verified organizer badge, if applicable
- Settings: notification preferences, 2FA, linked social logins

**Shortcuts:**
- My Listings (seller dashboard)
- Saved searches ("I'm Looking For")
- Organizer dashboard, if applicable

**Planning ahead:**
- A seller can create a **future sale in Draft status** well before the date, without needing to publish it live yet — useful for planning around a specific weekend in advance.
- **Cluster opportunity card:** if a seller has a draft or scheduled sale and the app detects other nearby sellers with sales in a similar window (even before the full auto-cluster threshold in Section 5a is hit), Profile surfaces a lightweight nudge: *"2 neighbors are also planning sales around that date — want to see who and reach out?"* This gives sellers visibility into forming a cluster proactively, rather than only being notified passively once the threshold is already met.

---

## 6. Core Screens List (for mockup phase)

1. Onboarding / Sign up
2. Discover — Map view
3. Discover — List view
4. Sale Detail page
5. List a Sale (multi-step form)
6. My Listings (seller dashboard)
7. Route Planner (manual + auto modes)
8. Route Summary / Navigation handoff
9. "I'm Looking For" (item seeker setup)
10. Matches for You
11. Town-wide Event page
12. Organizer dashboard
13. Profile — account info, listing shortcuts, sale planning, cluster nudges (see Section 5b)

---

## 7. MVP vs. Later Phases

**MVP (Phase 1)**
- Registration, seller listing creation, categories, photos
- Map + list discovery, filters
- Manual-pick route planning
- Real push notifications for matches (via Expo's push service — see technical architecture Section 7)

**Phase 2**
- Auto-suggest route mode
- Town-wide events + organizer verification
- Keyword/description matching (beyond just category tags)
- Ratings/reviews on sales (post-sale)

**Phase 3**
- Companion website — **full parity with the app** (login, list a sale, route planning, matching, organizer tools — see Section 13)
- Social features (follow favorite sellers, share hauls)
- Analytics for sellers (views, favorites on their listing)

---

## 8. Address Privacy — Decision

**Default:** Buyers see a **fuzzed/approximate location** (street or ~100–150m radius pin) for any sale more than a few hours out. **Exact address auto-reveals at midnight on the day of the sale**, and stays visible through the Live and Ended states on that day's map.

**Seller override:** At listing creation, a toggle lets the seller choose to show the exact address immediately instead of waiting for the day-of reveal. This is **off by default** and requires the seller to actively opt in. When toggled on, an inline warning displays:

> *"Your exact address will be visible to all app users immediately. We recommend waiting until the day of your sale for privacy and safety."*

The choice is logged as an explicit, seller-initiated action (useful for accountability and for the app's Terms of Service).

**Town-wide/organizer events:** default to immediate full-address visibility for all participating sellers in the event, since organizer-run community sales are already semi-public via flyers/municipal channels. Individual sellers joining an event can still request the fuzzed default if they prefer.

**Additional safety layer:** every sale listing includes a **"Report this listing"** button, and basic rate-limiting applies to how many distinct addresses a single (especially new) account can view in a short time window, as light friction against scraping or misuse.

---

## 9. Moderation — Decision

Items 3, 5, 6 (organizer portion), and 7 below are already built. This pass closes the remaining gap: items 1, 2, 4, and the buyer-listing portion of 6.

1. **Automated photo screening** on upload — **reuses the existing Anthropic API integration** (already paid for and wired up via Edge Function for AI-assisted listing descriptions) rather than adding a separate vendor like Google Cloud Vision. Claude's vision capability classifies each uploaded photo; clearly inappropriate content is rejected at upload time, borderline/uncertain cases are flagged for manual review rather than auto-rejected.
2. **Automated text screening** on the description field — same reuse principle: the description is sent to the Anthropic API with a moderation-classification prompt (distinct from the AI-suggestion prompt, but the same underlying integration). Clearly bad content (hate speech, obvious scam scripts like "send an e-transfer deposit") blocks submission synchronously with a clear error message. Borderline content is allowed through but flagged for review, not silently blocked — false positives shouldn't prevent a legitimate seller from publishing.
3. **User reporting** — ✅ already built (listings + photos, categorized reasons).
4. **Manual review queue** — deliberately **not** a custom in-app admin UI, same pragmatic choice already made for organizer applications: flagged listings/photos/reports are reviewable directly in the Supabase dashboard (Table Editor, filtered by `moderation_status = 'pending_review'` or `reports.status = 'open'`). Building a dedicated review-queue screen isn't worth the effort at solo-reviewer, low-volume scale — revisit if/when review volume genuinely outgrows checking a filtered table view directly.
5. **Organizer verification** — ✅ already built (Section 7 below).
6. **Account-level trust signals** — a new account's **first-ever listing** is always flagged for manual review regardless of what automated screening returns, even if screening finds nothing wrong — an extra caution layer specifically for unproven accounts. Established accounts with a clean history publish instantly once past their first listing.
7. **Organizer approval process** — ✅ already built, see below.
   - Applicant submits: full name, SMS-verified phone (reused from signup), the neighborhood/association they represent, and either a formal affiliation (resident association, BIA) or informal vouching (names of neighbors, link to an existing community group/listserv).
   - A person on the team manually reviews and approves — realistic at low application volume, avoids the cost/integration effort of a paid identity-verification API (e.g., Stripe Identity, Persona) before it's actually needed.
   - **Admin notification on new application:** a real gap identified and fixed during real-device testing — without this, nothing would ever alert the team that a new application exists to review. On submit, an email is sent (via Resend — see technical architecture doc) to the team's review address, so applications don't just sit invisibly in the database waiting to be noticed.
   - Approved organizers get `is_verified_organizer` flipped in the data model.
   - **For the London launch specifically:** consider proactively inviting a few known neighborhood associations/BIAs to be first organizers rather than waiting on inbound applications — removes verification ambiguity and seeds the map with real events on day one.
   - **Revisit at scale:** once operating beyond markets the team can personally vet, replace manual review with a lightweight automated check (phone + email + basic ID scan via a pay-per-verification API), since cost there is usage-based and scales with growth.

---

## 10. Monetization — Decision

**Three-part model:**

**1. Ads (free tier):** Google AdMob banner ads, inline in the **Discover feed only** — never interstitials, never in List a Sale, Route Planner, Edit Listing, check-in, or any core action flow. Styled as a distinct "Sponsored" card (same shape as a real listing card, dashed border, muted tone, clearly labeled) — reusing the exact ad-card treatment already designed in the brand identity work, not a new visual pattern. Ads are hidden entirely for ad-free subscribers.

**2. Ad-free subscription:** $4.99/month (CAD), auto-renewing, removes ads app-wide. No functional perk beyond ad removal for now — kept simple for launch; worth revisiting later whether an added benefit (e.g., unlimited listing photos) would convert better, but not blocking launch on that decision.

**3. Boost a listing:** $2.99 CAD one-time purchase per boost, tied to a specific listing, lasting **48 hours** from purchase.
- Boosted listings display a **"⭐ Featured" badge** (same masking-tape tag system as Hot Listing, Live, etc. — consistent visual language, not a new component).
- Boosted listings get priority placement in **Discover's default browse order only**.
- **Critical constraint:** boost status must **never** affect ranking in "I'm Looking For" matches — that ranking stays purely relevance-based (category/keyword match + distance), regardless of whether a listing is boosted. Letting paid placement override genuine search relevance would quietly erode trust in the matching system for a small amount of extra revenue — not an acceptable tradeoff.

**Billing infrastructure:** RevenueCat, sitting between the app and both stores' native billing (Apple StoreKit, Google Play Billing) — avoids building/maintaining two separate native billing integrations. Free for GarageHunt at launch scale (RevenueCat's free tier covers up to $2,500/month in tracked revenue; 1% above that) — effectively no cost until the app is genuinely making money.

---

## 11. Required Deliverable — Terms of Service / Signup Agreement

Before launch, the app needs a **Terms of Service / User Agreement presented at signup**, which must cover at minimum:

- User consent to submit and display their address (and, for buyers, to view addresses submitted by others)
- Explicit acknowledgment of the address privacy toggle and its risks — i.e., a seller who opts into immediate full-address visibility is confirming they understand and accept that choice
- Limitation of liability language regarding user-submitted location data, photos, and listing content (the app is a platform connecting users, not a guarantor of any individual sale's safety or accuracy)
- User conduct expectations (no scams, no harassment, reporting obligations)
- Data handling/privacy policy cross-reference (location data, photos, account info)

**Status:** Not yet drafted. **Needs professional legal review before use** — a drafted version can serve as a starting point for a lawyer, but should not be treated as launch-ready on its own.

**Related pre-launch checklist item — ✅ Resolved.** Supabase email confirmation was disabled during development for faster testing, then re-enabled once real device testing (TestFlight, Play Closed Testing) was underway. New signups now require clicking a real confirmation link before signing in — including future test accounts, so use a real accessible inbox (Gmail's `+` alias trick, e.g. `adambujold+test1@gmail.com`, still works well for this).

---

## 12. Next Phase — Actual Build

**Status:** Design and architecture phases complete (screens, feature spec, data model, auth/security). Not yet started: real React Native code, backend deployment, live Mapbox/Supabase integration, App Store/Play Store publishing.

**Decision:** Deferred for now. To revisit: whether to set up a local dev environment and build incrementally in this project, hand the completed spec/architecture to a contractor/developer, or explore no-code/low-code tooling.

---

## 12b. Sharing & Invites

Identified as a gap during the pre-testing polish pass — only a generic native share button existed (Sale Detail), with no real deep linking or invite mechanic. Scoped deliberately to **sharing/invite only, not referral rewards** — a rewards system (e.g., "invite 3, get a free boost") is a genuinely bigger feature (fraud prevention, signup attribution, reward fulfillment) that would need its own design pass later, not bundled into this one.

**Deep linking approach:** a custom URL scheme (`garagehunt://...`), not full Universal Links. Universal Links (normal `https://` links that open the app if installed and fall back to a real webpage if not) need actual domain hosting and verification files at a real production domain — since there's no live web hosting yet beyond the GitHub Pages legal docs, that upgrade naturally belongs with the Companion Website work already tracked (Section 13), not built as disconnected infrastructure now.

**Three concrete pieces:**
1. **Sale Detail sharing, upgraded:** the existing native share sheet now includes a real deep link (`garagehunt://sale/[id]`) alongside a friendly branded message (listing title, date, distance), not just a bare share action.
2. **Route sharing:** a "Share my route" action on the Route Summary screen — a formatted message listing every stop (each with its own deep link) framed as an invitation, e.g., *"Come hunt with me this Saturday! 🔥"*
3. **Invite a friend (generic):** a share action, likely on Profile, promoting the app itself with the brand voice — *"Join me on GarageHunt — Canada's weekend treasure hunt 🔥"* — **honest limitation:** since the app isn't publicly live on either store yet, this can't include a real download link today; ship the messaging now and add the real store link the moment the app actually goes public.

---

## 13. Companion Website

**Scope decision:** Full parity with the app — not a stripped-down public browsing tool. Sellers and buyers should be able to do everything on the website that they can do in the app: register/login, list a sale, browse/route-plan, use matching/alerts, and (for verified organizers) manage events.

**Shared backend:** The website is a second frontend on top of the same API, database, and auth system already designed for the app — no separate backend needed. This is one of the main advantages of getting the architecture right before starting on the website.

**What's different on web vs. mobile (to design around, not skip):**
- **Push notifications** become web push (browser-based), which works differently than mobile FCM/APNs and has lower reliability (notifications don't fire if the browser/tab is closed on some browsers) — email digest as a fallback is worth considering for match alerts.
- **Photo upload** uses a standard file picker instead of a camera roll/camera integration — same end result, different input mechanism.
- **Maps** use Mapbox GL JS (the web SDK) instead of the mobile Maps SDK — same underlying Mapbox account and data, different library.
- **Layout** needs real responsive design — the mobile mockups we built are single-column, phone-width; the website needs wider desktop layouts (e.g., map + list side-by-side rather than stacked/toggled).
- **SEO** matters even with full parity — individual sale detail pages and town-wide event pages should be crawlable/indexable (with fuzzed location data pre-reveal, consistent with the privacy rules) since organic search is a realistic discovery channel for "garage sales near me"-type queries, independent of the login-gated features.

**Build phasing** (decided once actual implementation started — the sections above describe the full end-state, this is the rollout order):
1. **Phase 1 — Public, SEO-crawlable browsing, no login required.** General browse/discover page, individual sale detail pages, town-wide event pages. Highest-value starting point on its own, since this is the one piece of "full parity" that specifically can't be replaced by just downloading the app — it's the organic-search discovery layer.
2. **Phase 2 — Auth + core interactive parity.** Register/login, list a sale, favorite, saved searches/match alerts (email digest as the practical fallback for web push's noted reliability gap).
3. **Phase 3 — Route planning**, via Mapbox GL JS specifically.
4. **Phase 4 — Organizer tools**, lowest urgency given smallest user base. **Scope note, decided once Phase 4 investigation started:** self-organized cluster-claiming is deliberately excluded from this phase despite sounding organizer-adjacent — architecturally it's the *inverse* of an organizer tool (claiming a cluster is what *grants* `is_verified_organizer`, not something requiring it already), and it has real unbuilt prerequisites specific to the website (no Profile page exists yet — the only place mobile surfaces the cluster nudge — and cluster detection was correctly left unwired from Phase 2b's List a Sale, since nothing consumed it at the time). Deferred to its own future phase, not bundled in as "one more form."

**Real tracked gap, surfaced by the Phase 4 investigation:** the website has no Profile/account page at all yet — needed eventually for cluster-claiming and likely other future features, worth its own planning pass when prioritized.

**Stack:** Next.js, chosen specifically because it handles both Phase 1's server-rendered/SEO-critical pages and Phase 2+'s fully interactive logged-in app well in one codebase — not just a default choice. Hosted on Vercel (pairs naturally with Next.js), connected to the already-owned `garagehunt.ca` domain. **Shared Supabase backend** — same project, same tables, no new backend service; the website is purely a second frontend.

---

## 14. Pre-Testing Polish Pass

Identified in a strategic review once core functionality was complete — none of these block anything already built, but all are worth doing before inviting real outside testers, since they're specifically about making the app feel exciting and complete, not just functional.

1. **Route Planner Auto-Suggest mode** — designed since early in this project (Section 4b, Mode 2), never actually built. Only manual pick exists today.
2. **First-time onboarding** — no introduction to Hot Listings, shopper tiers, or the treasure-hunt framing currently exists; a new user lands straight on Discover with zero context.
3. **Cold-start empty states** — a brand-new market with no sales nearby currently just shows "nothing here." Should instead actively invite the viewer to be the first seller.
4. **Proactive Hot Listing push notifications** — a listing crossing a tier threshold is currently only visible if the seller happens to open the app; should trigger a push ("🔥 Your listing just went Hot!") for re-engagement.
5. **Sharing/referral loop** — only a generic native share button exists today; no "invite a friend to hunt with you" or shareable-route mechanic.
6. **Final visual consistency audit** — several screens (Profile/avatar, delete-account modal, boost/Featured badges) were built directly by Claude Code later in the project without a fresh visual mockup pass; worth a full pass confirming everything still matches the masking-tape brand system consistently.
