# BoldSign Reconcile Cron (DigitalOcean App Platform)

Use a scheduled job to invoke the reconcile endpoint every 30 minutes.

## Why
- Webhooks are the primary synchronization path.
- Reconcile is only a periodic fallback.
- Runtime polling must not trigger reconcile calls.

## Endpoint
- Method: `POST`
- URL: `https://mvp.razumly.com/api/boldsign/reconcile`
- Auth: `Authorization: Bearer <BOLDSIGN_RECONCILE_SECRET>`

## Required env var
Set this on the app (run/build scope is fine):
- `BOLDSIGN_RECONCILE_SECRET` (random high-entropy value)

The reconcile endpoint will also allow admin-session calls, but cron should always use the bearer secret.

## DigitalOcean Scheduled Job
Create a job component in App Platform:
- Schedule: `*/30 * * * *`
- Time zone: `UTC` (or your preferred zone)
- Run command:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $BOLDSIGN_RECONCILE_SECRET" \
  "https://mvp.razumly.com/api/boldsign/reconcile"
```

## Notes
- The endpoint includes a server-side 30-minute throttle window, so accidental duplicate runs are skipped safely.
- If needed for manual recovery, admins can still trigger reconcile by calling the same endpoint from an authenticated admin session.
