#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');
const DEFAULT_NGROK_DOMAIN = 'untarnished-berserkly-everette.ngrok-free.dev';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripAnsi = (value) =>
  value.replace(
    /\u001b\[[0-9;?]*[ -/]*[@-~]/g,
    '',
  );

const maskStripeWebhookSecrets = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/whsec_[A-Za-z0-9]+/g, (secret) =>
    secret.length > 12 ? `${secret.slice(0, 12)}...${secret.slice(-4)}` : secret,
  );
};

const parsePort = (args) => {
  const portFromEquals = args.find((arg) => arg.startsWith('--port='));
  if (portFromEquals) {
    const value = Number(portFromEquals.slice('--port='.length));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '--port') {
      const value = Number(args[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }

  const fromEnv = Number(process.env.PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return 3000;
};

const isFlagEnabled = (value, defaultValue = true) => {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  return !['0', 'false', 'off', 'no'].includes(normalized);
};

const isWsl = () => {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME?.trim()) {
    return true;
  }
  try {
    const kernel = readFileSync('/proc/version', 'utf8').toLowerCase();
    return kernel.includes('microsoft');
  } catch {
    return false;
  }
};

const windowsPathToWslPath = (windowsPath) => {
  const match = /^([A-Za-z]):\\(.+)$/.exec(windowsPath.trim());
  if (!match) {
    return null;
  }
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
};

const normalizeWindowsCommandPath = (rawPath) => {
  if (typeof rawPath !== 'string') {
    return null;
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }
  const withoutQuotes = trimmed.replace(/^"+|"+$/g, '');
  return withoutQuotes || null;
};

const findWindowsNgrokExecutable = () => {
  const windowsShellCwd = '/mnt/c';

  const fromWhere = spawnSync('cmd.exe', ['/d', '/c', 'where ngrok'], {
    encoding: 'utf8',
    timeout: 4000,
    cwd: windowsShellCwd,
  });

  if (fromWhere.status === 0 && fromWhere.stdout) {
    const candidates = fromWhere.stdout
      .split(/\r?\n/)
      .map((line) => normalizeWindowsCommandPath(line))
      .filter(Boolean);
    for (const candidate of candidates) {
      const wslPath = windowsPathToWslPath(candidate);
      if (wslPath && existsSync(wslPath)) {
        return wslPath;
      }
    }
  }

  const fromPowerShell = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$cmd = Get-Command ngrok -ErrorAction SilentlyContinue; if ($cmd) { $cmd.Source }',
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      cwd: windowsShellCwd,
    },
  );

  if (fromPowerShell.status === 0 && fromPowerShell.stdout) {
    const candidate = normalizeWindowsCommandPath(fromPowerShell.stdout.split(/\r?\n/)[0] ?? '');
    const wslPath = candidate ? windowsPathToWslPath(candidate) : null;
    if (wslPath && existsSync(wslPath)) {
      return wslPath;
    }
  }

  return null;
};

const commandRuns = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    timeout: 4000,
  });
  return result.status === 0;
};

const resolveNgrokBinary = () => {
  const explicit = process.env.NGROK_BIN?.trim();
  if (explicit) {
    return explicit;
  }

  if (commandRuns('ngrok', ['version'])) {
    return 'ngrok';
  }

  if (!isWsl()) {
    return null;
  }

  const fromWindowsPath = findWindowsNgrokExecutable();
  if (fromWindowsPath) {
    return fromWindowsPath;
  }

  const fallbackCandidates = [
    '/mnt/c/Program Files/ngrok/ngrok.exe',
    '/mnt/c/Program Files (x86)/ngrok/ngrok.exe',
  ];
  try {
    const userDirs = readdirSync('/mnt/c/Users', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    userDirs.forEach((userName) => {
      fallbackCandidates.push(`/mnt/c/Users/${userName}/AppData/Local/ngrok/ngrok.exe`);
      fallbackCandidates.push(`/mnt/c/Users/${userName}/AppData/Local/Programs/ngrok/ngrok.exe`);
      fallbackCandidates.push(`/mnt/c/Users/${userName}/AppData/Local/Microsoft/WindowsApps/ngrok.exe`);

      const windowsAppsDir = `/mnt/c/Users/${userName}/AppData/Local/Microsoft/WindowsApps`;
      try {
        const appEntries = readdirSync(windowsAppsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('ngrok.'))
          .map((entry) => entry.name);
        appEntries.forEach((entryName) => {
          fallbackCandidates.push(`${windowsAppsDir}/${entryName}/ngrok.exe`);
        });
      } catch {
        // Ignore missing WindowsApps directories.
      }
    });
  } catch {
    // Ignore missing /mnt/c/Users and rely on static fallback list.
  }
  const fallbackMatch = fallbackCandidates.find((candidate) => existsSync(candidate));
  return fallbackMatch ?? null;
};

const terminateProcess = (proc) => {
  if (!proc || proc.exitCode !== null) {
    return;
  }
  proc.kill('SIGTERM');
  setTimeout(() => {
    if (proc.exitCode === null) {
      proc.kill('SIGKILL');
    }
  }, 3000);
};

const findNextDevLockHolders = () => {
  const result = spawnSync('lsof', ['-t', '.next/dev/lock'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.error || result.status !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
};

const findRunningNextDevProcesses = () => {
  const result = spawnSync('pgrep', ['-af', 'next dev'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.error || result.status !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes(` ${process.pid} `));
};

const findTunnelUrl = (tunnels, port) => {
  const candidates = Array.isArray(tunnels) ? tunnels : [];
  const httpsByPort = candidates.find((tunnel) => {
    if (!tunnel || tunnel.proto !== 'https') {
      return false;
    }
    const addr = String(tunnel?.config?.addr ?? '');
    return addr.endsWith(`:${port}`) || addr.endsWith(`://localhost:${port}`);
  });
  if (typeof httpsByPort?.public_url === 'string' && httpsByPort.public_url.startsWith('https://')) {
    return httpsByPort.public_url;
  }

  const httpsAny = candidates.find(
    (tunnel) => tunnel && tunnel.proto === 'https' && typeof tunnel.public_url === 'string',
  );
  if (typeof httpsAny?.public_url === 'string' && httpsAny.public_url.startsWith('https://')) {
    return httpsAny.public_url;
  }

  return null;
};

const normalizeTunnelUrl = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/[)',.;]+$/g, '').replace(/^'+|'+$/g, '');
  if (!trimmed.startsWith('https://')) {
    return null;
  }
  return trimmed;
};

const parseDotEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return {};
  }
  const content = readFileSync(filePath, 'utf8');
  const entries = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key) {
      continue;
    }
    entries[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return entries;
};

const loadStripeSecretKey = () => {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const env = parseDotEnvFile('.env');
  const envLocal = parseDotEnvFile('.env.local');
  const merged = { ...env, ...envLocal };
  const fromFiles = merged.STRIPE_SECRET_KEY?.trim();
  return fromFiles || null;
};

const resolveStripeBinary = () => {
  const explicit = process.env.STRIPE_CLI_BIN?.trim();
  if (explicit) {
    return explicit;
  }
  if (commandRuns('stripe', ['version'])) {
    return 'stripe';
  }
  return null;
};

const waitForStripeWebhookSecret = (stripeProc, timeoutMs) =>
  new Promise((resolve) => {
    let settled = false;
    let secret = null;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(null), timeoutMs);

    const consume = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[stripe] ${maskStripeWebhookSecrets(text)}`);
      const cleaned = stripAnsi(text);
      const match = cleaned.match(/whsec_[A-Za-z0-9]+/);
      if (match?.[0]) {
        secret = match[0];
        clearTimeout(timeoutId);
        finish(secret);
      }
    };

    stripeProc.stdout?.on('data', consume);
    stripeProc.stderr?.on('data', consume);
    stripeProc.once('exit', () => {
      clearTimeout(timeoutId);
      finish(secret);
    });
  });

const startStripeListener = async (port) => {
  const stripeBin = resolveStripeBinary();
  if (!stripeBin) {
    return {
      stripeProc: null,
      webhookSecret: null,
      error: new Error('Stripe CLI not found. Install Stripe CLI or set STRIPE_CLI_BIN.'),
    };
  }

  const secretKey = loadStripeSecretKey();
  const stripeArgs = [
    'listen',
    '--forward-to',
    `http://localhost:${port}/api/billing/webhook`,
    '--events',
    'payment_intent.succeeded',
  ];
  if (secretKey) {
    stripeArgs.push('--api-key', secretKey);
  }

  let spawnError = null;
  const stripeProc = spawn(stripeBin, stripeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  stripeProc.once('error', (error) => {
    spawnError = error;
  });

  await sleep(250);
  if (spawnError) {
    return { stripeProc: null, webhookSecret: null, error: spawnError };
  }

  const webhookSecret = await waitForStripeWebhookSecret(stripeProc, 20_000);
  if (!webhookSecret) {
    terminateProcess(stripeProc);
    return {
      stripeProc: null,
      webhookSecret: null,
      error: new Error('Timed out waiting for Stripe listener webhook secret.'),
    };
  }

  await sleep(200);
  if (stripeProc.exitCode !== null) {
    return {
      stripeProc: null,
      webhookSecret: null,
      error: new Error('Stripe listener exited before becoming ready.'),
    };
  }

  return { stripeProc, webhookSecret, error: null };
};

const waitForNgrokUrl = async (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        const url = findTunnelUrl(payload?.tunnels, port);
        if (url) {
          return url;
        }
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(400);
  }
  return null;
};

const waitForNgrokUrlFromStdout = (ngrokProc, timeoutMs) => {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const timeoutId = setTimeout(() => finish(null), timeoutMs);

    ngrokProc.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[ngrok] ${text}`);
      const normalizedText = text.toLowerCase();
      if (normalizedText.includes('failed to start tunnel') || normalizedText.includes('err_ngrok_')) {
        return;
      }
      const matches = text.match(/https:\/\/[^\s"'`]+/g) ?? [];
      const found = matches
        .map((candidate) => normalizeTunnelUrl(candidate))
        .find((candidate) => candidate && candidate.includes('ngrok'));
      if (found) {
        clearTimeout(timeoutId);
        finish(found);
      }
    });

    ngrokProc.once('exit', () => {
      clearTimeout(timeoutId);
      finish(null);
    });
  });
};

const buildNgrokErrorMessage = (rawOutput) => {
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    return null;
  }
  const output = rawOutput.toLowerCase();
  if (output.includes('err_ngrok_334')) {
    const endpointMatch = rawOutput.match(/https:\/\/[^\s'"]+/);
    const endpoint = endpointMatch?.[0];
    if (endpoint) {
      return `ngrok endpoint already online (${endpoint}). Stop the existing tunnel or enable pooling before starting dev.`;
    }
    return 'ngrok endpoint is already online (ERR_NGROK_334). Stop the existing tunnel or enable pooling before starting dev.';
  }
  if (output.includes('failed to authenticate') || output.includes('err_ngrok_105')) {
    return 'ngrok authentication failed. Run `ngrok config add-authtoken <token>` on Windows and retry.';
  }
  return null;
};

const startNgrok = async (port) => {
  const ngrokBin = resolveNgrokBinary();
  if (!ngrokBin) {
    return {
      ngrokProc: null,
      publicUrl: null,
      error: new Error('ngrok executable not found. Install ngrok or set NGROK_BIN.'),
    };
  }
  console.log(`[dev] using ngrok binary: ${ngrokBin}`);
  const ngrokArgs = ['http', String(port), '--log', 'stdout'];
  const ngrokDomain = process.env.NGROK_DOMAIN?.trim()
    || process.env.MVP_DEV_NGROK_DOMAIN?.trim()
    || DEFAULT_NGROK_DOMAIN;
  if (ngrokDomain) {
    ngrokArgs.push('--domain', ngrokDomain);
  }
  if (process.env.NGROK_REGION?.trim()) {
    ngrokArgs.push('--region', process.env.NGROK_REGION.trim());
  }

  let spawnError = null;
  let ngrokOutput = '';
  const ngrokProc = spawn(ngrokBin, ngrokArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  ngrokProc.once('error', (error) => {
    spawnError = error;
  });
  ngrokProc.stdout?.on('data', (chunk) => {
    ngrokOutput = `${ngrokOutput}${chunk.toString()}`.slice(-16_000);
  });

  ngrokProc.stderr?.on('data', (chunk) => {
    ngrokOutput = `${ngrokOutput}${chunk.toString()}`.slice(-16_000);
    process.stderr.write(`[ngrok] ${chunk}`);
  });

  await sleep(200);
  if (spawnError) {
    return { ngrokProc: null, publicUrl: null, error: spawnError };
  }

  const publicUrl = await Promise.race([
    waitForNgrokUrlFromStdout(ngrokProc, 20_000),
    waitForNgrokUrl(port, 20_000),
  ]);
  if (!publicUrl) {
    terminateProcess(ngrokProc);
    const specificError = buildNgrokErrorMessage(ngrokOutput);
    return {
      ngrokProc: null,
      publicUrl: null,
      error: new Error(specificError ?? 'Timed out waiting for ngrok tunnel URL (check ngrok auth/session).'),
    };
  }

  await sleep(300);
  if (ngrokProc.exitCode !== null) {
    const specificError = buildNgrokErrorMessage(ngrokOutput);
    return {
      ngrokProc: null,
      publicUrl: null,
      error: new Error(specificError ?? 'ngrok exited before establishing a stable tunnel.'),
    };
  }

  return { ngrokProc, publicUrl, error: null };
};

const run = async () => {
  const args = process.argv.slice(2);
  const port = parsePort(args);
  const enableNgrok = isFlagEnabled(process.env.MVP_DEV_ENABLE_NGROK, true);
  const enableStripeListen = isFlagEnabled(process.env.MVP_DEV_ENABLE_STRIPE_LISTEN, true);
  const requireNgrok = isFlagEnabled(process.env.MVP_DEV_REQUIRE_NGROK, false);
  const requireStripeListen = isFlagEnabled(process.env.MVP_DEV_REQUIRE_STRIPE_LISTEN, false);

  let ngrokProc = null;
  let publicUrl = null;
  let stripeProc = null;
  let stripeWebhookSecret = null;

  if (enableNgrok) {
    const ngrokResult = await startNgrok(port);
    if (ngrokResult.error) {
      if (requireNgrok) {
        throw ngrokResult.error;
      }
      console.warn(`[dev] ngrok unavailable; continuing without tunnel (${ngrokResult.error.message})`);
    } else {
      ngrokProc = ngrokResult.ngrokProc;
      publicUrl = ngrokResult.publicUrl;
      console.log(`[dev] ngrok tunnel ready: ${publicUrl}`);
      try {
        const boldSignWebhookUrl = new URL('/api/documents/webhook', publicUrl).toString();
        const billingWebhookUrl = new URL('/api/billing/webhook', publicUrl).toString();
        console.log(`[dev] BoldSign webhook URL: ${boldSignWebhookUrl}`);
        console.log(`[dev] Stripe billing webhook URL: ${billingWebhookUrl}`);
      } catch {
        // Ignore malformed URL edge cases and continue startup.
      }
    }
  }

  const nextEnv = { ...process.env };
  if (publicUrl) {
    nextEnv.BOLDSIGN_DEV_REDIRECT_BASE_URL = publicUrl;
    nextEnv.NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL = publicUrl;
    nextEnv.PUBLIC_WEB_BASE_URL = publicUrl;
    try {
      nextEnv.STRIPE_CONNECT_REDIRECT_URI = new URL('/api/billing/host/callback', publicUrl).toString();
    } catch {
      // Ignore malformed URL edge cases and continue startup.
    }
    nextEnv.MVP_DEV_NGROK_URL = publicUrl;
  }

  if (enableStripeListen) {
    const stripeResult = await startStripeListener(port);
    if (stripeResult.error) {
      if (requireStripeListen) {
        throw stripeResult.error;
      }
      console.warn(`[dev] stripe listen unavailable; continuing without local webhook forward (${stripeResult.error.message})`);
      console.warn(
        `[dev] run manually: stripe listen --events payment_intent.succeeded --forward-to http://localhost:${port}/api/billing/webhook`,
      );
    } else {
      stripeProc = stripeResult.stripeProc;
      stripeWebhookSecret = stripeResult.webhookSecret;
      const maskedSecret =
        stripeWebhookSecret.length > 12
          ? `${stripeWebhookSecret.slice(0, 12)}...${stripeWebhookSecret.slice(-4)}`
          : stripeWebhookSecret;
      console.log(`[dev] stripe listener ready: forwarding to http://localhost:${port}/api/billing/webhook`);
      console.log(`[dev] stripe webhook secret (session): ${maskedSecret}`);

      const existingSecrets = (nextEnv.STRIPE_WEBHOOK_SECRETS ?? '')
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const combinedSecrets = Array.from(new Set([stripeWebhookSecret, ...existingSecrets])).join(',');
      nextEnv.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;
      nextEnv.STRIPE_WEBHOOK_SECRETS = combinedSecrets;
    }
  }

  const nextProc = spawn(process.execPath, [nextCli, 'dev', ...args], {
    stdio: 'inherit',
    env: nextEnv,
  });

  const shutdown = () => {
    terminateProcess(nextProc);
    terminateProcess(stripeProc);
    terminateProcess(ngrokProc);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  nextProc.on('exit', (code, signal) => {
    terminateProcess(stripeProc);
    terminateProcess(ngrokProc);
    if (typeof code === 'number' && code !== 0) {
      const lockHolders = findNextDevLockHolders();
      if (lockHolders.length > 0) {
        console.error(
          `[dev] next dev lock is held by PID(s): ${lockHolders.join(', ')}. ` +
            'Stop the existing next process and restart with `npm run dev` so webhook forwarding runs in the same session.',
        );
      } else {
        const existingNextDev = findRunningNextDevProcesses();
        if (existingNextDev.length > 0) {
          console.error('[dev] another next dev process appears to be running:');
          existingNextDev.forEach((line) => console.error(`  ${line}`));
          console.error(
            '[dev] stop that process and restart with `npm run dev` so webhook forwarding runs in the same session.',
          );
        }
      }
    }
    if (typeof code === 'number') {
      process.exit(code);
      return;
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(0);
  });
};

run().catch((error) => {
  console.error('[dev] failed to start development server:', error);
  process.exit(1);
});
