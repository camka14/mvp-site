import { NextResponse } from 'next/server';
import { isOrganizationClaimError } from './service';

export const organizationClaimErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof Response) {
    return new NextResponse(error.body, {
      status: error.status,
      statusText: error.statusText,
      headers: error.headers,
    });
  }
  if (isOrganizationClaimError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error('Unhandled organization claim error', error);
  return NextResponse.json(
    { error: 'Organization ownership request failed.', code: 'ORGANIZATION_CLAIM_INTERNAL_ERROR' },
    { status: 500 },
  );
};
