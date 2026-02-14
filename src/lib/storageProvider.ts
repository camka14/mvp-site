import { Readable } from 'stream';
import { createReadStream, promises as fs } from 'fs';
import {
  buildStoredName,
  fileExists,
  getAbsolutePath,
  writeLocalFile,
} from '@/lib/storage';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type StorageProviderName = 'local' | 'spaces';

export interface StoragePutParams {
  data: Buffer;
  originalName: string;
  contentType?: string | null;
  organizationId?: string;
}

export interface StoragePutResult {
  key: string;
  sizeBytes: number;
  contentType?: string;
  bucket?: string;
}

export interface StorageGetParams {
  key: string;
  bucket?: string | null;
}

export interface StorageGetResult {
  stream: Readable;
  contentType?: string;
  sizeBytes?: number;
}

export interface StorageHeadResult {
  exists: boolean;
  contentType?: string;
  sizeBytes?: number;
}

export interface StorageProvider {
  putObject(params: StoragePutParams): Promise<StoragePutResult>;
  getObjectStream(params: StorageGetParams): Promise<StorageGetResult>;
  deleteObject(params: StorageGetParams): Promise<void>;
  headObject(params: StorageGetParams): Promise<StorageHeadResult>;
}

const resolveProviderName = (): StorageProviderName => {
  const envValue = (process.env.STORAGE_PROVIDER || '').toLowerCase();
  if (envValue === 'spaces' || envValue === 'local') {
    return envValue as StorageProviderName;
  }
  return process.env.NODE_ENV === 'production' ? 'spaces' : 'local';
};

let cachedProvider: StorageProvider | null = null;
let cachedProviderName: StorageProviderName | null = null;

export const getStorageProviderName = (): StorageProviderName => resolveProviderName();

export const getStorageProvider = (): StorageProvider => {
  const name = resolveProviderName();
  if (cachedProvider && cachedProviderName === name) {
    return cachedProvider;
  }
  cachedProviderName = name;
  cachedProvider = name === 'spaces' ? createSpacesProvider() : createLocalProvider();
  return cachedProvider;
};

const createLocalProvider = (): StorageProvider => {
  return {
    async putObject(params) {
      const stored = await writeLocalFile(params.data, params.originalName, params.organizationId);
      return {
        key: stored.relativePath,
        sizeBytes: params.data.length,
        contentType: params.contentType || undefined,
      };
    },
    async getObjectStream(params) {
      const absolutePath = getAbsolutePath(params.key);
      const exists = await fileExists(params.key);
      if (!exists) {
        throw new Error('FILE_MISSING');
      }
      const stats = await fs.stat(absolutePath);
      return {
        stream: createReadStream(absolutePath),
        sizeBytes: stats.size,
      };
    },
    async deleteObject(params) {
      const absolutePath = getAbsolutePath(params.key);
      try {
        await fs.unlink(absolutePath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    },
    async headObject(params) {
      const absolutePath = getAbsolutePath(params.key);
      try {
        const stats = await fs.stat(absolutePath);
        return { exists: true, sizeBytes: stats.size };
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          return { exists: false };
        }
        throw error;
      }
    },
  };
};

export const normalizeSpacesEndpoint = (endpointValue: string, bucket: string): string => {
  const value = endpointValue.trim();
  const normalizedBucket = bucket.trim().toLowerCase();
  const withProtocol = value.includes('://') ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('DO_SPACES_ENDPOINT must be a valid URL or hostname');
  }

  const bucketPrefix = `${normalizedBucket}.`;
  let hostname = parsed.hostname.toLowerCase();

  // Spaces endpoints are sometimes configured as "<bucket>.<region>.digitaloceanspaces.com".
  // The S3 client already prefixes the bucket for virtual-host requests, so strip bucket prefixes.
  while (hostname.startsWith(bucketPrefix)) {
    hostname = hostname.slice(bucketPrefix.length);
  }

  if (!hostname) {
    throw new Error('DO_SPACES_ENDPOINT host is invalid');
  }

  const normalized = new URL(`${parsed.protocol}//${hostname}`);
  if (parsed.port) {
    normalized.port = parsed.port;
  }

  return normalized.toString().replace(/\/$/, '');
};

const getSpacesConfig = () => {
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region = process.env.DO_SPACES_REGION;
  const bucket = process.env.DO_SPACES_BUCKET;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  if (!endpoint || !region || !bucket || !key || !secret) {
    throw new Error('DigitalOcean Spaces environment variables are missing');
  }

  return {
    endpoint: normalizeSpacesEndpoint(endpoint, bucket),
    region,
    bucket,
    key,
    secret,
  };
};

const createSpacesProvider = (): StorageProvider => {
  const config = getSpacesConfig();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
  });

  return {
    async putObject(params) {
      const key = buildStoredName(params.originalName, params.organizationId);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: params.data,
          ContentType: params.contentType || undefined,
        }),
      );

      return {
        key,
        sizeBytes: params.data.length,
        contentType: params.contentType || undefined,
        bucket: config.bucket,
      };
    },
    async getObjectStream(params) {
      const bucket = params.bucket || config.bucket;
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: params.key,
        }),
      );
      const body = response.Body;
      if (!body || typeof (body as Readable).pipe !== 'function') {
        throw new Error('FILE_MISSING');
      }
      return {
        stream: body as Readable,
        contentType: response.ContentType,
        sizeBytes: response.ContentLength,
      };
    },
    async deleteObject(params) {
      const bucket = params.bucket || config.bucket;
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: params.key,
        }),
      );
    },
    async headObject(params) {
      const bucket = params.bucket || config.bucket;
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: params.key,
          }),
        );
        return {
          exists: true,
          contentType: response.ContentType,
          sizeBytes: response.ContentLength,
        };
      } catch (error: any) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound') {
          return { exists: false };
        }
        throw error;
      }
    },
  };
};
