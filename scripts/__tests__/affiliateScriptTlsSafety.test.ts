/** @jest-environment node */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const listScriptFiles = (directory: string): string[] => (
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listScriptFiles(filePath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [filePath] : [];
  })
);

describe('affiliate script TLS safety', () => {
  it('never disables Node-wide HTTPS certificate verification', () => {
    const scriptRoot = path.join(process.cwd(), 'scripts');
    const offenders = listScriptFiles(scriptRoot)
      .filter((filePath) => readFileSync(filePath, 'utf8').includes('NODE_TLS_REJECT_UNAUTHORIZED'))
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
