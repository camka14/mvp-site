import type { SignerContext } from '@/lib/templateSignerTypes';

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

type ViewerChildSigningAccessParams = {
  signerContext: SignerContext;
  viewerUserId: string;
  childUserId?: string;
  childEmail?: string;
};

export const canViewerProxyChildSignature = (params: ViewerChildSigningAccessParams): boolean => {
  if (params.signerContext !== 'child') {
    return false;
  }
  const childUserId = normalizeText(params.childUserId);
  if (!childUserId || childUserId === params.viewerUserId) {
    return false;
  }
  return !normalizeText(params.childEmail);
};

export const isChildSignatureRestrictedToChildAccount = (params: ViewerChildSigningAccessParams): boolean => {
  if (params.signerContext !== 'child') {
    return false;
  }
  const childUserId = normalizeText(params.childUserId);
  if (!childUserId || childUserId === params.viewerUserId) {
    return false;
  }
  return !canViewerProxyChildSignature(params);
};
