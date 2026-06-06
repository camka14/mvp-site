import { NextResponse } from 'next/server';

const getStatusErrorPayload = (error: unknown): { status: number; message: string } | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const record = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(record.status ?? record.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    return null;
  }
  const message = typeof record.message === 'string' && record.message.trim().length > 0
    ? record.message.trim()
    : 'Request failed';
  return { status, message };
};

export const handleRouteError = (error: unknown, message: string): Response => {
  if (error instanceof Response) {
    return error;
  }

  const statusError = getStatusErrorPayload(error);
  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: statusError.status });
  }

  console.error(message, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};

export const handleApiRouteError = async (error: unknown, message: string): Promise<Response> => {
  if (error instanceof Response) {
    const contentType = error.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = await error.clone().json().catch(() => null);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return NextResponse.json(payload, { status: error.status });
      }
    }

    const text = await error.clone().text().catch(() => '');
    const normalizedMessage = text.trim() || error.statusText || 'Request failed';
    return NextResponse.json({ error: normalizedMessage }, { status: error.status });
  }

  const statusError = getStatusErrorPayload(error);
  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: statusError.status });
  }

  console.error(message, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};
