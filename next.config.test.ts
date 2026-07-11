import fs from 'node:fs';
import path from 'node:path';

describe('Next configuration', () => {
  it('suppresses the development indicator for OBS Browser Sources', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');

    expect(config).toMatch(/devIndicators:\s*false/);
  });
});
