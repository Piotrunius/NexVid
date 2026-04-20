#!/usr/bin/env bunx
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

function getBuildInfo() {
  let timestamp = new Date().toISOString();
  let commit = 'unknown';
  let message = 'unknown';

  try {
    // Get last commit date in ISO format
    timestamp = execSync('git log -1 --format=%cI').toString().trim();
    commit = execSync('git rev-parse --short HEAD').toString().trim();
    message = execSync('git log -1 --format=%s').toString().trim();
  } catch (error) {
    console.warn('Could not get git info, using current time instead:', error?.message || error);
  }

  return {
    timestamp,
    commit,
    message,
  };
}

const buildInfo = getBuildInfo();
const outputPath = join(process.cwd(), 'src', 'lib', 'build-info.json');

writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2), 'utf8');
console.log('[build-info] Generated from last commit:', buildInfo);
