const normalizeOrganizationName = (organizationName?: string | null): string | null => {
  const trimmed = typeof organizationName === 'string' ? organizationName.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
};

export const buildOrganizationUsersSubtitle = (organizationName?: string | null): string => {
  const normalizedName = normalizeOrganizationName(organizationName);
  if (!normalizedName) {
    return "Members from this organization's events, plus hosts and staff from rental events using its fields.";
  }
  return `Members from ${normalizedName} events, plus hosts and staff from rental events using ${normalizedName} fields.`;
};
