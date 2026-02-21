#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (process.env.NGROK_DOMAIN?.trim()) {
    ngrokArgs.push('--domain', process.env.NGROK_DOMAIN.trim());
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

  let ngrokProc = null;
  let publicUrl = null;

  if (enableNgrok) {
    const ngrokResult = await startNgrok(port);
    if (ngrokResult.error) {
      console.warn(`[dev] ngrok unavailable; continuing without tunnel (${ngrokResult.error.message})`);
    } else {
      ngrokProc = ngrokResult.ngrokProc;
      publicUrl = ngrokResult.publicUrl;
      console.log(`[dev] ngrok tunnel ready: ${publicUrl}`);
      try {
        const webhookUrl = new URL('/api/documents/webhook', publicUrl).toString();
        console.log(`[dev] BoldSign webhook URL: ${webhookUrl}`);
      } catch {
        // Ignore malformed URL edge cases and continue startup.
      }
    }
  }

  const nextEnv = { ...process.env };
  if (publicUrl) {
    nextEnv.BOLDSIGN_DEV_REDIRECT_BASE_URL = publicUrl;
    nextEnv.NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL = publicUrl;
    nextEnv.MVP_DEV_NGROK_URL = publicUrl;
  }

  const nextProc = spawn(process.execPath, [nextCli, 'dev', ...args], {
    stdio: 'inherit',
    env: nextEnv,
  });

  const shutdown = () => {
    terminateProcess(nextProc);
    terminateProcess(ngrokProc);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  nextProc.on('exit', (code, signal) => {
    terminateProcess(ngrokProc);
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
