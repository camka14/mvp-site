import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const DEFAULT_STORAGE_ROOT = './uploads';

const getStorageRoot = (): string => {
  return process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT;
};

const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

const safeBasename = (filename: string): string => {
  const base = path.basename(filename || 'file');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
};

const buildStoredName = (originalName: string, organizationId?: string): string => {
  const base = safeBasename(originalName);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  const slug = stem.slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
  const suffix = randomBytes(8).toString('hex');
  const orgPart = organizationId ? `${organizationId}-` : '';
  return `${orgPart}${slug}-${suffix}${ext}`;
};

export const writeLocalFile = async (
  data: Buffer,
  originalName: string,
  organizationId?: string,
): Promise<{ relativePath: string; absolutePath: string }> => {
  const root = getStorageRoot();
  const storedName = buildStoredName(originalName, organizationId);
  const relativePath = storedName;
  const absolutePath = path.resolve(root, storedName);
  await ensureDir(path.dirname(absolutePath));
  await ensureDir(root);
  await fs.writeFile(absolutePath, data);
  return { relativePath, absolutePath };
};

export const readLocalFile = async (relativePath: string): Promise<Buffer> => {
  const root = getStorageRoot();
  const absolutePath = path.resolve(root, relativePath);
  return fs.readFile(absolutePath);
};

export const fileExists = async (relativePath: string): Promise<boolean> => {
  try {
    const root = getStorageRoot();
    const absolutePath = path.resolve(root, relativePath);
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

export const getAbsolutePath = (relativePath: string): string => {
  const root = getStorageRoot();
  return path.resolve(root, relativePath);
};
