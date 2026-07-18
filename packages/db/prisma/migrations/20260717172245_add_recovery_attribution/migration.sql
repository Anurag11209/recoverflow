-- CreateEnum
CREATE TYPE "RecoveryAttribution" AS ENUM ('LINK', 'ORGANIC');

-- AlterTable
-- Additive: how a case was recovered (null until RECOVERED). Safe on a populated
-- table (nullable column, no existing rows changed).
ALTER TABLE "RecoveryCase" ADD COLUMN "recoveryAttribution" "RecoveryAttribution";
