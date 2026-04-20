#!/usr/bin/env bunx
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const chunksDir = join(process.cwd(), '.vercel', 'output', 'static', '_next', 'static', 'chunks');

if (!existsSync(chunksDir)) {
  console.error(`[pages:prepare] Missing chunks directory: ${chunksDir}`);
  process.exit(1);
}

const files = readdirSync(chunksDir);
const mainAppChunk = files.find((name) => /^main-app-[a-f0-9]+\.js$/i.test(name));

if (!mainAppChunk) {
  console.error('[pages:prepare] Could not find hashed main-app chunk');
  process.exit(1);
}

copyFileSync(join(chunksDir, mainAppChunk), join(chunksDir, 'main-app.js'));

const mainAppMap = `${mainAppChunk}.map`;
if (files.includes(mainAppMap)) {
  copyFileSync(join(chunksDir, mainAppMap), join(chunksDir, 'main-app.js.map'));
}

const headersPath = join(process.cwd(), '.vercel', 'output', 'static', '_headers');
const configPath = join(process.cwd(), '.vercel', 'output', 'config.json');
const noCacheRule = `/_next/static/chunks/main-app.js
  cache-control: no-cache, no-store, must-revalidate\n`;
const noCacheMapRule = `/_next/static/chunks/main-app.js.map
  cache-control: no-cache, no-store, must-revalidate\n`;

if (existsSync(headersPath)) {
  const existing = readFileSync(headersPath, 'utf8');
  let next = existing;
  if (!existing.includes('/_next/static/chunks/main-app.js')) {
    next = `${next.trimEnd()}\n\n${noCacheRule}`;
  }
  if (!existing.includes('/_next/static/chunks/main-app.js.map')) {
    next = `${next.trimEnd()}\n\n${noCacheMapRule}`;
  }
  if (next !== existing) {
    writeFileSync(headersPath, `${next.trimEnd()}\n`, 'utf8');
  }
}

if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(config?.routes)) {
      const existingNoCacheMain = config.routes.some(
        (route) => typeof route?.src === 'string' && route.src.includes('main-app'),
      );

      if (!existingNoCacheMain) {
        const immutableIndex = config.routes.findIndex(
          (route) =>
            typeof route?.src === 'string' &&
            route.src.includes('/_next/static/') &&
            typeof route?.headers?.['cache-control'] === 'string' &&
            route.headers['cache-control'].includes('immutable'),
        );

        const noCacheMainRoutes = [
          {
            src: '^/_next/static/chunks/main-app(?:-[^/]+)?\\.js$',
            headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
            important: true,
          },
          {
            src: '^/_next/static/chunks/main-app(?:-[^/]+)?\\.js\\.map$',
            headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
            important: true,
          },
        ];

        if (immutableIndex >= 0) {
          config.routes.splice(immutableIndex, 0, ...noCacheMainRoutes);
        } else {
          config.routes.unshift(...noCacheMainRoutes);
        }

        writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      }
    }
  } catch (error) {
    console.error(
      `[pages:prepare] Failed to update config.json cache routes: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

console.log(`[pages:prepare] Aliased ${mainAppChunk} -> main-app.js`);
