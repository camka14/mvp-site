import type { CSSProperties } from 'react';

export type EntityColorPair = { bg: string; text: string };
export type EntityColorReferenceValue = string | null | undefined;

const DEFAULT_ENTITY_COLOR_SEED = 'BracketIQ';
const ENTITY_COLOR_INDEX_BASE_HUE = 207;
const ENTITY_COLOR_INDEX_SLOT_COUNT = 16;
const ENTITY_COLOR_INDEX_ORDER_STEP = 7;
const ENTITY_COLOR_BG_LIGHTNESS = 0.74;
const ENTITY_COLOR_BG_CHROMA = 0.12;
const ENTITY_COLOR_TEXT_LIGHTNESS = 0.27;
const ENTITY_COLOR_TEXT_CHROMA = 0.1;

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

export const normalizeEntityColorKey = (value?: EntityColorReferenceValue): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized;
};

const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const toSrgbChannel = (linearValue: number): number => {
  const clamped = clampUnit(linearValue);
  if (clamped <= 0.0031308) {
    return clamped * 12.92;
  }
  return 1.055 * (clamped ** (1 / 2.4)) - 0.055;
};

const toHexChannel = (value: number): string => {
  const channel = Math.round(clampUnit(value) * 255);
  return channel.toString(16).padStart(2, '0').toUpperCase();
};

export const oklchToHex = (lightness: number, chroma: number, hue: number): string => {
  const hueRadians = (normalizeHue(hue) * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const red = toSrgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = toSrgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = toSrgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
};

const buildEntityColorPair = (hue: number): EntityColorPair => ({
  bg: oklchToHex(ENTITY_COLOR_BG_LIGHTNESS, ENTITY_COLOR_BG_CHROMA, hue),
  text: oklchToHex(ENTITY_COLOR_TEXT_LIGHTNESS, ENTITY_COLOR_TEXT_CHROMA, hue),
});

export const getEntityColorPair = (seed?: string | null): EntityColorPair => {
  const hue = hashEntityString(normalizeEntityColorSeed(seed)) % 360;
  return buildEntityColorPair(hue);
};

export const getIndexedEntityColorPair = (index: number): EntityColorPair => {
  const normalizedIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const slot = normalizedIndex % ENTITY_COLOR_INDEX_SLOT_COUNT;
  const cycle = Math.floor(normalizedIndex / ENTITY_COLOR_INDEX_SLOT_COUNT);
  const orderedSlot = (slot * ENTITY_COLOR_INDEX_ORDER_STEP) % ENTITY_COLOR_INDEX_SLOT_COUNT;
  const hueStep = 360 / ENTITY_COLOR_INDEX_SLOT_COUNT;
  const hue = normalizeHue(ENTITY_COLOR_INDEX_BASE_HUE + orderedSlot * hueStep + cycle * (hueStep / 2));
  return buildEntityColorPair(hue);
};

export const getOrderedEntityColorPair = (
  referenceList?: EntityColorReferenceValue[] | null,
  matchKey?: EntityColorReferenceValue,
): EntityColorPair => {
  const normalizedMatchKey = normalizeEntityColorKey(matchKey);
  if (!normalizedMatchKey || !Array.isArray(referenceList) || referenceList.length === 0) {
    return getEntityColorPair(matchKey ?? null);
  }

  const matchIndex = referenceList.findIndex((referenceValue) => (
    normalizeEntityColorKey(referenceValue) === normalizedMatchKey
  ));
  if (matchIndex < 0) {
    return getEntityColorPair(matchKey ?? null);
  }

  return getIndexedEntityColorPair(matchIndex);
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
