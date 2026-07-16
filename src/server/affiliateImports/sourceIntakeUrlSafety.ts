import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import http from 'http';
import https from 'https';
import { isIP } from 'net';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'msclkid',
]);

export type ResolvedAddress = {
  address: string;
  family: number;
};

export type PublicUrlResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type BoundedPublicResource = {
  body: Buffer;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  headers: Record<string, string>;
};

export type BoundedPublicResourceOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  resolver?: PublicUrlResolver;
};

const parseIpv4 = (value: string): number[] | null => {
  if (isIP(value) !== 4) return null;
  const octets = value.split('.').map((part) => Number.parseInt(part, 10));
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? octets
    : null;
};

const mappedIpv4 = (value: string): string | null => {
  const normalized = value.toLowerCase();
  if (!normalized.startsWith('::ffff:')) return null;
  const suffix = normalized.slice('::ffff:'.length);
  if (isIP(suffix) === 4) return suffix;
  const parts = suffix.split(':');
  if (parts.length !== 2) return null;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
};

export const isUnsafePublicAddress = (value: string): boolean => {
  const ipv4 = parseIpv4(value);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }

  if (isIP(value) !== 6) return true;
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  const embeddedIpv4 = mappedIpv4(normalized);
  if (embeddedIpv4) return isUnsafePublicAddress(embeddedIpv4);
  if (normalized === '::' || normalized === '::1') return true;
  if (/^(fc|fd)/.test(normalized)) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (/^ff/.test(normalized)) return true;
  if (/^2001:(db8|10|2)(:|$)/.test(normalized)) return true;

  // Public IPv6 unicast allocations currently live in 2000::/3. Rejecting
  // other ranges is intentionally conservative for server-side intake fetches.
  return !/^[23]/.test(normalized);
};

const defaultResolver: PublicUrlResolver = async (hostname) => (
  lookup(hostname, { all: true, verbatim: true })
);

const normalizedHostname = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/^\[|\]$/g, '')
  .replace(/\.$/, '');

export const assertSafePublicUrl = async (
  value: string,
  resolver: PublicUrlResolver = defaultResolver,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Source URL must be a valid absolute URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Source URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('Source URL must not contain credentials.');
  }

  const hostname = normalizedHostname(url.hostname);
  if (!hostname
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.home.arpa')) {
    throw new Error('Source URL hostname is not public.');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some((entry) => isUnsafePublicAddress(entry.address))) {
    throw new Error('Source URL resolves to a private or reserved network address.');
  }

  return { url, addresses };
};

export const canonicalizeAffiliateIntakeUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  url.hostname = normalizedHostname(url.hostname);
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  [...url.searchParams.keys()].forEach((key) => {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  });
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  url.searchParams.sort();
  return url.toString();
};

export const affiliateIntakeUrlKey = (value: string): string => createHash('sha256')
  .update(canonicalizeAffiliateIntakeUrl(value))
  .digest('hex');

const headersToRecord = (headers: http.IncomingHttpHeaders): Record<string, string> => Object.fromEntries(
  Object.entries(headers)
    .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]),
);

export const createPinnedAddressLookup = (address: ResolvedAddress) => (
  _hostname: string,
  lookupOptions: { all?: boolean } | number,
  callback: (...args: unknown[]) => void,
): void => {
  const all = typeof lookupOptions === 'object' && lookupOptions?.all === true;
  if (all) {
    callback(null, [address]);
    return;
  }
  callback(null, address.address, address.family);
};

const requestOnce = async (
  url: URL,
  address: ResolvedAddress,
  options: Required<Pick<BoundedPublicResourceOptions, 'timeoutMs' | 'maxBytes'>> & Pick<BoundedPublicResourceOptions, 'headers'>,
): Promise<BoundedPublicResource> => new Promise((resolve, reject) => {
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.request(url, {
    headers: {
      'User-Agent': 'BracketIQ-Affiliate-Intake/1.0',
      Accept: '*/*',
      ...(options.headers ?? {}),
    },
    lookup: createPinnedAddressLookup(address) as any,
  }, (response) => {
    const statusCode = response.statusCode ?? 0;
    const declaredLength = Number.parseInt(String(response.headers['content-length'] ?? ''), 10);
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      response.resume();
      reject(new Error(`Source response exceeds the ${options.maxBytes} byte limit.`));
      return;
    }

    const chunks: Buffer[] = [];
    let byteCount = 0;
    response.on('data', (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteCount += buffer.length;
      if (byteCount > options.maxBytes) {
        request.destroy(new Error(`Source response exceeds the ${options.maxBytes} byte limit.`));
        return;
      }
      chunks.push(buffer);
    });
    response.on('end', () => {
      resolve({
        body: Buffer.concat(chunks),
        finalUrl: url.toString(),
        statusCode,
        contentType: typeof response.headers['content-type'] === 'string'
          ? response.headers['content-type']
          : null,
        headers: headersToRecord(response.headers),
      });
    });
  });
  request.setTimeout(options.timeoutMs, () => request.destroy(new Error('Source request timed out.')));
  request.on('error', reject);
  request.end();
});

export const fetchBoundedPublicResource = async (
  value: string,
  options: BoundedPublicResourceOptions = {},
): Promise<BoundedPublicResource> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const resolver = options.resolver ?? defaultResolver;
  let current = value;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const { url, addresses } = await assertSafePublicUrl(current, resolver);
    const response = await requestOnce(url, addresses[0], { timeoutMs, maxBytes, headers: options.headers });
    if (response.statusCode < 300 || response.statusCode >= 400) {
      return response;
    }

    const location = response.headers.location;
    if (!location) return response;
    if (redirectCount === maxRedirects) {
      throw new Error('Source request exceeded the redirect limit.');
    }
    current = new URL(location, url).toString();
  }

  throw new Error('Source request exceeded the redirect limit.');
};
