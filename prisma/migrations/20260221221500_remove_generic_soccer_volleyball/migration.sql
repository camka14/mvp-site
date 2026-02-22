-- Remove generic Soccer/Volleyball sports in favor of explicit Indoor/Grass/Beach variants.
-- Remap existing references before deleting deprecated rows.

UPDATE "Events"
SET "sportId" = 'Indoor Soccer'
WHERE "sportId" = 'Soccer';

UPDATE "Events"
SET "sportId" = 'Indoor Volleyball'
WHERE "sportId" = 'Volleyball';

UPDATE "Divisions"
SET "sportId" = 'Indoor Soccer'
WHERE "sportId" = 'Soccer';

UPDATE "Divisions"
SET "sportId" = 'Indoor Volleyball'
WHERE "sportId" = 'Volleyball';

UPDATE "VolleyBallTeams"
SET "sport" = 'Indoor Soccer'
WHERE "sport" = 'Soccer';

UPDATE "VolleyBallTeams"
SET "sport" = 'Indoor Volleyball'
WHERE "sport" = 'Volleyball';

UPDATE "Organizations"
SET "sports" = array_replace(array_replace("sports", 'Soccer', 'Indoor Soccer'), 'Volleyball', 'Indoor Volleyball')
WHERE "sports" && ARRAY['Soccer', 'Volleyball']::text[];

DELETE FROM "Sports"
WHERE "id" IN ('Soccer', 'Volleyball')
   OR LOWER("name") IN ('soccer', 'volleyball');
