import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import {
  createEmbeddedTemplateFromPdf,
  isBoldSignConfigured,
} from '@/lib/boldsignServer';
import {
  getBoldSignRolesForRequiredSignerType,
  normalizeRequiredSignerType,
  type TemplateRequiredSignerType,
} from '@/lib/templateSignerTypes';

export const dynamic = 'force-dynamic';

const TEMPLATE_TYPE_VALUES = ['PDF', 'TEXT'] as const;
const pdfMaxFileBytes = 25 * 1024 * 1024;

const normalizeTemplateType = (value: string | undefined): 'PDF' | 'TEXT' => {
  const upper = value?.trim().toUpperCase();
  return upper === 'PDF' ? 'PDF' : 'TEXT';
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
};

const jsonCreateSchema = z.object({
  userId: z.string().optional(),
  template: z.object({
    title: z.string(),
    description: z.string().optional(),
    signOnce: z.boolean().optional(),
    type: z.string().optional(),
    content: z.string().optional(),
    requiredSignerType: z.string().optional(),
  }).optional(),
}).passthrough();

type ParsedTemplateInput = {
  userId?: string;
  template?: {
    title: string;
    description?: string;
    signOnce?: boolean;
    type?: string;
    content?: string;
    requiredSignerType?: string;
  };
  file?: File;
};

const parseTemplateInput = async (request: NextRequest): Promise<{
  ok: true;
  value: ParsedTemplateInput;
} | {
  ok: false;
  response: NextResponse;
}> => {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const fileEntry = form.get('file');
    const isFile = typeof File !== 'undefined' && fileEntry instanceof File;
    const value: ParsedTemplateInput = {
      userId: typeof form.get('userId') === 'string' ? String(form.get('userId')) : undefined,
      template: {
        title: typeof form.get('title') === 'string' ? String(form.get('title')) : '',
        description: typeof form.get('description') === 'string' ? String(form.get('description')) : undefined,
        signOnce: parseBoolean(form.get('signOnce')),
        type: typeof form.get('type') === 'string' ? String(form.get('type')) : undefined,
        content: typeof form.get('content') === 'string' ? String(form.get('content')) : undefined,
        requiredSignerType: typeof form.get('requiredSignerType') === 'string'
          ? String(form.get('requiredSignerType'))
          : undefined,
      },
      file: isFile ? fileEntry : undefined,
    };
    return { ok: true, value };
  }

  const body = await request.json().catch(() => null);
  const parsed = jsonCreateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    value: {
      userId: parsed.data.userId,
      template: parsed.data.template,
    },
  };
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templates = await prisma.templateDocuments.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ templates: withLegacyList(templates) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);

  const parsed = await parseTemplateInput(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!canManageOrganization(session, org)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = parsed.value.template;
  if (!template) {
    return NextResponse.json({ error: 'Template data is required' }, { status: 400 });
  }

  const templateType = normalizeTemplateType(template.type);
  if (!TEMPLATE_TYPE_VALUES.includes(templateType)) {
    return NextResponse.json({ error: 'Unsupported template type.' }, { status: 400 });
  }

  const title = template.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Template title is required.' }, { status: 400 });
  }

  const description = template.description?.trim() || null;
  const createdBy = parsed.value.userId ?? session.userId;
  const signOnce = template.signOnce ?? false;
  const requiredSignerType: TemplateRequiredSignerType = normalizeRequiredSignerType(
    template.requiredSignerType,
  );
  const now = new Date();

  if (templateType === 'TEXT') {
    const content = template.content?.trim() || null;
    if (!content) {
      return NextResponse.json({ error: 'Template text is required for TEXT templates.' }, { status: 400 });
    }

    const record = await prisma.templateDocuments.create({
      data: {
        id: crypto.randomUUID(),
        templateId: null,
        type: 'TEXT',
        organizationId: id,
        title,
        description,
        signOnce,
        requiredSignerType,
        status: 'ACTIVE',
        createdBy,
        roleIndex: 0,
        roleIndexes: [],
        signerRoles: [],
        content,
        createdAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.json({ template: withLegacyFields(record) }, { status: 201 });
  }

  if (!isBoldSignConfigured()) {
    return NextResponse.json({
      error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY to create PDF templates.',
    }, { status: 503 });
  }

  const file = parsed.value.file;
  if (!file) {
    return NextResponse.json({ error: 'PDF file is required for PDF templates.' }, { status: 400 });
  }
  if (file.size > pdfMaxFileBytes) {
    return NextResponse.json({ error: 'PDF file must be 25MB or less.' }, { status: 413 });
  }

  const fileType = file.type?.toLowerCase() ?? '';
  const looksLikePdf = fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    return NextResponse.json({ error: 'Only PDF uploads are supported for PDF templates.' }, { status: 415 });
  }

  const presetRoles = getBoldSignRolesForRequiredSignerType(requiredSignerType).map((role, index) => ({
    roleIndex: index + 1,
    signerRole: role.signerRole,
    signerContext: role.signerContext,
  }));
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const templateSession = await createEmbeddedTemplateFromPdf({
    fileBytes,
    title,
    description: description ?? undefined,
    roles: presetRoles,
  });
  const storedRoles = templateSession.roles.length > 0
    ? templateSession.roles
    : presetRoles;

  const record = await prisma.templateDocuments.create({
    data: {
      id: crypto.randomUUID(),
      templateId: templateSession.templateId,
      type: 'PDF',
      organizationId: id,
      title,
      description,
      signOnce,
      requiredSignerType,
      status: 'ACTIVE',
      createdBy,
      roleIndex: storedRoles[0]?.roleIndex ?? null,
      roleIndexes: storedRoles.map((role) => role.roleIndex),
      signerRoles: storedRoles.map((role) => role.signerRole),
      content: null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return NextResponse.json(
    { template: withLegacyFields(record), createUrl: templateSession.createUrl },
    { status: 201 },
  );
}
