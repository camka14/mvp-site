type LegacyOfficialCheckInUpdate = {
  officialCheckIn?: unknown;
  officialCheckedIn?: boolean;
};

type LegacyOfficialCheckInAccess = {
  isHostOrAdmin: boolean;
  isOfficial: boolean;
};

/**
 * Older mobile clients send a complete match update to check in an assigned
 * official. Keep that request compatible, but reduce it to the one operation
 * the official is authorized to perform.
 */
export const normalizeLegacyOfficialCheckIn = <T extends LegacyOfficialCheckInUpdate>(
  update: T,
  access: LegacyOfficialCheckInAccess,
): T => {
  const isLegacyOfficialCheckIn =
    !access.isHostOrAdmin &&
    access.isOfficial &&
    update.officialCheckIn === undefined &&
    update.officialCheckedIn === true;

  if (!isLegacyOfficialCheckIn) {
    return update;
  }

  return { officialCheckIn: { checkedIn: true } } as T;
};
