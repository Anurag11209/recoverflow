export default {
  '*.{ts,tsx,js,mjs,cjs}': [
    'prettier --write',
    'eslint --fix',
    'vitest related --run --passWithNoTests',
  ],
  '*.{json,jsonc,md,css,yml,yaml}': ['prettier --write'],
};
