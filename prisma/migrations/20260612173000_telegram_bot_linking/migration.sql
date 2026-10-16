-- CreateTable
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_userId_key" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_telegramUserId_key" ON "TelegramLink"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE INDEX "TelegramLink_chatId_idx" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_userId_expiresAt_idx" ON "TelegramLinkToken"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
