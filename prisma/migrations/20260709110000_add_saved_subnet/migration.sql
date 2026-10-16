-- CreateTable
CREATE TABLE "SavedSubnet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSubnet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedSubnet_cidr_key" ON "SavedSubnet"("cidr");

-- CreateIndex
CREATE INDEX "SavedSubnet_userId_idx" ON "SavedSubnet"("userId");
