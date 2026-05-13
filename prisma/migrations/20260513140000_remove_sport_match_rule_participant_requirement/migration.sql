UPDATE "Sports"
SET "matchRulesTemplate" = "matchRulesTemplate" - 'pointIncidentRequiresParticipant'
WHERE jsonb_typeof("matchRulesTemplate") = 'object'
  AND "matchRulesTemplate" ? 'pointIncidentRequiresParticipant';
