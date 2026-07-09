// react-native-google-mobile-ads has no web target — see discover-ad-card.tsx's
// header comment. There's no meaningful ad to show in a browser build of this
// app, so this is a plain no-op rather than a fake placeholder (unlike
// discover-map.web.tsx's illustrative stand-in, an empty ad slot has nothing
// useful to illustrate).
export function DiscoverAdCard() {
  return null;
}
