import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    // Integration tests run via vitest.integration.config.ts against a real DB.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
    // The env module validates on import; provide values so importing it under
    // test doesn't throw before assertions run.
    env: {
      DATABASE_URL: 'postgresql://localhost:5432/recoverflow_test',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
  },
});
