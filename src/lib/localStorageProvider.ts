import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { buildStoredName } from '@/lib/storageNames';

const DEFAULT_STORAGE_ROOT = path.join(process.cwd(), 'uploads');

export const getStorageRoot = (): string => {
  const root = process.env.STORAGE_ROOT?.trim();
  if (!root) {
    return DEFAULT_STORAGE_ROOT;
  }
  if (path.isAbsolute(root)) {
    return root;
  }
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), root);
};

const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
};

export const getAbsolutePath = (relativePath: string): string => {
  const root = getStorageRoot();
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
  const relativeToRoot = path.relative(root, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid storage path');
  }
  return absolutePath;
};

export const writeLocalFile = async (
  data: Buffer,
  originalName: string,
  organizationId?: string,
): Promise<{ relativePath: string; absolutePath: string }> => {
  const storedName = buildStoredName(originalName, organizationId);
  const relativePath = storedName;
  const absolutePath = getAbsolutePath(storedName);
  const root = getStorageRoot();
  await ensureDir(path.dirname(absolutePath));
  await ensureDir(root);
  await fs.writeFile(/*turbopackIgnore: true*/ absolutePath, data);
  return { relativePath, absolutePath };
};

export const getLocalObjectStream = async (
  key: string,
): Promise<{ stream: Readable; sizeBytes: number }> => {
  const absolutePath = getAbsolutePath(key);
  const stats = await fs.stat(/*turbopackIgnore: true*/ absolutePath).catch((error: any) => {
    if (error?.code === 'ENOENT') {
      throw new Error('FILE_MISSING');
    }
    throw error;
  });
  return {
    stream: createReadStream(/*turbopackIgnore: true*/ absolutePath),
    sizeBytes: stats.size,
  };
};

export const deleteLocalObject = async (key: string): Promise<void> => {
  const absolutePath = getAbsolutePath(key);
  try {
    await fs.unlink(/*turbopackIgnore: true*/ absolutePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
};

export const headLocalObject = async (
  key: string,
): Promise<{ exists: boolean; sizeBytes?: number }> => {
  const absolutePath = getAbsolutePath(key);
  try {
    const stats = await fs.stat(/*turbopackIgnore: true*/ absolutePath);
    return { exists: true, sizeBytes: stats.size };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { exists: false };
    }
    throw error;
  }
};
