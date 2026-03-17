/** @jest-environment node */

import { resolvePrismaPgPoolConfig } from '@/lib/prismaConfig';

describe('resolvePrismaPgPoolConfig', () => {
  const baseUrl = 'postgresql://user:pass@db.example.com:25060/mvp-db?sslmode=require';

  it('keeps the original connection string when no SSL env overrides are set', () => {
    const config = resolvePrismaPgPoolConfig({
      DATABASE_URL: baseUrl,
    } as NodeJS.ProcessEnv);

    expect(config.connectionString).toBe(baseUrl);
    expect(config.ssl).toBeUndefined();
  });

  it('maps PG_SSL_REJECT_UNAUTHORIZED=true to sslmode=verify-full when CA is not provided', () => {
    const config = resolvePrismaPgPoolConfig({
      DATABASE_URL: baseUrl,
      PG_SSL_REJECT_UNAUTHORIZED: 'true',
    } as NodeJS.ProcessEnv);

    expect(config.connectionString).toContain('sslmode=verify-full');
    expect(config.ssl).toBeUndefined();
  });

  it('uses inline CA cert and strips sslmode when PG_SSL_CA_CERT_BASE64 is provided', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nline1\nline2\n-----END CERTIFICATE-----\n';
    const config = resolvePrismaPgPoolConfig({
      DATABASE_URL: baseUrl,
      PG_SSL_REJECT_UNAUTHORIZED: 'true',
      PG_SSL_CA_CERT_BASE64: Buffer.from(pem, 'utf8').toString('base64'),
    } as NodeJS.ProcessEnv);

    expect(config.connectionString).not.toContain('sslmode=');
    expect(config.ssl).toEqual({
      rejectUnauthorized: true,
      ca: pem.trim(),
    });
  });

  it('normalizes escaped newlines for raw PG_SSL_CA_CERT values', () => {
    const config = resolvePrismaPgPoolConfig({
      DATABASE_URL: baseUrl,
      PG_SSL_CA_CERT: '-----BEGIN CERTIFICATE-----\\nline\\n-----END CERTIFICATE-----\\n',
    } as NodeJS.ProcessEnv);

    expect(config.ssl?.ca).toBe('-----BEGIN CERTIFICATE-----\nline\n-----END CERTIFICATE-----');
    expect(config.ssl?.rejectUnauthorized).toBe(true);
  });
});
