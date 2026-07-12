import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(rootDirectory, 'prisma', 'schema.prisma');
const deprecatedSchemaPath = path.join(rootDirectory, 'prisma', 'schema.generated.prisma');
const generatedClientPath = path.join(rootDirectory, 'src', 'generated', 'prisma', 'internal', 'class.ts');
const projectPackagePath = path.join(rootDirectory, 'package.json');
const clientPackagePath = path.join(rootDirectory, 'node_modules', '@prisma', 'client', 'package.json');
const prismaPackagePath = path.join(rootDirectory, 'node_modules', 'prisma', 'package.json');

const normalizeSchema = (schema) => {
  let normalized = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;

  for (let index = 0; index < schema.length; index += 1) {
    const character = schema[index];
    const nextCharacter = schema[index + 1];

    if (inLineComment) {
      if (character === '\n') inLineComment = false;
      continue;
    }

    if (inString) {
      normalized += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      inLineComment = true;
      index += 1;
    } else if (character === '"') {
      inString = true;
      normalized += character;
    } else if (!/\s/.test(character)) {
      normalized += character;
    }
  }

  return normalized;
};

const extractInlineSchema = (generatedClient) => {
  const match = generatedClient.match(/"inlineSchema":\s*("(?:\\.|[^"\\])*")/);
  if (!match) {
    throw new Error(`Could not read the inline Prisma schema from ${generatedClientPath}.`);
  }
  return JSON.parse(match[1]);
};

const extractGeneratedClientVersion = (generatedClient) => {
  const match = generatedClient.match(/"clientVersion":\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not read the Prisma client version from ${generatedClientPath}.`);
  }
  return match[1];
};

if (existsSync(deprecatedSchemaPath)) {
  throw new Error(
    'Found deprecated prisma/schema.generated.prisma. prisma/schema.prisma is the only supported schema source.',
  );
}

const generatedClient = readFileSync(generatedClientPath, 'utf8');
const canonicalSchema = normalizeSchema(readFileSync(schemaPath, 'utf8'));
const generatedSchema = normalizeSchema(extractInlineSchema(generatedClient));

if (canonicalSchema !== generatedSchema) {
  throw new Error(
    'The generated Prisma client does not match prisma/schema.prisma. Run npm run prisma:generate and commit the result.',
  );
}

const projectPackage = JSON.parse(readFileSync(projectPackagePath, 'utf8'));
const expectedClientVersion = projectPackage.dependencies?.['@prisma/client'];
const expectedPrismaVersion = projectPackage.devDependencies?.prisma ?? projectPackage.dependencies?.prisma;
const installedClientVersion = JSON.parse(readFileSync(clientPackagePath, 'utf8')).version;
const installedPrismaVersion = JSON.parse(readFileSync(prismaPackagePath, 'utf8')).version;
const generatedClientVersion = extractGeneratedClientVersion(generatedClient);

if (
  !expectedClientVersion
  || !expectedPrismaVersion
  || new Set([
    expectedClientVersion,
    expectedPrismaVersion,
    installedClientVersion,
    installedPrismaVersion,
    generatedClientVersion,
  ]).size !== 1
) {
  throw new Error(
    `Prisma versions are mismatched: package @prisma/client=${expectedClientVersion}, package prisma=${expectedPrismaVersion}, ` +
      `installed @prisma/client=${installedClientVersion}, installed prisma=${installedPrismaVersion}, generated=${generatedClientVersion}. ` +
      'Run npm install, then npm run prisma:check.',
  );
}

console.log('Prisma schema surface verified: canonical schema, generated client, and Prisma versions match.');
