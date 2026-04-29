import type { CSSProperties } from 'react';

import { MOBILE_APP_AVATAR_PALETTE } from '@/app/theme/mobilePalette';

export type EntityColorPair = { bg: string; text: string };

const DEFAULT_ENTITY_COLOR_SEED = 'BracketIQ';
const DEFAULT_ENTITY_COLOR_PAIR = MOBILE_APP_AVATAR_PALETTE[0];

export const hashEntityString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const normalizeEntityColorSeed = (seed?: string | null): string => {
  const normalized = typeof seed === 'string' ? seed.trim() : '';
  return normalized.length > 0 ? normalized : DEFAULT_ENTITY_COLOR_SEED;
};

export const getEntityColorPair = (seed?: string | null): EntityColorPair => {
  const palette = MOBILE_APP_AVATAR_PALETTE;
  if (!palette.length) {
    return DEFAULT_ENTITY_COLOR_PAIR;
  }

  const paletteIndex = hashEntityString(normalizeEntityColorSeed(seed)) % palette.length;
  return palette[paletteIndex] ?? DEFAULT_ENTITY_COLOR_PAIR;
};

export type EntityColorCssVariables = CSSProperties & {
  '--entity-color-bg': string;
  '--entity-color-text': string;
  '--entity-color-border': string;
};

export const getEntityColorCssVariables = (seed?: string | null): EntityColorCssVariables => {
  const colors = getEntityColorPair(seed);
  return {
    '--entity-color-bg': colors.bg,
    '--entity-color-text': colors.text,
    '--entity-color-border': colors.bg,
  };
};
