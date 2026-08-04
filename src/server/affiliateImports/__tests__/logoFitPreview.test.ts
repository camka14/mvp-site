import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AFFILIATE_LOGO_FIT_MARKER,
  assertAffiliateLogoFitSelection,
  buildAffiliateLogoFitOrganizationWhere,
  inspectAffiliateLogoFitPreview,
  parseAffiliateLogoFitOptions,
  removeAffiliateLogoFitPreview,
  writeAffiliateLogoFitMarker,
} from '../logoFitPreview';

describe('affiliate logo fit preview controls', () => {
  test('requires one organization unless the caller explicitly requests all', () => {
    expect(() => parseAffiliateLogoFitOptions(['--live'], '/repo')).toThrow(
      'Supply --organization-id=<exact-organization-id>',
    );
    expect(() => parseAffiliateLogoFitOptions([
      '--organization-id=affiliate_org_one',
      '--all',
    ], '/repo')).toThrow('--organization-id and --all cannot be used together.');

    expect(parseAffiliateLogoFitOptions([
      '--live',
      '--organization-id=affiliate_org_one',
      '--output=tmp/one-logo-fit',
    ], '/repo')).toEqual({
      useLive: true,
      outputRoot: '/repo/tmp/one-logo-fit',
      scope: { mode: 'ORGANIZATION', organizationId: 'affiliate_org_one' },
    });
    expect(parseAffiliateLogoFitOptions(['--all'], '/repo').scope).toEqual({ mode: 'ALL' });
    expect(() => parseAffiliateLogoFitOptions([
      '--organization-id=affiliate_org_one',
      '--output=/',
    ], '/repo')).toThrow('Broad output paths are refused');
    expect(() => parseAffiliateLogoFitOptions([
      '--organization-id=affiliate_org_one',
      '--output=output/preview',
    ], '/repo')).toThrow('must name a specific logo-fit directory');
  });

  test('builds an exact organization query for a scoped preview', () => {
    expect(buildAffiliateLogoFitOrganizationWhere({
      mode: 'ORGANIZATION',
      organizationId: 'affiliate_org_one',
    })).toEqual({ id: 'affiliate_org_one', logoId: { not: null } });
    expect(buildAffiliateLogoFitOrganizationWhere({ mode: 'ALL' })).toEqual({
      id: { startsWith: 'affiliate_org_' },
      logoId: { not: null },
    });
  });

  test('fails a scoped preview when the exact organization logo is unavailable', () => {
    const scope = { mode: 'ORGANIZATION' as const, organizationId: 'affiliate_org_one' };
    expect(() => assertAffiliateLogoFitSelection(scope, [])).toThrow(
      'was not found or does not have an assigned logo',
    );
    expect(() => assertAffiliateLogoFitSelection(scope, [{ id: 'affiliate_org_two' }]))
      .toThrow('was not found or does not have an assigned logo');
    expect(() => assertAffiliateLogoFitSelection(scope, [{ id: 'affiliate_org_one' }]))
      .not.toThrow();
  });

  test('dry-runs and removes only a marked complete preview directory', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'logo-fit-preview-test-'));
    const preview = path.join(parent, 'affiliate-logo-fit-one');
    const unrelated = path.join(parent, 'unrelated');
    try {
      await fs.mkdir(path.join(preview, 'assets'), { recursive: true });
      await fs.writeFile(path.join(preview, 'index.html'), '<html></html>');
      await fs.writeFile(path.join(preview, 'report.json'), '[]\n');
      await writeAffiliateLogoFitMarker(preview, {
        completedAt: '2026-08-04T20:00:00.000Z',
        previewCount: 0,
        scope: { mode: 'ORGANIZATION', organizationId: 'affiliate_org_one' },
      });
      await fs.mkdir(unrelated);

      const inspection = await inspectAffiliateLogoFitPreview(preview);
      expect(inspection.marker.generatedCopiesOnly).toBe(true);
      expect(inspection.bytes).toBeGreaterThan(0);

      const dryRun = await removeAffiliateLogoFitPreview(preview, { apply: false });
      expect(dryRun.removed).toBe(false);
      await expect(fs.stat(preview)).resolves.toBeDefined();
      await expect(inspectAffiliateLogoFitPreview(unrelated)).rejects.toThrow(
        AFFILIATE_LOGO_FIT_MARKER,
      );

      const applied = await removeAffiliateLogoFitPreview(preview, { apply: true });
      expect(applied.removed).toBe(true);
      await expect(fs.stat(preview)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });
});
