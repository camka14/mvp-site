import {
  canViewerProxyChildSignature,
  isChildSignatureRestrictedToChildAccount,
} from '@/lib/profileDocumentAccess';

describe('profileDocumentAccess', () => {
  it('allows a parent/guardian to sign a child document when child email is missing', () => {
    expect(canViewerProxyChildSignature({
      signerContext: 'child',
      viewerUserId: 'parent_1',
      childUserId: 'child_1',
      childEmail: '',
    })).toBe(true);
  });

  it('requires the child account when the child has an email', () => {
    expect(canViewerProxyChildSignature({
      signerContext: 'child',
      viewerUserId: 'parent_1',
      childUserId: 'child_1',
      childEmail: 'child@example.com',
    })).toBe(false);
    expect(isChildSignatureRestrictedToChildAccount({
      signerContext: 'child',
      viewerUserId: 'parent_1',
      childUserId: 'child_1',
      childEmail: 'child@example.com',
    })).toBe(true);
  });

  it('does not treat child-self signing as proxy access', () => {
    expect(canViewerProxyChildSignature({
      signerContext: 'child',
      viewerUserId: 'child_1',
      childUserId: 'child_1',
      childEmail: 'child@example.com',
    })).toBe(false);
    expect(isChildSignatureRestrictedToChildAccount({
      signerContext: 'child',
      viewerUserId: 'child_1',
      childUserId: 'child_1',
      childEmail: 'child@example.com',
    })).toBe(false);
  });
});
