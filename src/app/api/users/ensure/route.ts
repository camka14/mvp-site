import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Account creation by arbitrary email must occur only inside an already
 * authorized team, event, or organization invitation flow. Keeping this
 * generic endpoint alive lets any authenticated caller create account rows
 * for unrelated people.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use an authorized scoped invitation flow.' },
    { status: 410 },
  );
}
