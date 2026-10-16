WITH duplicates AS (
  SELECT
    id,
    name,
    row_number() OVER (PARTITION BY name ORDER BY "createdAt", id) AS duplicate_number
  FROM "Server"
)
UPDATE "Server"
SET name = duplicates.name || ' (' || duplicates.duplicate_number || ')'
FROM duplicates
WHERE "Server".id = duplicates.id
  AND duplicates.duplicate_number > 1;

CREATE UNIQUE INDEX "Server_name_key" ON "Server"("name");
