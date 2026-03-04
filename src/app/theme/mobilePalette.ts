export const MOBILE_APP_SEED_COLOR = '#6ABDFF' as const;

/*
 * Derived from the mobile app's Material 3 dynamic theme:
 * seed #6ABDFF + PaletteStyle.Neutral (light scheme roles).
 */
export const MOBILE_APP_MATCH_DETAIL_GRADIENT = {
  start: '#d4e4f6', // tertiaryContainer
  end: '#d9e4f0', // primaryContainer
} as const;

export const MOBILE_APP_MANTINE_PRIMARY_SCALE = [
  '#e7f2ff',
  '#d9e4f0',
  '#bdc8d4',
  '#a2acb8',
  '#87929d',
  '#6e7883',
  '#555f6a',
  '#3e4852',
  '#28313b',
  '#131d26',
] as const;

export const MOBILE_APP_THEME_TOKENS = {
  background: '#fbf9fa',
  surface: '#ffffff',
  surfaceMuted: '#f5f3f4',
  border: '#c8c6c7',
  text: '#1b1c1d',
  textMuted: '#474748',
  primary: '#555f6a',
  primaryHover: '#3e4852',
  primaryForeground: '#ffffff',
  primarySoft: '#d9e4f0',
  matchGradientStart: MOBILE_APP_MATCH_DETAIL_GRADIENT.start,
  matchGradientEnd: MOBILE_APP_MATCH_DETAIL_GRADIENT.end,
  success: '#1f8b63',
  successSoft: '#dff7ef',
  danger: '#c93f52',
  dangerSoft: '#ffe7eb',
} as const;

/*
 * Provided for teams using MUI components in this repository.
 * Keeps naming aligned with Material UI's palette structure.
 */
export const MOBILE_APP_MUI_PALETTE = {
  primary: {
    light: '#87929d',
    main: MOBILE_APP_THEME_TOKENS.primary,
    dark: MOBILE_APP_THEME_TOKENS.primaryHover,
    contrastText: MOBILE_APP_THEME_TOKENS.primaryForeground,
  },
  secondary: {
    light: '#dee3eb',
    main: '#595f65',
    dark: '#3e4852',
    contrastText: '#ffffff',
  },
  background: {
    default: MOBILE_APP_THEME_TOKENS.background,
    paper: MOBILE_APP_THEME_TOKENS.surface,
  },
  text: {
    primary: MOBILE_APP_THEME_TOKENS.text,
    secondary: MOBILE_APP_THEME_TOKENS.textMuted,
  },
} as const;

export const MOBILE_APP_AVATAR_PALETTE = [
  { bg: '#FDE68A', text: '#92400E' },
  { bg: '#BFDBFE', text: '#1D4ED8' },
  { bg: '#BBF7D0', text: '#166534' },
  { bg: '#FED7AA', text: '#9A3412' },
  { bg: '#E9D5FF', text: '#6B21A8' },
  { bg: '#FBCFE8', text: '#9D174D' },
  { bg: '#BAE6FD', text: '#0C4A6E' },
  { bg: '#C7D2FE', text: '#3730A3' },
] as const;
