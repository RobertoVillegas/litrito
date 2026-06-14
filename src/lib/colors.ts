// Design-system color tokens. Prefer CSS variables so theming stays in one
// place (styles.css), but expose the raw hex values when inline styles or
// external libraries (e.g. recharts) need them.

export const COLORS = {
  brand: '#e60000',
  brandDark: '#b80000',
  cheap: '#10b981',
  ink: '#25282b',
  inkSoft: '#3a3e42',
  canvas: '#ffffff',
  canvasSoft: '#f2f2f2',
  body: '#7e7e7e',
  mute: '#bebebe',
  line: '#e6e6e6',
  onDark: '#ffffff',
} as const
