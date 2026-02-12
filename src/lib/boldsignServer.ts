type JsonRecord = Record<string, unknown>;

const DEFAULT_BOLDSIGN_API_BASE_URL = 'https://api.boldsign.com';
const DEFAULT_SIGNER_ROLE = 'Participant';
const DEFAULT_ROLE_INDEX = 1;

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const parseRoleIndex = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const parseArray = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object');
};

const readErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as JsonRecord;
  const direct = pickString(
    body.error,
    body.message,
    body.errorMessage,
    body.Error,
    body.Message,
  );
  if (direct) {
    return direct;
  }

  const errors = body.errors ?? body.Errors;
  if (Array.isArray(errors)) {
    const first = errors[0];
    if (typeof first === 'string' && first.trim()) {
      return first.trim();
    }
    if (first && typeof first === 'object') {
      const entry = first as JsonRecord;
      const nested = pickString(entry.message, entry.Message, entry.error, entry.Error);
      if (nested) {
        return nested;
      }
    }
  }

  const detail = body.detail ?? body.Details ?? body.details;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  return null;
};

const getBoldSignConfig = () => {
  const apiKey = process.env.BOLDSIGN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BoldSign is not configured. Set BOLDSIGN_API_KEY.');
  }

  const baseUrl = process.env.BOLDSIGN_API_BASE_URL?.trim() || DEFAULT_BOLDSIGN_API_BASE_URL;
  return { apiKey, baseUrl };
};

const boldSignRequest = async <T>(params: {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | undefined>;
  body?: JsonRecord;
}): Promise<T> => {
  const { apiKey, baseUrl } = getBoldSignConfig();
  const url = new URL(params.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: params.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(payload) ?? `BoldSign API request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload ?? {}) as T;
};

const boldSignFormRequest = async <T>(params: {
  path: string;
  query?: Record<string, string | undefined>;
  form: FormData;
}): Promise<T> => {
  const { apiKey, baseUrl } = getBoldSignConfig();
  const url = new URL(params.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
    },
    body: params.form,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(payload) ?? `BoldSign API request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload ?? {}) as T;
};

const boldSignBinaryRequest = async (params: {
  path: string;
  query?: Record<string, string | undefined>;
}): Promise<{
  data: Buffer;
  contentType: string;
  contentDisposition?: string | null;
}> => {
  const { apiKey, baseUrl } = getBoldSignConfig();
  const url = new URL(params.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let payload: unknown = null;
    if (contentType.includes('application/json')) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => null);
    }
    const message = readErrorMessage(payload)
      ?? (typeof payload === 'string' && payload.trim() ? payload.trim() : null)
      ?? `BoldSign API request failed (${response.status})`;
    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') ?? 'application/pdf',
    contentDisposition: response.headers.get('content-disposition'),
  };
};

const toPdfDataUri = (buffer: Buffer): string => {
  return `data:application/pdf;base64,${buffer.toString('base64')}`;
};

export type BoldSignTemplateRole = {
  roleIndex: number;
  signerRole: string;
};

export const getDefaultTemplateRole = (): BoldSignTemplateRole => ({
  roleIndex: DEFAULT_ROLE_INDEX,
  signerRole: DEFAULT_SIGNER_ROLE,
});

export const isBoldSignConfigured = (): boolean => {
  return Boolean(process.env.BOLDSIGN_API_KEY?.trim());
};

export const createEmbeddedTemplateFromPdf = async (params: {
  fileBytes: Buffer;
  title: string;
  description?: string;
  roleIndex?: number;
  signerRole?: string;
}) => {
  const roleIndex = params.roleIndex ?? DEFAULT_ROLE_INDEX;
  const signerRole = params.signerRole?.trim() || DEFAULT_SIGNER_ROLE;

  const payload = await boldSignRequest<JsonRecord>({
    path: '/v1/template/createEmbeddedTemplateUrl',
    method: 'POST',
    body: {
      Title: params.title,
      Description: params.description ?? '',
      DocumentTitle: params.title,
      DocumentMessage: params.description ?? '',
      ViewOption: 'PreparePage',
      ShowToolbar: true,
      ShowNavigationButtons: true,
      ShowSaveButton: true,
      ShowPreviewButton: true,
      ShowCreateButton: true,
      ShowSendButton: true,
      DisableEmails: true,
      DisableSMS: true,
      HideDocumentId: true,
      Roles: [
        {
          Name: signerRole,
          Index: roleIndex,
        },
      ],
      Files: [toPdfDataUri(params.fileBytes)],
    },
  });

  const templateId = pickString(payload.templateId, payload.TemplateId, payload.id);
  const createUrl = pickString(payload.createUrl, payload.CreateUrl, payload.url);
  if (!templateId || !createUrl) {
    throw new Error('BoldSign template session response is missing templateId or createUrl.');
  }

  return { templateId, createUrl, roleIndex, signerRole };
};

export const getTemplateRoles = async (templateId: string): Promise<BoldSignTemplateRole[]> => {
  const payload = await boldSignRequest<JsonRecord>({
    path: '/v1/template/properties',
    method: 'GET',
    query: { templateId },
  });

  const roleRows = parseArray((payload as JsonRecord).roles ?? (payload as JsonRecord).Roles);
  const roles = roleRows
    .map((row) => {
      const roleIndex = parseRoleIndex(row.roleIndex ?? row.RoleIndex ?? row.index ?? row.Index);
      const signerRole = pickString(row.signerRole, row.SignerRole, row.name, row.Name);
      if (!roleIndex || !signerRole) {
        return null;
      }
      return { roleIndex, signerRole };
    })
    .filter((row): row is BoldSignTemplateRole => row !== null)
    .sort((a, b) => a.roleIndex - b.roleIndex);

  if (!roles.length) {
    return [getDefaultTemplateRole()];
  }

  return roles;
};

export const sendDocumentFromTemplate = async (params: {
  templateId: string;
  signerEmail: string;
  signerName: string;
  roleIndex: number;
  signerRole?: string;
  title?: string;
  message?: string;
}) => {
  const payload = await boldSignRequest<JsonRecord>({
    path: '/v1/template/send',
    method: 'POST',
    query: { templateId: params.templateId },
    body: {
      Title: params.title ?? 'Signature request',
      Message: params.message ?? 'Please review and sign this document.',
      DisableEmails: true,
      DisableSMS: true,
      HideDocumentId: true,
      Roles: [
        {
          RoleIndex: params.roleIndex,
          SignerEmail: params.signerEmail,
          SignerName: params.signerName,
          ...(params.signerRole ? { SignerRole: params.signerRole } : {}),
        },
      ],
    },
  });

  const documentId = pickString(
    payload.documentId,
    payload.DocumentId,
    payload.id,
    payload.documentID,
  );
  if (!documentId) {
    throw new Error('BoldSign send response is missing documentId.');
  }

  return { documentId };
};

export const getEmbeddedSignLink = async (params: {
  documentId: string;
  signerEmail: string;
  redirectUrl?: string;
}) => {
  const payload = await boldSignRequest<JsonRecord>({
    path: '/v1/document/getEmbeddedSignLink',
    method: 'GET',
    query: {
      documentId: params.documentId,
      signerEmail: params.signerEmail,
      redirectUrl: params.redirectUrl,
    },
  });

  const signLink = pickString(payload.signLink, payload.SignLink, payload.url);
  if (!signLink) {
    throw new Error('BoldSign embedded sign link response is missing signLink.');
  }

  return { signLink };
};

export const getEmbeddedTemplateEditUrl = async (params: {
  templateId: string;
}) => {
  const form = new FormData();
  form.set('ShowTooltip', 'false');
  form.set('ViewOption', 'PreparePage');
  form.set('ShowSaveButton', 'true');
  form.set('ShowCreateButton', 'true');
  form.set('ShowPreviewButton', 'true');
  form.set('ShowNavigationButtons', 'true');
  form.set('ShowToolbar', 'true');

  const payload = await boldSignFormRequest<JsonRecord>({
    path: '/v1/template/getEmbeddedTemplateEditUrl',
    query: { templateId: params.templateId },
    form,
  });

  const editUrl = pickString(payload.editUrl, payload.EditUrl, payload.url, payload.Url);
  if (!editUrl) {
    throw new Error('BoldSign embedded template edit response is missing editUrl.');
  }

  return { editUrl };
};

export const downloadSignedDocumentPdf = async (params: {
  documentId: string;
}) => {
  return boldSignBinaryRequest({
    path: '/v1/document/download',
    query: { documentId: params.documentId },
  });
};
