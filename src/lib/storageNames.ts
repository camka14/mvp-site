import { randomBytes } from 'crypto';
import path from 'path';

const safeBasename = (filename: string): string => {
  const base = path.basename(filename || 'file');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
};

export const buildStoredName = (originalName: string, organizationId?: string): string => {
  const base = safeBasename(originalName);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  const slug = stem.slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
  const suffix = randomBytes(8).toString('hex');
  const orgPart = organizationId ? `${organizationId}-` : '';
  return `${orgPart}${slug}-${suffix}${ext}`;
};
