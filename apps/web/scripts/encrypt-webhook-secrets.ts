/**
 * One-off migration: encrypt any plaintext razorpayWebhookSecret rows in place.
 * Idempotent — already-encrypted (v1:) values are skipped. Safe to re-run.
 *
 * Run with env loaded:
 *   pnpm dotenv -e .env -- pnpm tsx apps/web/scripts/encrypt-webhook-secrets.ts
 */
import { prisma } from '@recoverflow/db';
import { encryptSecret, isEncrypted } from '../lib/crypto/secret-cipher';

async function main() {
  const merchants = await prisma.merchant.findMany({
    select: { id: true, razorpayWebhookSecret: true },
  });
  let encrypted = 0;
  let skipped = 0;
  for (const m of merchants) {
    if (isEncrypted(m.razorpayWebhookSecret)) {
      skipped += 1;
      continue;
    }
    await prisma.merchant.update({
      where: { id: m.id },
      data: { razorpayWebhookSecret: encryptSecret(m.razorpayWebhookSecret) },
    });
    encrypted += 1;
  }
  console.log(`webhook-secret migration: ${encrypted} encrypted, ${skipped} already encrypted`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
