import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ALBION_HURRICANES_MANUAL_CANDIDATES,
  ALBION_HURRICANES_MAPPING,
  ALBION_HURRICANES_SOURCE_EVIDENCE,
} from '../albionHurricanesFcSource';

describe('Albion Hurricanes FC affiliate source', () => {
  test('emits one ongoing Houston youth soccer club candidate', () => {
    expect(ALBION_HURRICANES_MANUAL_CANDIDATES).toHaveLength(1);
    expect(ALBION_HURRICANES_MANUAL_CANDIDATES[0]).toMatchObject({
      listingKind: 'CLUB',
      title: 'Albion Hurricanes FC',
      city: 'Houston, TX',
      dateDisplayMode: 'ONGOING',
      logoSourceUrl: 'https://irp.cdn-website.com/efc7d580/dms3rep/multi/opt/AHFC+Logo-1920w.png',
    });
    expect(ALBION_HURRICANES_MAPPING.kind).toBe('CLUB');
  });

  test('keeps ALLOWED provenance and withholds stale or unchecked rows', () => {
    expect(ALBION_HURRICANES_SOURCE_EVIDENCE.complianceStatus).toBe('ALLOWED');
    expect(ALBION_HURRICANES_SOURCE_EVIDENCE.runStatus).toBe('PARTIAL');
    expect(ALBION_HURRICANES_MANUAL_CANDIDATES[0].warnings).toContain(
      'The stored 2026 Spring Season remainder is past at review time. Registration, tryout, camp, tournament, facility, and other detail pages are UNCHECKED and no dated EVENT, RENTAL, or TEAM candidate is created.',
    );
  });

  test('supports guarded live application and relinks the club candidate', async () => {
    const setupScript = await readFile(
      path.join(process.cwd(), 'scripts/setup-albion-hurricanes-fc-affiliate-source.ts'),
      'utf8',
    );
    expect(setupScript).toContain("const useLive = process.argv.includes('--live')");
    expect(setupScript).toContain('DATABASE_URL_LIVE is missing.');
    expect(setupScript).toContain('publishedOrganizationId: ORG_ID');
    expect(setupScript).not.toContain('local-only and refuses --live');
  });
});
