// Sharing/invite features (feature spec Section 12b) — a custom URL scheme
// (garagehunt://), not full Universal Links: those need a real production
// domain with hosted verification files, which doesn't exist yet and
// belongs with the Companion Website work (Section 13) instead.
//
// No extra routing setup needed beyond app.config.ts's `scheme:
// 'garagehunt'` — Expo Router deep-links every file-based route
// automatically once a scheme is configured, so garagehunt://sale/[id]
// already resolves to app/sale/[id].tsx with zero additional linking
// config. Only testable from a real dev-client or standalone build —
// Expo Go only understands its own exp:// scheme, not a custom one.
export function buildSaleDeepLink(saleId: string): string {
  return `garagehunt://sale/${saleId}`;
}
