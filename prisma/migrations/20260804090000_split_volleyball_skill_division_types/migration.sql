UPDATE "Sports"
SET "skillDivisionTypes" = '[
  {"id":"open","name":"Open"},
  {"id":"competitive","name":"Competitive"},
  {"id":"premier","name":"Premier"},
  {"id":"local","name":"Local"},
  {"id":"national","name":"National"},
  {"id":"regional","name":"Regional"},
  {"id":"gold","name":"Gold"},
  {"id":"elite","name":"Elite"},
  {"id":"select","name":"Select"},
  {"id":"developmental","name":"Developmental"}
]'::jsonb
WHERE "id" = 'Indoor Volleyball'
   OR LOWER(TRIM("name")) = 'indoor volleyball';

UPDATE "Sports"
SET "skillDivisionTypes" = '[
  {"id":"open","name":"Open"},
  {"id":"aa","name":"AA"},
  {"id":"a","name":"A"},
  {"id":"bb","name":"BB"},
  {"id":"b","name":"B"},
  {"id":"c","name":"C"}
]'::jsonb
WHERE "id" IN ('Beach Volleyball', 'Grass Volleyball')
   OR LOWER(TRIM("name")) IN ('beach volleyball', 'grass volleyball');
