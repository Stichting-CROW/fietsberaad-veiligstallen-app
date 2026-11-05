#!/bin/sh
set -eu
# All schedules live in background_schedules (beheer > Achtergrondprocessen > Achtergrondtaken).
cat > /tmp/crontab <<EOF
* * * * * curl -fsS -m 110 -X POST -H "Authorization: Bearer ${CRON_SECRET:-}" http://app:3000/api/cron/tick
EOF
exec /usr/local/bin/supercronic /tmp/crontab
