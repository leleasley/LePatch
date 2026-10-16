CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

ALTER TABLE "User" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Lewis';
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'admin';
