const parseTimeoutMs = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const normalizeMultilineEnv = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\\n/g, '\n').trim();
  return normalized.length > 0 ? normalized : undefined;
};

const decodeBase64Env = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    return normalizeMultilineEnv(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
};

const getSslCaCertificate = (env: NodeJS.ProcessEnv): string | undefined => {
  return (
    normalizeMultilineEnv(env.PG_SSL_CA_CERT)
    ?? normalizeMultilineEnv(env.PG_CA_CERT)
    ?? decodeBase64Env(env.PG_SSL_CA_CERT_BASE64)
    ?? decodeBase64Env(env.PG_CA_CERT_BASE64)
  );
};

const getConnectionString = (env: NodeJS.ProcessEnv, hasInlineCaCert: boolean): string => {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const sslRejectUnauthorized = parseBoolean(env.PG_SSL_REJECT_UNAUTHORIZED);

  if (sslRejectUnauthorized === undefined && !hasInlineCaCert) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    if (hasInlineCaCert) {
      // pg's connection string parser gives priority to `sslmode` over the `ssl` object.
      // Remove it so the explicit TLS object (with CA cert) controls verification.
      url.searchParams.delete('sslmode');
      return url.toString();
    }

    if (sslRejectUnauthorized !== undefined) {
      // Normalize sslmode directly so env override is deterministic.
      if (sslRejectUnauthorized) {
        url.searchParams.set('sslmode', 'verify-full');
      } else {
        url.searchParams.set('sslmode', 'no-verify');
      }
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};

export type PrismaPgPoolConfig = {
  connectionString: string;
  connectionTimeoutMillis: number;
  ssl?: {
    rejectUnauthorized: boolean;
    ca: string;
  };
};

export const resolvePrismaPgPoolConfig = (env: NodeJS.ProcessEnv = process.env): PrismaPgPoolConfig => {
  // Prevent requests from hanging indefinitely when the DB is unreachable.
  // Override via `PG_CONNECTION_TIMEOUT_MS` if you need a different value.
  const connectionTimeoutMillis = parseTimeoutMs(env.PG_CONNECTION_TIMEOUT_MS, 5_000);
  const sslRejectUnauthorized = parseBoolean(env.PG_SSL_REJECT_UNAUTHORIZED);
  const caCertificate = getSslCaCertificate(env);

  const poolConfig: PrismaPgPoolConfig = {
    connectionString: getConnectionString(env, Boolean(caCertificate)),
    connectionTimeoutMillis,
  };

  if (caCertificate) {
    poolConfig.ssl = {
      rejectUnauthorized: sslRejectUnauthorized ?? true,
      ca: caCertificate,
    };
  }

  return poolConfig;
};
