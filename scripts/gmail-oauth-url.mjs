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

loadEnvFile('.env.local');
loadEnvFile('.env');

const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() || 'http://localhost:3000/oauth2callback';
const scope = process.env.GMAIL_OAUTH_SCOPE?.trim() || 'https://www.googleapis.com/auth/gmail.send';

if (!clientId) {
  console.error('Missing GMAIL_OAUTH_CLIENT_ID.');
  process.exit(1);
}

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.searchParams.set('client_id', clientId);
url.searchParams.set('redirect_uri', redirectUri);
url.searchParams.set('response_type', 'code');
url.searchParams.set('scope', scope);
url.searchParams.set('access_type', 'offline');
url.searchParams.set('prompt', 'consent');

console.log('Open this URL while signed in as the mailbox that will send app emails:');
console.log('');
console.log(url.toString());
console.log('');
console.log(`After approval, copy the "code" query parameter from the redirect to ${redirectUri}.`);
