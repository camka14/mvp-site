export interface SensitiveUserLookup {
  exists: boolean;
  userId?: string;
  sensitiveUserId?: string;
}

export async function lookupSensitiveUserByEmail(_email: string): Promise<SensitiveUserLookup> {
  return { exists: false };
}

export async function upsertSensitiveUser(_email: string, _userId: string): Promise<void> {
  return;
}
