-- AlterTable: Add uptimeSeconds and lastError to AdbDevice
ALTER TABLE "AdbDevice" ADD COLUMN "uptimeSeconds" INTEGER;
ALTER TABLE "AdbDevice" ADD COLUMN "lastError" TEXT;
