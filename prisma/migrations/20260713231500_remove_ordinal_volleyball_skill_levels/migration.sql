UPDATE "Sports"
SET "skillDivisionTypes" = (
  SELECT COALESCE(jsonb_agg(option_value ORDER BY option_index), '[]'::jsonb)
  FROM jsonb_array_elements("Sports"."skillDivisionTypes"::jsonb) WITH ORDINALITY AS options(option_value, option_index)
  WHERE option_value ->> 'id' NOT IN (
    'first_team',
    'second_team',
    'third_team',
    'fourth_team',
    'fifth_team'
  )
)
WHERE jsonb_typeof("skillDivisionTypes"::jsonb) = 'array'
  AND ("id" ILIKE '%volleyball%' OR "name" ILIKE '%volleyball%');
