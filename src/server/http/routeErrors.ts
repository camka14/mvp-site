import { NextResponse } from 'next/server';

export const handleRouteError = (error: unknown, message: string): Response => {
  if (error instanceof Response) {
    return error;
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

  console.error(message, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};
