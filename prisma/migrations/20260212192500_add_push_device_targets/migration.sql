-- CreateTable
CREATE TABLE "PushDeviceTarget" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "pushTarget" TEXT,
    "pushPlatform" TEXT,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "PushDeviceTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDeviceTarget_pushToken_key" ON "PushDeviceTarget"("pushToken");

-- CreateIndex
CREATE INDEX "PushDeviceTarget_userId_idx" ON "PushDeviceTarget"("userId");

-- CreateIndex
CREATE INDEX "PushDeviceTarget_pushTarget_idx" ON "PushDeviceTarget"("pushTarget");
