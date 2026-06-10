import crypto from 'crypto';

const SECRET_VERSION = 'v1';

const getKeySource = (override?: string | null): string => {
  const source = override?.trim()
    || process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim()
    || process.env.AUTH_SECRET?.trim();
  if (!source) {
    throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY or AUTH_SECRET is required for token encryption.');
  }
  return source;
};

const deriveKey = (source?: string | null): Buffer => (
  crypto.createHash('sha256').update(getKeySource(source), 'utf8').digest()
);

export const encryptSecret = (value: string, keySource?: string | null): string => {
  if (!value) {
    throw new Error('Cannot encrypt an empty secret.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(keySource), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
};

export const decryptSecret = (value: string, keySource?: string | null): string => {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== SECRET_VERSION || !iv || !tag || !encrypted) {
    throw new Error('Encrypted secret has an unsupported format.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(keySource),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
