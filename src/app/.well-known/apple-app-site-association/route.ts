import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const body = {
  applinks: {
    details: [
      {
        appIDs: [
          '427LTWF4US.com.razumly.mvp',
        ],
        components: [
          {
            '/': '/*',
            comment: 'Match all routes on mvp.razumly.com',
          },
        ],
      },
    ],
  },
};

export async function GET() {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}
