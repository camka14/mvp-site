import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('team roster player card grid styles', () => {
  it('keeps roster player cards within compact min and max widths', () => {
    const rule = globalsCss.match(/\.team-roster-player-grid\s*\{[^}]+\}/)?.[0] ?? '';
    const itemRule = globalsCss.match(/\.team-roster-player-grid > \*\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rule).toContain('repeat(auto-fit');
    expect(rule).toContain('17.5rem');
    expect(rule).toContain('1fr');
    expect(itemRule).toContain('max-width: 22rem');
    expect(rule).toContain('justify-content: start');
  });
});
