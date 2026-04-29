import { normalizeEntityColorKey, type EntityColorReferenceValue } from './entityColors';

export const buildUniqueColorReferenceList = (
  values: EntityColorReferenceValue[],
): string[] => {
  const seenKeys = new Set<string>();
  const referenceList: string[] = [];

  values.forEach((value) => {
    const rawValue = typeof value === 'string' ? value.trim() : '';
    const normalizedKey = normalizeEntityColorKey(rawValue);
    if (!rawValue || !normalizedKey || seenKeys.has(normalizedKey)) {
      return;
    }

    seenKeys.add(normalizedKey);
    referenceList.push(rawValue);
  });

  return referenceList;
};
