import { NextResponse } from 'next/server';
import { setAuthCookie } from '@/lib/authServer';

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  setAuthCookie(res, '');
  return res;
}
