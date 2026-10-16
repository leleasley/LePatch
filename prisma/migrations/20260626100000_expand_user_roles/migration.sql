ALTER TYPE "UserRole" RENAME VALUE 'admin' TO 'administrator';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'restricted';
