UPDATE "ServerPackage"
SET "dockerDigest" = regexp_replace("dockerDigest", '^.*@', '')
WHERE "manager" = 'docker'
  AND "dockerDigest" IS NOT NULL
  AND strpos("dockerDigest", '@') > 0;

DELETE FROM "ServerPackage" legacy
USING "ServerPackage" current
WHERE legacy."id" <> current."id"
  AND legacy."serverId" = current."serverId"
  AND legacy."name" = current."name"
  AND legacy."manager" = current."manager"
  AND legacy."manager" = 'docker'
  AND legacy."dockerRepo" = ''
  AND legacy."dockerTag" = ''
  AND current."dockerRepo" <> ''
  AND current."dockerTag" <> '';
