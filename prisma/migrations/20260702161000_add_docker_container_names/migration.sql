ALTER TABLE "ServerPackage"
  ADD COLUMN "dockerContainerNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
