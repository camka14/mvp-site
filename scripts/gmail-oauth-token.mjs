import fs from 'node:fs';

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
};

const readArg = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1]?.trim();
  }
  return undefined;
};

loadEnvFile('.env.local');
loadEnvFile('.env');

const code = readArg('code') || process.env.GMAIL_OAUTH_CODE?.trim();
const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() || 'http://localhost:3000/oauth2callback';

const missing = [
  ['code', code],
  ['GMAIL_OAUTH_CLIENT_ID', clientId],
  ['GMAIL_OAUTH_CLIENT_SECRET', clientSecret],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing required value(s): ${missing.join(', ')}`);
  console.error('Usage: npm run gmail:oauth:token -- --code "AUTHORIZATION_CODE"');
  process.exit(1);
}

const body = new URLSearchParams({
  code,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: redirectUri,
  grant_type: 'authorization_code',
});

const response = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
});
const json = await response.json().catch(() => null);

if (!response.ok) {
  console.error('Token exchange failed.');
  console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log('Token exchange succeeded.');
console.log('');
if (json.refresh_token) {
  console.log('Add this to your local and deployment secrets:');
  console.log('');
  console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${json.refresh_token}`);
} else {
  console.log('Google did not return a refresh_token.');
  console.log('Re-run the consent URL with access_type=offline and prompt=consent, or revoke this app from the Google account and try again.');
}
console.log('');
console.log(`Access token received: ${json.access_token ? '<redacted>' : '<missing>'}`);
console.log(`Expires in: ${json.expires_in ?? '<unknown>'} seconds`);
