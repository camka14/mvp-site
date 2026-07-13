/** @jest-environment node */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('generated Prisma schema guard', () => {
  it('accepts the canonical schema and generated client', () => {
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts', 'check-prisma-generated.mjs')],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(output).toContain('Prisma schema surface verified');
  });
});
