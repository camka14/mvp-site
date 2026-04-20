import {
  getPublicCompletionPath,
  getPublicCompletionTarget,
  normalizePublicCompletionRedirectUrl,
} from '@/lib/publicCompletionRedirect';

describe('publicCompletionRedirect', () => {
  it('builds BracketIQ fallback completion paths', () => {
    expect(getPublicCompletionPath('summit-indoor-volleyball-facility', 'rental')).toBe(
      '/o/summit-indoor-volleyball-facility/complete?type=rental',
    );
  });

  it('uses valid absolute redirect URLs ahead of fallback paths', () => {
    expect(getPublicCompletionTarget({
      slug: 'summit',
      kind: 'product',
      redirectUrl: ' https://client.example.com/thanks?source=bracketiq ',
    })).toBe('https://client.example.com/thanks?source=bracketiq');
  });

  it('ignores unsupported redirect URL protocols', () => {
    expect(normalizePublicCompletionRedirectUrl('javascript:alert(1)')).toBeNull();
    expect(getPublicCompletionTarget({
      slug: 'summit',
      kind: 'event',
      redirectUrl: 'javascript:alert(1)',
    })).toBe('/o/summit/complete?type=event');
  });
});
