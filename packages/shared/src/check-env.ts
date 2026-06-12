import { getEnv } from './env';

// getEnv() runs validation; on failure it throws and the process exits non-zero.
// (Validation is now lazy — triggered by calling getEnv(), not by import — so the
// check is explicit here, which is exactly what this preflight script wants.)
const env = getEnv();
console.log(`[env] OK — NODE_ENV=${env.NODE_ENV}, NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`);
