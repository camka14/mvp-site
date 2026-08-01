import { isValidGeocodeCoordinates, type GeocodeCoordinates } from '@/server/geocoding';
import type { AffiliateLocationSource } from './types';

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = nullableString(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

export const normalizeAffiliateCoordinates = (value: unknown): GeocodeCoordinates | null => {
  if (!isValidGeocodeCoordinates(value)) return null;
  return [Number(value[0]), Number(value[1])];
};

export const normalizeAffiliateLocationSource = (value: unknown): AffiliateLocationSource => (
  value === 'SOURCE_ORGANIZATION' ? 'SOURCE_ORGANIZATION' : 'CANDIDATE'
);

export const buildAffiliateSpecificEventLocationQueries = (params: {
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
}): string[] => {
  const venueName = nullableString(params.venueName);
  const address = nullableString(params.address);
  const city = nullableString(params.city);
  const specificAddress = address && (!city || address.toLowerCase() !== city.toLowerCase())
    ? address
    : null;
  const fullAddress = specificAddress && city && !specificAddress.toLowerCase().includes(city.toLowerCase())
    ? `${specificAddress}, ${city}`
    : specificAddress;

  return uniqueStrings([
    venueName && fullAddress && !fullAddress.toLowerCase().includes(venueName.toLowerCase())
      ? `${venueName}, ${fullAddress}`
      : null,
    fullAddress,
    venueName && city && !venueName.toLowerCase().includes(city.toLowerCase())
      ? `${venueName}, ${city}`
      : null,
    venueName,
  ]);
};

export const buildAffiliateEventLocationQueries = (params: {
  location?: string | null;
  address?: string | null;
  city?: string | null;
}): string[] => {
  const location = nullableString(params.location);
  const address = nullableString(params.address);
  const city = nullableString(params.city);
  const fullAddress = address && city && !address.toLowerCase().includes(city.toLowerCase())
    ? `${address}, ${city}`
    : address;

  return uniqueStrings([
    fullAddress,
    location && fullAddress && !fullAddress.toLowerCase().includes(location.toLowerCase())
      ? `${location}, ${fullAddress}`
      : null,
    location && city && !location.toLowerCase().includes(city.toLowerCase()) ? `${location}, ${city}` : null,
    city,
    location,
  ]);
};

export const buildAffiliatePlaceLocationQueries = (params: {
  name?: string | null;
  location?: string | null;
  address?: string | null;
  city?: string | null;
}): string[] => {
  const name = nullableString(params.name);
  const location = nullableString(params.location);
  const address = nullableString(params.address);
  const city = nullableString(params.city);
  const fullAddress = address && city && !address.toLowerCase().includes(city.toLowerCase())
    ? `${address}, ${city}`
    : address;

  return uniqueStrings([
    name && fullAddress && !fullAddress.toLowerCase().includes(name.toLowerCase()) ? `${name}, ${fullAddress}` : null,
    fullAddress,
    location && fullAddress && !fullAddress.toLowerCase().includes(location.toLowerCase())
      ? `${location}, ${fullAddress}`
      : null,
    name && city && name.toLowerCase() !== city.toLowerCase() ? `${name}, ${city}` : null,
    name && location && name.toLowerCase() !== location.toLowerCase() ? `${name}, ${location}` : null,
    location && city && !location.toLowerCase().includes(city.toLowerCase()) ? `${location}, ${city}` : null,
    city,
    location,
  ]);
};
