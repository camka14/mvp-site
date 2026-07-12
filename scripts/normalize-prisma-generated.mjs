import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirectory = path.join(rootDirectory, 'src', 'generated', 'prisma');

const generatedTypeScriptFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return generatedTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });

let normalizedFileCount = 0;
for (const filePath of generatedTypeScriptFiles(generatedDirectory)) {
  const source = readFileSync(filePath, 'utf8');
  const normalized = source.replace(/[\t ]+(?=\r?\n)/g, '');
  if (source !== normalized) {
    writeFileSync(filePath, normalized);
    normalizedFileCount += 1;
  }
}

console.log(`Normalized trailing whitespace in ${normalizedFileCount} generated Prisma file(s).`);
