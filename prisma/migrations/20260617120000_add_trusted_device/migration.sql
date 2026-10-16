-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "TrustedDevice_tokenHash_idx" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
