-- Add Proxmox and reboot tracking fields to Server
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "isProxmox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "needsReboot" BOOLEAN NOT NULL DEFAULT false;
