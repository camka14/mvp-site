import { NextRequest, NextResponse } from 'next/server';
import { Account, Client } from 'appwrite';

const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required.' },
      { status: 400 },
    );
  }

  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
    return NextResponse.json(
      { error: 'Appwrite configuration is missing.' },
      { status: 500 },
    );
  }

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);
  const account = new Account(client);

  try {
    const session = await account.createEmailPasswordSession({ email, password });
    if (session?.$id) {
      client.setSession(session.$id);
      try {
        await account.deleteSession({ sessionId: session.$id });
      } catch (error) {
        // Best-effort cleanup so the confirmation doesn't create a lingering session.
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to confirm password.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
