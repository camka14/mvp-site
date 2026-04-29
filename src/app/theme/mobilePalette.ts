export const MOBILE_APP_SEED_COLOR = '#19497A' as const;

/*
 * Derived from composeApp ThemeTokens.kt (LightAppColorScheme / LightAppExtendedColors).
 */
export const MOBILE_APP_MATCH_DETAIL_GRADIENT = {
  start: '#EFE7D1', // tertiaryContainer
  end: '#DCEAF7', // primaryContainer
} as const;

export const MOBILE_APP_MANTINE_PRIMARY_SCALE = [
  '#EEF5FB',
  '#DCEAF7',
  '#BFD2E6',
  '#8EB8DE',
  '#6AA0CF',
  '#19497A',
  '#294867',
  '#213244',
  '#10263B',
  '#0B1A2B',
] as const;

export const MOBILE_APP_THEME_TOKENS = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceMuted: '#F2F5F8',
  border: '#D3DCE6',
  text: '#1E2633',
  textMuted: '#5E6B78',
  primary: '#19497A',
  primaryHover: '#163F69',
  primaryForeground: '#FFFFFF',
  primarySoft: '#DCEAF7',
  matchGradientStart: MOBILE_APP_MATCH_DETAIL_GRADIENT.start,
  matchGradientEnd: MOBILE_APP_MATCH_DETAIL_GRADIENT.end,
  success: '#1F8B63',
  successSoft: '#DFF7EF',
  danger: '#C93F52',
  dangerSoft: '#FFE7EB',
  premiumAccent: '#B6A676',
  liveAccent: '#DE7837',
  placeholderReadable: '#6B7785',
  disabledReadable: '#5E6B78',
  sharedScrim: 'rgba(14, 26, 38, 0.6)',
} as const;

/*
 * Provided for teams using MUI components in this repository.
 * Keeps naming aligned with Material UI's palette structure.
 */
export const MOBILE_APP_MUI_PALETTE = {
  primary: {
    light: '#8EB8DE',
    main: MOBILE_APP_THEME_TOKENS.primary,
    dark: '#294867',
    contrastText: MOBILE_APP_THEME_TOKENS.primaryForeground,
  },
  secondary: {
    light: '#EEF5FB',
    main: '#BFD2E6',
    dark: '#213244',
    contrastText: '#1E2633',
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
