import { existsSync } from 'node:fs';
import { join } from 'node:path';

const retiredClientAliases = [
  'src/app/api/billing/billing_intent/route.ts',
  'src/app/api/billing/billing-intent/route.ts',
  'src/app/api/billing/purchase_intent/route.ts',
  'src/app/api/billing/create_purchase_intent/route.ts',
  'src/app/api/users/invite-email/route.ts',
  'src/app/api/users/invite-by-email/route.ts',
  'src/app/api/users/invite_by_email/route.ts',
  'src/app/api/users/exists/route.ts',
  'src/app/api/users/exists-by-email/route.ts',
  'src/app/api/users/lookup-by-email/route.ts',
] as const;

describe('retired pre-1.6.13 client route aliases', () => {
  it.each(retiredClientAliases)('%s is absent from the App Router source tree', (relativePath) => {
    expect(existsSync(join(process.cwd(), relativePath))).toBe(false);
  });

  it('retains the BoldSign callback alias because it is an external provider endpoint', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/boldsign/webhook/route.ts'))).toBe(true);
  });
});
