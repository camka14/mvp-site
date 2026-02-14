export const TEMPLATE_REQUIRED_SIGNER_TYPES = [
  'PARTICIPANT',
  'PARENT_GUARDIAN',
  'CHILD',
  'PARENT_GUARDIAN_CHILD',
] as const;

export type TemplateRequiredSignerType = (typeof TEMPLATE_REQUIRED_SIGNER_TYPES)[number];

export const SIGNER_CONTEXTS = ['participant', 'parent_guardian', 'child'] as const;

export type SignerContext = (typeof SIGNER_CONTEXTS)[number];

const SIGNER_CONTEXT_LABELS: Record<SignerContext, string> = {
  participant: 'Participant',
  parent_guardian: 'Parent/Guardian',
  child: 'Child',
};

const SIGNER_CONTEXT_TO_BOLDSIGN_ROLE: Record<SignerContext, string> = {
  participant: 'Participant',
  parent_guardian: 'Parent/Guardian',
  child: 'Child',
};

const REQUIRED_SIGNER_TYPE_LABELS: Record<TemplateRequiredSignerType, string> = {
  PARTICIPANT: 'Participant',
  PARENT_GUARDIAN: 'Parent/Guardian',
  CHILD: 'Child',
  PARENT_GUARDIAN_CHILD: 'Parent/Guardian + Child',
};

export const normalizeRequiredSignerType = (
  value: unknown,
  fallback: TemplateRequiredSignerType = 'PARTICIPANT',
): TemplateRequiredSignerType => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  if (normalized === 'PARENT_GUARDING_CHILD') {
    return 'PARENT_GUARDIAN_CHILD';
  }
  if (normalized === 'PARENT_GUARDIAN_AND_CHILD') {
    return 'PARENT_GUARDIAN_CHILD';
  }
  if (normalized === 'PARENT_GUARDIAN') {
    return 'PARENT_GUARDIAN';
  }
  if (normalized === 'PARTICIPANT') {
    return 'PARTICIPANT';
  }
  if (normalized === 'CHILD') {
    return 'CHILD';
  }
  if (normalized === 'PARENT_GUARDIAN_CHILD') {
    return 'PARENT_GUARDIAN_CHILD';
  }

  return fallback;
};

export const getRequiredSignerTypeLabel = (value: unknown): string => {
  const normalized = normalizeRequiredSignerType(value);
  return REQUIRED_SIGNER_TYPE_LABELS[normalized];
};

export const getSignerContextLabel = (context: SignerContext): string => {
  return SIGNER_CONTEXT_LABELS[context];
};

export const getSignerContextsForRequiredSignerType = (value: unknown): SignerContext[] => {
  const requiredSignerType = normalizeRequiredSignerType(value);
  switch (requiredSignerType) {
    case 'PARTICIPANT':
      return ['participant'];
    case 'PARENT_GUARDIAN':
      return ['parent_guardian'];
    case 'CHILD':
      return ['child'];
    case 'PARENT_GUARDIAN_CHILD':
      return ['parent_guardian', 'child'];
    default:
      return ['participant'];
  }
};

export type TemplateSignerPresetRole = {
  signerContext: SignerContext;
  signerRole: string;
};

export const getBoldSignRolesForRequiredSignerType = (
  value: unknown,
): TemplateSignerPresetRole[] => {
  return getSignerContextsForRequiredSignerType(value).map((signerContext) => ({
    signerContext,
    signerRole: SIGNER_CONTEXT_TO_BOLDSIGN_ROLE[signerContext],
  }));
};

export const normalizeSignerContext = (
  value: unknown,
  fallback: SignerContext = 'participant',
): SignerContext => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s\/-]+/g, '_');
  if (normalized === 'parent' || normalized === 'guardian' || normalized === 'parent_guardian') {
    return 'parent_guardian';
  }
  if (normalized === 'child') {
    return 'child';
  }
  if (normalized === 'participant' || normalized === 'self') {
    return 'participant';
  }

  return fallback;
};

export const templateMatchesSignerContext = (params: {
  requiredSignerType: unknown;
  signerContext: SignerContext;
  isChildRegistration: boolean;
}): boolean => {
  const requiredSignerType = normalizeRequiredSignerType(params.requiredSignerType);

  switch (requiredSignerType) {
    case 'PARTICIPANT':
      return params.signerContext === 'participant' && !params.isChildRegistration;
    case 'PARENT_GUARDIAN':
      return params.signerContext === 'parent_guardian' && params.isChildRegistration;
    case 'CHILD':
      return params.signerContext === 'child' && params.isChildRegistration;
    case 'PARENT_GUARDIAN_CHILD':
      return params.isChildRegistration
        && (params.signerContext === 'parent_guardian' || params.signerContext === 'child');
    default:
      return false;
  }
};
