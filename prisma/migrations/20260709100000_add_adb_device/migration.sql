-- CreateTable
CREATE TABLE "AdbDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5555,
    "model" TEXT,
    "product" TEXT,
    "device" TEXT,
    "transport" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdbDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdbDevice_ip_port_key" ON "AdbDevice"("ip", "port");

-- CreateIndex
CREATE INDEX "AdbDevice_userId_idx" ON "AdbDevice"("userId");
