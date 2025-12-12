import { databases, functions } from '@/app/appwrite';
import { ExecutionMethod } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const SENSITIVE_USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_SENSITIVE_USERS_TABLE_ID;
const SERVER_FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

export interface SensitiveUserLookup {
  exists: boolean;
  userId?: string;
  sensitiveUserId?: string;
}

export async function lookupSensitiveUserByEmail(email: string): Promise<SensitiveUserLookup> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !SERVER_FUNCTION_ID) {
    return { exists: false };
  }

  try {
    const response = await functions.createExecution({
      functionId: SERVER_FUNCTION_ID,
      xpath: '/users/lookup-by-email',
      method: ExecutionMethod.POST,
      async: false,
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const parsed = response.responseBody ? JSON.parse(response.responseBody) : {};
    if (parsed.error) {
      console.warn('User lookup by email failed', parsed.error);
      return { exists: false };
    }
    if (parsed.exists && typeof parsed.userId === 'string') {
      return {
        exists: true,
        userId: parsed.userId,
        sensitiveUserId: typeof parsed.sensitiveUserId === 'string' ? parsed.sensitiveUserId : undefined,
      };
    }
  } catch (err) {
    console.warn('User lookup by email failed', err);
  }
  return { exists: false };
}

export async function upsertSensitiveUser(email: string, userId: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !userId || !SENSITIVE_USERS_TABLE_ID) return;
  try {
    await databases.upsertRow({
      databaseId: DATABASE_ID,
      tableId: SENSITIVE_USERS_TABLE_ID,
      rowId: userId,
      data: { userId, email: normalizedEmail },
    });
  } catch (err) {
    console.warn('Failed to upsert sensitive user data', err);
  }
}
