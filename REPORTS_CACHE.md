== Report Update cronjob (via GitHub Actions)

The `api/protected/database/update-cache` endpoint should be called periodically to add the latest data to the report caches.

HTTP status codes returned by the endpoint:
- 200: All caches updated successfully
- 207: Partial success (one or more caches failed)
- 500: Unexpected error

Use GitHub Actions “Environments” and set an environment variable per environment.
In GitHub → Settings → Environments, create `acceptance` and `production`.
In each environment, add an Actions variable `UPDATE_CACHE_URL` with the right URL.
Also add a secret `CRON_BEARER_TOKEN` per environment for the Authorization header.


```` yaml
name: Daily cache update

on:
  schedule:
    - cron: "0 3 * * *" # 03:00 UTC daily
  workflow_dispatch: {}

jobs:
  update-cache:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        env_name: [acceptance, production]
    environment: ${{ matrix.env_name }}
    steps:
      - name: Call update-cache and capture response
        id: call
        run: |
          set -e
          RESP=$(mktemp)
          HTTP_CODE=$(curl -sS \
            -H "Authorization: Bearer $CRON_BEARER_TOKEN" \
            -w "%{http_code}" -o "$RESP" \
            "$UPDATE_CACHE_URL")
          echo "http_code=$HTTP_CODE" >> "$GITHUB_OUTPUT"
          # Write summaryText (if present) to GitHub Step Summary for readable logs
          if command -v jq >/dev/null 2>&1; then
            SUMMARY=$(jq -r '.summaryText // empty' "$RESP")
          else
            SUMMARY=""
          fi
          if [ -n "$SUMMARY" ]; then
            echo "$SUMMARY" >> "$GITHUB_STEP_SUMMARY"
          else
            echo "No summaryText provided" >> "$GITHUB_STEP_SUMMARY"
          fi
          # Persist the full JSON for later steps if needed
          echo "response=$(cat "$RESP" | sed -e 's/`/\`/g' -e ':a;N;$!ba;s/\n/\\n/g')" >> "$GITHUB_OUTPUT"
      - name: Evaluate result (fail on partial 207)
        run: |
          case "${{ steps.call.outputs.http_code }}" in
            200)
              echo "All caches updated successfully";;
            207)
              echo "::error title=Partial cache update::One or more caches failed. See step summary."; exit 1;;
            *)
              echo "::error title=Cache update failed::HTTP ${{ steps.call.outputs.http_code }}"; exit 1;;
          esac
        shell: bash
        env:
          # Available if you want to inspect the body: ${{ steps.call.outputs.response }}
          RESPONSE_JSON: ${{ steps.call.outputs.response }}
    env:
      CRON_BEARER_TOKEN: ${{ secrets.CRON_BEARER_TOKEN }}
      UPDATE_CACHE_URL: ${{ vars.UPDATE_CACHE_URL }}
````

Notes:
- Put the URL in environment “Variables” (`vars`), not Secrets, unless you want it hidden.
- Store the bearer token as an environment “Secret” (`secrets`) per environment if they differ.