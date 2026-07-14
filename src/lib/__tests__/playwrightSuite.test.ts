/** @jest-environment node */

import { readdirSync } from 'node:fs';
import path from 'node:path';

describe('default Playwright suite', () => {
  it('does not include assertion-free debug probes as passing end-to-end specs', () => {
    const e2eDirectory = path.join(process.cwd(), 'e2e');
    const debugSpecs = readdirSync(e2eDirectory)
      .filter((fileName) => /^debug-.*\.spec\.ts$/i.test(fileName))
      .sort();

    expect(debugSpecs).toEqual([]);
  });
});
