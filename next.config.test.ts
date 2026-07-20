import fs from 'node:fs';
import path from 'node:path';

describe('Next configuration', () => {
  it('suppresses the development indicator for OBS Browser Sources', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');

    expect(config).toMatch(/devIndicators:\s*false/);
  });

  it('keeps guide and blog MDX source available to the Markdown page renderer', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');

    expect(config).toContain("'/llms/page': ['./src/content/blog/*.mdx']");
  });
});
