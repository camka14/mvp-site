-- Preserve the old refund policy semantics for existing events.
-- Previously 0 meant automatic refunds were disabled. It now means refunds are available until event start.
UPDATE "Events"
SET "cancellationRefundHours" = NULL
WHERE "cancellationRefundHours" = 0;
