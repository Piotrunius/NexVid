import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

function getBuildInfo() {
  let timestamp = new Date().toISOString();
  let commit = 'unknown';
  let author = 'unknown';
  let message = 'unknown';

  try {
    // Pobieramy datę ostatniego commita w formacie ISO
    timestamp = execSync('git log -1 --format=%cI').toString().trim();
    commit = execSync('git rev-parse --short HEAD').toString().trim();
    author = execSync('git log -1 --format=%an').toString().trim();
    message = execSync('git log -1 --format=%s').toString().trim();
  } catch (error) {
    console.warn('Could not get git info, using current time instead:', error.message);
  }

  return {
    timestamp,
    commit,
    author,
    message
  };
}

const buildInfo = getBuildInfo();
const outputPath = join(process.cwd(), 'src', 'lib', 'build-info.json');

writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2), 'utf8');
console.log(`[build-info] Generated from last commit:`, buildInfo);
