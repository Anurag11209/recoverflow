import { env } from './env';

// Importing ./env runs validation; on failure the process exits non-zero.
console.log(`[env] OK — NODE_ENV=${env.NODE_ENV}, NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`);
