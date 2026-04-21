import { NextResponse } from 'next/server';

export const handleRouteError = (error: unknown, message: string): Response => {
  if (error instanceof Response) {
    return error;
  }

  console.error(message, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};
