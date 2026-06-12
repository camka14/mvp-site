import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'SMS MFA setup is not enabled. Use the authenticator QR setup flow.',
      code: 'SMS_MFA_DISABLED',
    },
    { status: 410 },
  );
}
