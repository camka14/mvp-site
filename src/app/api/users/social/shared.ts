import { NextResponse } from 'next/server';
import { SocialGraphError } from '@/server/socialGraph';

export const toSocialErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof SocialGraphError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Social route failed', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};
