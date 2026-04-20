import { NextRequest } from 'next/server';
import { PATCH as patchMatch } from '../route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  const body = await req.json().catch(() => null);
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/\/incidents$/, '');
  const forwarded = new NextRequest(url, {
    method: 'PATCH',
    headers: req.headers,
    body: JSON.stringify({
      incidentOperations: [{
        ...(body ?? {}),
        action: 'CREATE',
      }],
    }),
  });
  return patchMatch(forwarded, { params });
}
