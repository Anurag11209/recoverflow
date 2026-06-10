import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env for local runs. dotenv does not override variables
// already set in the environment (so CI's job-level env wins) and silently
// no-ops when the file is absent (as in CI). Integration tests use the REAL
// DATABASE_URL — no fake value is injected here.
loadDotenv({ path: resolve(process.cwd(), '.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    // Hits a shared database; run serially to avoid cross-file interference.
    fileParallelism: false,
  },
});
