#!/usr/bin/env node

/**
 * Capture build information (git commit, build timestamp, etc.)
 * This script is run during Docker build to capture the git commit hash
 * and save it as an environment variable or file for the application to use.
 *
 * Usage:
 *   node scripts/capture-build-info.js
 *
 * Outputs:
 *   - GIT_COMMIT environment variable (for Docker)
 *   - BUILD_TIMESTAMP environment variable (for Docker)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function captureGitInfo() {
  try {
    // Get short commit hash
    const gitCommit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return gitCommit;
  } catch (error) {
    return 'unknown';
  }
}

function captureRefInfo() {
  try {
    // Get branch name
    const gitRef = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return gitRef;
  } catch (error) {
    return 'unknown';
  }
}

// Capture build information
const gitCommit = captureGitInfo();
const gitRef = captureRefInfo();
const buildTimestamp = new Date().toISOString();

// Output for Docker build
process.stdout.write(`GIT_COMMIT=${gitCommit}\n`);
process.stdout.write(`GIT_REF=${gitRef}\n`);
process.stdout.write(`BUILD_TIMESTAMP=${buildTimestamp}\n`);

// Optionally write to a file for reference
const buildInfoPath = path.join(__dirname, '..', '.build-info');
try {
  fs.writeFileSync(
    buildInfoPath,
    `GIT_COMMIT=${gitCommit}\nGIT_REF=${gitRef}\nBUILD_TIMESTAMP=${buildTimestamp}\n`
  );
} catch (error) {
  // Silent error handling
}

process.exit(0);
