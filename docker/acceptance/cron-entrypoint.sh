#!/bin/sh
set -eu
cat > /tmp/crontab <<EOF
* * * * * curl -fsS -m 110 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/process-queues
*/5 * * * * curl -fsS -m 110 -X POST -H "Authorization: Bearer ${BUURTSTALLINGEN_JOB_TOKEN:-}" http://app:3000/api/buurtstallingen/jobs
30 3 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/abonnementen
2 4 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/bulkreserveringen
52 4 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/overboeken
5 5 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/ns-locations
15 4 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/transacties-gemeente-totaal
30 5 * * * curl -fsS -m 600 -H "Authorization: Bearer ${UPDATE_CACHE_BEARER_TOKEN:-}" http://app:3000/api/protected/database/update-cache
EOF
exec /usr/local/bin/supercronic /tmp/crontab
