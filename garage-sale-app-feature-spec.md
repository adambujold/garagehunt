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

1. Download app → Sign up (email, phone, or social login)
2. Choose home location (postal code / city) — sets default map center & notification radius
3. Optional: choose interests (categories they usually shop for) — powers personalized alerts later
4. Land on **Map/Discover** home screen

---

## 3. Seller Flow — "List My Sale"

**Goal:** Get a sale live in under 3 minutes.

1. Tap **"+ List a Sale"**
2. **Location** — auto-pulled from device GPS or manually entered address (street-level, not exact pin optional for privacy until day-of)
3. **Date range & time** — a start date and end date (e.g., Sat–Sun), with one shared daily time window (e.g., 9am–2pm) applied across every day in the range. A single-day sale is simply a range where start date = end date — no separate "add another day" step needed.
4. **Photos** — upload up to 10 (teaser shots of items, signage, etc.)
5. **Categories carried** — multi-select tags:
   - Furniture, Kids/Baby, Clothing, Tools, Electronics, Sporting Goods, Books/Media, Kitchenware, Antiques/Collectibles, Garden/Outdoor, Other
   - **Selecting "Other" reveals a tag-style text input** — *"What else are you bringing?"* Typing something and pressing return/enter adds it as a removable bubble/chip, and the field clears for the next entry, so a seller can add several other items (e.g., "guitar," "vinyl records," "power tools") rather than being limited to one. These entries are stored as a list on the listing and feed into the same keyword-matching pipeline as the description (see 4c) — not just appended as plain text.
6. **Title** (optional) — a short, editable headline for the listing (e.g., "Huge Moving Sale — Furniture & Tools"). If left blank, defaults to an auto-derived title from the address (e.g., "Maple Street garage sale"), as it does today — this is a new field, not a change to existing default behavior.
7. **Description** — free text (optional): "Moving sale, everything must go," etc.
8. **AI-assisted title & description ("✨ Get AI suggestions"):** a button on this step generates a suggested title and description from whatever the seller's already provided (selected categories, any "Other" tags), plus one optional free-text prompt for anything else to mention. The seller sees the suggestion and can **accept, edit, or regenerate** — nothing is inserted without them seeing and approving it. This calls Anthropic's Claude API via a Supabase Edge Function (keeps the API key secret server-side, never bundled in the app). **Regeneration is rate-limited per user** (e.g., a handful per hour) — same cost/abuse-protection philosophy already applied to route requests, since this is a real pay-per-use API call, not free.
9. **Join a town-wide event?** — if an Organizer has created an event in their area/date, seller can request to be added to it
10. Review → **Publish**
11. Confirmation screen: "Your sale is live!" with share-to-social option

**Sale lifecycle states:** Draft → Scheduled → Live (auto-flips on start date/time) → Ended (auto-archives) → (optional) Sold Out/Cancelled toggle

**Editing a published listing:** Sellers can edit a Scheduled or Live listing at any time — this matters in practice, since a two-day sale often needs updates between days (e.g., "Day 2: table sold, still have the tools"). Editable fields: photos, categories, description, title, and the date range itself (extend to add a day, or shorten if everything sold early). **Address is locked from editing after publish** — changing a live listing's location silently is a safety/trust risk, so an address correction requires re-submitting through review rather than a direct edit.

---

## 4. Buyer Flow — "Find Sales"

### 4a. Discover / Map View (home screen)
- Map with pins for all sales in radius (default: user's set radius, adjustable)
- Toggle: **List view** vs **Map view**
- Filters: date (today/this weekend/custom), category, distance, "town-wide events only"
- Each pin/card shows: thumbnail photo, distance, categories, time window

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

## 5. Town-Wide Sale Events (Organizer Flow)

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
- Display name, avatar/photo
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

All of the following are included in MVP or Phase 1 build:

1. **Automated photo screening** on upload (image moderation API) to catch explicit/inappropriate content before a listing goes live.
2. **Automated text screening** on the description field — profanity/spam filter, plus pattern-flagging for common scam language (e.g., requests for e-transfer deposits, "ship to me" requests — atypical for a local garage sale).
3. **User reporting** on both listings and individual photos, with categories: inappropriate content, scam, wrong/fake address, fake listing.
4. **Manual review queue** for anything auto-flagged or user-reported — same-day turnaround target given listings are time-sensitive.
5. **Organizer verification** includes an actual identity check (not just email verification), given organizers get elevated permissions (creating events, managing multiple sellers).
6. **Account-level trust signals** — a new account's first listing gets a light review pass before publishing; established accounts with a clean history publish instantly.
7. **Organizer approval process** — at launch/low volume, handled manually rather than through a paid ID-verification service:
   - Applicant submits: full name, SMS-verified phone (reused from signup), the neighborhood/association they represent, and either a formal affiliation (resident association, BIA) or informal vouching (names of neighbors, link to an existing community group/listserv).
   - A person on the team manually reviews and approves — realistic at low application volume, avoids the cost/integration effort of a paid identity-verification API (e.g., Stripe Identity, Persona) before it's actually needed.
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

**Related pre-launch checklist item:** Supabase email confirmation was disabled during development for faster testing (Authentication → Providers → Email → "Confirm email" toggled off). **Must be re-enabled before real launch** — without it, anyone can sign up with a fake, non-existent email address.

---

## 12. Next Phase — Actual Build

**Status:** Design and architecture phases complete (screens, feature spec, data model, auth/security). Not yet started: real React Native code, backend deployment, live Mapbox/Supabase integration, App Store/Play Store publishing.

**Decision:** Deferred for now. To revisit: whether to set up a local dev environment and build incrementally in this project, hand the completed spec/architecture to a contractor/developer, or explore no-code/low-code tooling.

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
