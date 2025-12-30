import { NextRequest, NextResponse } from 'next/server';
import { Client, ExecutionMethod, Functions } from 'appwrite';

const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID;

const resolveIpAddress = (request: NextRequest): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const candidate = forwarded.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  return '127.0.0.1';
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const templateId = typeof body?.templateId === 'string' ? body.templateId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  const eventId = typeof body?.eventId === 'string' ? body.eventId : undefined;
  const userId = typeof body?.userId === 'string' ? body.userId : undefined;
  const user = body?.user;
  const type = typeof body?.type === 'string' ? body.type : undefined;

  if (!templateId || !documentId) {
    return NextResponse.json(
      { error: 'templateId and documentId are required.' },
      { status: 400 },
    );
  }

  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !FUNCTION_ID) {
    return NextResponse.json(
      { error: 'Appwrite configuration is missing.' },
      { status: 500 },
    );
  }

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);
  const functions = new Functions(client);
  const ipAddress = resolveIpAddress(request);

  try {
    const execution = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: '/documents/signed',
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        templateId,
        documentId,
        eventId,
        userId,
        user,
        type,
        ipAddress,
      }),
      async: false,
    });

    const responseBody = execution.responseBody || '{}';
    const result = JSON.parse(responseBody) as { error?: string };
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to record signature.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
