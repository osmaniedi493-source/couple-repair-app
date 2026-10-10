/**
 * Some mobile browsers on this project have been seen to silently fail to
 * apply Next.js client-side route transitions (`router.replace`/`router.push`)
 * while still updating history state, leaving the old page visible. A full
 * navigation is slower but always actually moves the page, so critical
 * "leave this page now" transitions use this instead of the App Router.
 */
export function hardNavigate(path: string) {
  window.location.href = path;
}
