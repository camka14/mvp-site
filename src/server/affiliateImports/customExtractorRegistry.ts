export type AffiliateCustomExtractorTargetKind = 'EVENT' | 'CLUB' | 'RENTAL';

export type AffiliateCustomExtractorDescriptor = {
  key: string;
  sourceKey: string;
  targetKinds: Array<AffiliateCustomExtractorTargetKind>;
  implementationPath: string;
};

// Keep this registry empty until a production custom extractor exists. The
// same registry is the only supported inventory signal for custom extractors.
export const AFFILIATE_CUSTOM_EXTRACTORS: AffiliateCustomExtractorDescriptor[] = [];

export const findCustomExtractorBySourceKey = (
  sourceKey: string | null | undefined,
): AffiliateCustomExtractorDescriptor | null => {
  const normalizedSourceKey = sourceKey?.trim();
  if (!normalizedSourceKey) return null;
  return AFFILIATE_CUSTOM_EXTRACTORS.find(
    (extractor) => extractor.sourceKey === normalizedSourceKey,
  ) ?? null;
};
