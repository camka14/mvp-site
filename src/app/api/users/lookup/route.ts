import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Email-to-account lookup is not a public application capability. Scoped
 * invitation routes resolve accounts only after proving authority over the
 * relevant team, event, or organization.
 */
const retired = () => NextResponse.json(
  { error: 'This endpoint has been retired. Use an authorized scoped invitation flow.' },
  { status: 410 },
);

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}
