// Thin wrapper around Umami's global `umami.track`. Safe to call anywhere:
// no-ops during SSR and when the Umami script hasn't loaded (e.g. local dev
// without a configured website id, or an ad-blocker). Custom events show up in
// the Umami dashboard alongside the automatic pageview tracking.
type EventData = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: EventData) => void
    }
  }
}

export function track(event: string, data?: EventData) {
  if (typeof window === 'undefined') return
  try {
    window.umami?.track(event, data)
  } catch {
    // Never let analytics break a user flow.
  }
}

export {}
