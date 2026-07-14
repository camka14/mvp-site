import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/imageUploadPolicy';

export const DEFAULT_PUBLIC_REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PUBLIC_REMOTE_IMAGE_TIMEOUT_MS = 8_000;
export const DEFAULT_PUBLIC_REMOTE_IMAGE_MAX_REDIRECTS = 3;

const MAX_REMOTE_URL_LENGTH = 2_048;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export class PublicRemoteImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicRemoteImageError';
  }
}

export type PublicAddress = {
  address: string;
  family: 4 | 6;
};

type HeaderValue = string | readonly string[] | undefined;

export type PublicRemoteImageResponse = {
  statusCode: number;
  headers: Record<string, HeaderValue>;
  body: AsyncIterable<Uint8Array>;
  destroy: (error?: Error) => void;
};

export type PublicRemoteImageRequest = {
  url: URL;
  address: string;
  family: 4 | 6;
  timeoutMs: number;
};

export type PublicRemoteImageDependencies = {
  resolveHostname: (hostname: string) => Promise<readonly PublicAddress[]>;
  request: (request: PublicRemoteImageRequest) => Promise<PublicRemoteImageResponse>;
};

export type PublicRemoteImageOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();

const addBlockedSubnet = (network: string, prefix: number, family: 'ipv4' | 'ipv6') => {
  const blockList = family === 'ipv4' ? blockedIpv4Addresses : blockedIpv6Addresses;
  blockList.addSubnet(network, prefix, family);
};

// Reject non-routable, private, documentation, benchmarking, multicast, and
// other special-use ranges. Remote media is optional, so failing closed is
// safer than allowing a host with ambiguous routing to reach server networks.
addBlockedSubnet('0.0.0.0', 8, 'ipv4');
addBlockedSubnet('10.0.0.0', 8, 'ipv4');
addBlockedSubnet('100.64.0.0', 10, 'ipv4');
addBlockedSubnet('127.0.0.0', 8, 'ipv4');
addBlockedSubnet('169.254.0.0', 16, 'ipv4');
addBlockedSubnet('172.16.0.0', 12, 'ipv4');
addBlockedSubnet('192.0.0.0', 24, 'ipv4');
addBlockedSubnet('192.0.2.0', 24, 'ipv4');
addBlockedSubnet('192.88.99.0', 24, 'ipv4');
addBlockedSubnet('192.168.0.0', 16, 'ipv4');
addBlockedSubnet('198.18.0.0', 15, 'ipv4');
addBlockedSubnet('198.51.100.0', 24, 'ipv4');
addBlockedSubnet('203.0.113.0', 24, 'ipv4');
addBlockedSubnet('224.0.0.0', 4, 'ipv4');
addBlockedSubnet('240.0.0.0', 4, 'ipv4');

addBlockedSubnet('::', 128, 'ipv6');
addBlockedSubnet('::1', 128, 'ipv6');
addBlockedSubnet('::ffff:0:0', 96, 'ipv6');
addBlockedSubnet('64:ff9b::', 96, 'ipv6');
addBlockedSubnet('64:ff9b:1::', 48, 'ipv6');
addBlockedSubnet('100::', 64, 'ipv6');
addBlockedSubnet('2001::', 32, 'ipv6');
addBlockedSubnet('2001:2::', 48, 'ipv6');
addBlockedSubnet('2001:10::', 28, 'ipv6');
addBlockedSubnet('2001:20::', 28, 'ipv6');
addBlockedSubnet('2001:db8::', 32, 'ipv6');
addBlockedSubnet('2002::', 16, 'ipv6');
addBlockedSubnet('fc00::', 7, 'ipv6');
addBlockedSubnet('fe80::', 10, 'ipv6');
addBlockedSubnet('fec0::', 10, 'ipv6');
addBlockedSubnet('ff00::', 8, 'ipv6');

const normalizedHostname = (hostname: string): string =>
  hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

export const isPublicNetworkAddress = (address: string): boolean => {
  const normalized = normalizedHostname(address).split('%', 1)[0];
  const family = isIP(normalized);
  if (family !== 4 && family !== 6) return false;
  return family === 4
    ? !blockedIpv4Addresses.check(normalized, 'ipv4')
    : !blockedIpv6Addresses.check(normalized, 'ipv6');
};

export const parsePublicRemoteImageUrl = (input: string): URL => {
  if (input.length === 0 || input.length > MAX_REMOTE_URL_LENGTH) {
    throw new PublicRemoteImageError('Remote image URL is missing or too long.');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PublicRemoteImageError('Remote image URL is invalid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicRemoteImageError('Remote image URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new PublicRemoteImageError('Remote image URL cannot contain credentials.');
  }

  const hostname = normalizedHostname(url.hostname);
  if (
    hostname.length === 0 ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    (isIP(hostname) === 0 && !hostname.includes('.'))
  ) {
    throw new PublicRemoteImageError('Remote image host is not public.');
  }

  const permittedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== permittedPort) {
    throw new PublicRemoteImageError('Remote image URL uses a nonstandard port.');
  }

  if (isIP(hostname) !== 0 && !isPublicNetworkAddress(hostname)) {
    throw new PublicRemoteImageError('Remote image address is not public.');
  }

  return url;
};

const resolvePublicAddresses = async (
  hostname: string,
  resolveHostname: PublicRemoteImageDependencies['resolveHostname'],
): Promise<readonly PublicAddress[]> => {
  const normalized = normalizedHostname(hostname);
  const literalFamily = isIP(normalized);
  const addresses = literalFamily === 4 || literalFamily === 6
    ? [{ address: normalized, family: literalFamily } as PublicAddress]
    : await resolveHostname(normalized);

  if (addresses.length === 0) {
    throw new PublicRemoteImageError('Remote image host did not resolve.');
  }
  if (addresses.some(({ address, family }) => family !== isIP(address) || !isPublicNetworkAddress(address))) {
    throw new PublicRemoteImageError('Remote image host resolves to a non-public address.');
  }
  return addresses;
};

const defaultResolveHostname: PublicRemoteImageDependencies['resolveHostname'] = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : [],
  );
};

const defaultRequest: PublicRemoteImageDependencies['request'] = async ({
  url,
  address,
  family,
  timeoutMs,
}) => new Promise((resolve, reject) => {
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const clearRequestTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
  };
  const request = transport(url, {
    method: 'GET',
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8',
      'accept-encoding': 'identity',
      'user-agent': 'BracketIQ source review bot; contact samuel.r@razumly.com',
    },
    lookup: pinnedLookup,
  }, (response) => {
    response.once('end', clearRequestTimeout);
    response.once('close', clearRequestTimeout);
    resolve({
      statusCode: response.statusCode ?? 0,
      headers: response.headers as IncomingHttpHeaders,
      body: response,
      destroy: (error?: Error) => {
        clearRequestTimeout();
        response.destroy(error);
      },
    });
  });

  timeout = setTimeout(() => {
    request.destroy(new PublicRemoteImageError('Remote image request timed out.'));
  }, timeoutMs);
  request.once('error', (error) => {
    clearRequestTimeout();
    reject(error);
  });
  request.end();
});

const firstHeader = (headers: Record<string, HeaderValue>, name: string): string | undefined => {
  const value = headers[name];
  return typeof value === 'string' ? value : value?.[0];
};

const positiveIntegerOption = (value: number | undefined, fallback: number, name: string): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new PublicRemoteImageError(`${name} must be a positive integer.`);
  }
  return resolved;
};

const nonnegativeIntegerOption = (value: number | undefined, fallback: number, name: string): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new PublicRemoteImageError(`${name} must be a nonnegative integer.`);
  }
  return resolved;
};

const waitWithinDeadline = async <T>(promise: Promise<T>, deadline: number): Promise<T> => {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new PublicRemoteImageError('Remote image request timed out.');
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new PublicRemoteImageError('Remote image request timed out.')),
      remainingMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
};

const readBoundedBody = async (
  response: PublicRemoteImageResponse,
  maxBytes: number,
  deadline: number,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await waitWithinDeadline(iterator.next(), deadline);
      if (next.done) break;
      const chunk = next.value;
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        throw new PublicRemoteImageError('Remote image exceeds the download size limit.');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    response.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
  return Buffer.concat(chunks, totalBytes);
};

export const createPublicRemoteImageDownloader = (
  dependencies: PublicRemoteImageDependencies,
) => async (input: string, options: PublicRemoteImageOptions = {}): Promise<Buffer> => {
  const maxBytes = positiveIntegerOption(
    options.maxBytes,
    DEFAULT_PUBLIC_REMOTE_IMAGE_MAX_BYTES,
    'Remote image byte limit',
  );
  const timeoutMs = positiveIntegerOption(
    options.timeoutMs,
    DEFAULT_PUBLIC_REMOTE_IMAGE_TIMEOUT_MS,
    'Remote image timeout',
  );
  const maxRedirects = nonnegativeIntegerOption(
    options.maxRedirects,
    DEFAULT_PUBLIC_REMOTE_IMAGE_MAX_REDIRECTS,
    'Remote image redirect limit',
  );

  let currentUrl = parsePublicRemoteImageUrl(input);
  let redirects = 0;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const addresses = await waitWithinDeadline(
      resolvePublicAddresses(currentUrl.hostname, dependencies.resolveHostname),
      deadline,
    );
    const selectedAddress = addresses[0];
    const response = await waitWithinDeadline(
      dependencies.request({
        url: currentUrl,
        address: selectedAddress.address,
        family: selectedAddress.family,
        timeoutMs: Math.max(1, deadline - Date.now()),
      }),
      deadline,
    );

    if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
      const location = firstHeader(response.headers, 'location');
      response.destroy();
      if (!location) {
        throw new PublicRemoteImageError('Remote image redirect is missing a destination.');
      }
      if (redirects >= maxRedirects) {
        throw new PublicRemoteImageError('Remote image exceeded the redirect limit.');
      }
      currentUrl = parsePublicRemoteImageUrl(new URL(location, currentUrl).toString());
      redirects += 1;
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new PublicRemoteImageError(`Remote image returned HTTP ${response.statusCode}.`);
    }

    const contentType = firstHeader(response.headers, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!contentType || !SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) {
      response.destroy();
      throw new PublicRemoteImageError('Remote resource is not a supported image.');
    }

    const contentLength = firstHeader(response.headers, 'content-length');
    if (contentLength) {
      if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
        response.destroy();
        throw new PublicRemoteImageError('Remote image exceeds the download size limit.');
      }
    }

    return readBoundedBody(response, maxBytes, deadline);
  }
};

export const downloadPublicRemoteImage = createPublicRemoteImageDownloader({
  resolveHostname: defaultResolveHostname,
  request: defaultRequest,
});
