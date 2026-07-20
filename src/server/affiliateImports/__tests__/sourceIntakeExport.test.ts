import {
  affiliateSiteIntakeKeyForUrl,
  buildAffiliateSourceEvidence,
  renderAffiliateSourceEvidenceMarkdown,
  selectAffiliateSourceIntakeExportRun,
} from '../sourceIntakeExport';

describe('affiliate source intake export helpers', () => {
  it('derives the bootstrapped live intake key from a public URL', () => {
    expect(affiliateSiteIntakeKeyForUrl('https://www.volosports.com/san-francisco/soccer'))
      .toBe('site-volosports-com');
  });

  it('selects the newest exportable run or the explicitly requested run', () => {
    const runs = [
      { id: 'running', status: 'RUNNING' },
      { id: 'partial', status: 'PARTIAL' },
      { id: 'success', status: 'SUCCEEDED' },
    ];

    expect(selectAffiliateSourceIntakeExportRun(runs)?.id).toBe('partial');
    expect(selectAffiliateSourceIntakeExportRun(runs, 'success')?.id).toBe('success');
  });

  it('creates portable source provenance for setup scripts and source notes', () => {
    const evidence = buildAffiliateSourceEvidence({
      environment: 'live',
      intake: {
        id: 'intake-1',
        sourceKey: 'site-example-com',
        name: 'Example Sports',
        baseUrl: 'https://example.com',
        complianceStatus: 'ALLOWED',
      },
      run: {
        id: 'run-1',
        status: 'SUCCEEDED',
        provider: 'FIRECRAWL',
        finishedAt: '2026-07-19T12:00:00.000Z',
      },
      pages: [{
        id: 'page-1',
        url: 'https://example.com/events',
        role: 'LISTING',
        robotsStatus: 'ALLOWED',
      }],
      artifacts: [{
        id: 'artifact-1',
        kind: 'PAGE_HTML',
        sourceUrl: 'https://example.com/events',
        contentHash: 'hash-1',
        localPath: '001-page-html.html',
      }],
    });

    expect(evidence).toMatchObject({
      evidenceSystem: 'AffiliateSourceIntakes',
      environment: 'live',
      intakeSourceKey: 'site-example-com',
      runId: 'run-1',
      provider: 'FIRECRAWL',
      artifactKinds: [{ kind: 'PAGE_HTML', count: 1 }],
    });
    expect(JSON.stringify(evidence)).not.toContain('sourceUrl');
    expect(renderAffiliateSourceEvidenceMarkdown(evidence)).toContain('`PAGE_HTML`: 1');
  });
});
