# Automated Report Cache Updates via GitHub Actions

This document explains how to automate and schedule report cache updates using GitHub Actions.

## Overview

The application uses three report cache tables to optimize report generation performance:

1. **Transaction Cache** (`transactions_cache`) - Caches transaction data for faster reporting
2. **Bezetting Cache** (`bezettingsdata_day_hour_cache`) - Caches occupancy/bezetting data aggregated by day and hour
3. **Stallingsduur Cache** (`stallingsduur_cache`) - Caches parking duration data with bucketized time intervals

These caches need to be updated periodically to include new transaction data. The update process processes transactions from a specified start date (defaults to 30 days ago if not provided) up to tomorrow, ensuring reports always have access to the latest data.

## How It Works

### API Endpoint

The cache update is handled by the `/api/protected/database/update-cache` endpoint:

- **Method**: `GET`
- **Authentication**: Required (see Authentication section below)
- **Query Parameters**:
  - `from` (optional): ISO date string (e.g., `2025-10-16T00:00:00.000Z`) specifying the start date for cache updates
    - If not provided, defaults to 30 days ago
    - Updates all data from this date up to tomorrow

### Authentication

The endpoint supports two authentication methods:

1. **Bearer Token** (for automated calls like GitHub Actions):
   - Send `Authorization: Bearer <token>` header
   - Token must match `UPDATE_CACHE_BEARER_TOKEN` environment variable
   - Suitable for automated workflows and scripts

2. **Session Authentication** (for manual UI access):
   - User must be logged in via NextAuth session
   - User must have `fietsberaad_superadmin` rights
   - Used by the UI button in Database beheer

**Note:** At least one authentication method must be valid. If both fail, the endpoint returns `401 Unauthorized`.

### Update Process

When called, the endpoint:

1. Validates the `from` date parameter (or defaults to 30 days ago if not provided)
2. Updates each of the three cache tables sequentially:
   - Transaction Cache
   - Bezetting Cache  
   - Stallingsduur Cache
3. Returns a detailed log entry with:
   - Success/failure status for each cache
   - Number of entries added
   - Date ranges covered
   - Error messages if any failures occurred

### Response Codes

- **200**: All caches updated successfully
- **207**: Partial success (one or more caches failed, but some succeeded)
- **400**: Invalid request (e.g., invalid date format)
- **500**: Unexpected server error

### Response Format

```json
{
  "success": true,
  "logEntry": {
    "date": "2025-12-16T18:25:07.642Z",
    "success": true,
    "summaryText": "Date: 2025-12-16T18:25:07.642Z\nCache has been updated for the date interval 2025-10-16 to 2025-12-17\nTransaction cache: now has 110766 total entries with a date range from 2010-06-08 to 2025-12-16 (700 transactions added)\nBezetting cache: now has 6046496 total entries with a date range from 2010-06-08 to 2025-12-16 (26449 transactions added)\nStallingsduur cache: now has 892563 total entries with a date range from 2010-06-08 to 2025-12-16 (5600 transactions added)\n",
    "data": {
      "Transaction": {
        "success": true,
        "message": "...",
        "statusStart": {...},
        "statusEnd": {...}
      },
      "Bezetting": {...},
      "Stallingsduur": {...}
    }
  }
}
```

## Setting Up GitHub Actions

### Prerequisites

1. GitHub repository with Actions enabled
2. Access to GitHub repository settings to configure repository-level variables and secrets
3. URLs for your acceptance and production environments

### Step 1: Configure Repository Variables

**Repository Variables** (Settings → Secrets and variables → Actions → Variables tab):

1. **`ACC_NEXTAUTH_URL`** - The acceptance environment home page URL (e.g., `https://acceptance.veiligstallen.nl`)
2. **`PROD_NEXTAUTH_URL`** - The production environment home page URL (e.g., `https://veiligstallen.nl`)

The workflows automatically build the API endpoint URL by appending `/api/protected/database/update-cache` to these URLs.

**Note:** These variables should already exist if you're using the existing deployment workflows. If not, add them now.

### Step 2: Generate Bearer Token

The API endpoint requires authentication via bearer token (for automated calls) or session (for manual UI access).

#### Manual Token Generation

You need to generate a secure bearer token manually using command-line tools. Follow these steps:

**Step 3.1: Choose a Generation Method**

You can use any of these methods to generate a secure token:

**Option 1: Using Node.js (Recommended)**
```bash
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))"
```

**Option 2: Using OpenSSL**
```bash
openssl rand -base64 32 | tr -d "=+/" | tr -d '\n' | sed 's/^/vs_/'
```

**Option 3: Using Node.js without prefix**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Step 3.2: Generate the Token**

1. Open a terminal/command prompt
2. Run one of the commands above
3. Copy the output token immediately

**Example output:**
```
vs_aBc123XyZ456Def789Ghi012Jkl345Mno678Pqr901Stu234Vwx567Yza890Bcd123Efg456
```

**Step 3.3: Save the Token Securely**

⚠️ **Important:** 
- The token is shown only once - copy it immediately
- Store it in a secure location (password manager, secure notes)
- You'll need separate tokens for each environment (acceptance, production, local development)
- Never commit tokens to git or share them publicly

**Step 3.4: Generate Multiple Tokens (if needed)**

If you need tokens for multiple environments, run the generation command multiple times:

```bash
# Generate token for acceptance environment
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))"
# Copy output: vs_acceptance_token_here

# Generate token for production environment  
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))"
# Copy output: vs_production_token_here

# Generate token for local development
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))"
# Copy output: vs_local_token_here
```

**Step 3.5: Verify Token Format**

A valid token should:
- Start with `vs_` prefix (if using Option 1 or 2)
- Be approximately 64+ characters long
- Contain only URL-safe characters (letters, numbers, `-`, `_`)
- Not contain spaces or special characters like `=`, `+`, `/`

**Troubleshooting Token Generation:**

- **"node: command not found"**: Install Node.js or use the OpenSSL method instead
- **"openssl: command not found"**: Install OpenSSL or use the Node.js method instead
- **Token looks too short**: Ensure you're using `randomBytes(32)` (32 bytes = 256 bits)
- **Token contains invalid characters**: Use `base64url` encoding (not `base64`) to ensure URL-safe characters

**Quick Reference - Token Generation:**

```bash
# One-liner to generate and copy token (Linux/Mac)
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))" | pbcopy  # Mac
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))" | xclip -selection clipboard  # Linux

# Or generate and display (then manually copy)
node -e "console.log('vs_' + require('crypto').randomBytes(32).toString('base64url'))"
```

**What to do next:**
1. ✅ Token generated → Copy it
2. ✅ Add to `.env` file (local) or GitHub Secrets (CI/CD)
3. ✅ Test the endpoint with the token
4. ✅ Configure GitHub Actions workflow

### Step 3: Configure Bearer Token

**For GitHub Actions (Automated Workflows):**

1. Go to **Settings** → **Secrets and variables** → **Actions** → **Secrets** tab
2. Add **repository-level secrets** (not environment-specific):
   - **`ACC_CACHE_UPDATE_BEARER_TOKEN`** - Bearer token for acceptance environment
   - **`PROD_CACHE_UPDATE_BEARER_TOKEN`** - Bearer token for production environment
3. Paste the generated bearer tokens as the secret values
4. **Use different tokens for each environment** (generate separate tokens for acceptance and production)
5. The workflows will automatically include the `Authorization: Bearer` header when these secrets are configured

**Important:** These are repository-level secrets, meaning they're accessible to all workflows in the repository. The workflows use the appropriate secret based on which environment they're targeting (acceptance vs production).

**For Local Development:**

1. Add the bearer token to your `.env` file:
   ```bash
   UPDATE_CACHE_BEARER_TOKEN=vs_your_generated_token_here
   ```
2. Ensure `.env` file permissions are restricted: `chmod 600 .env`
3. Never commit `.env` to git (it's already in `.gitignore`)

**For Production Server:**

The bearer token is automatically set in Azure Web App during deployment via the GitHub Actions workflow. The workflow includes `UPDATE_CACHE_BEARER_TOKEN` in the `.env` file creation step, which makes it available at runtime.

**How it works:**

1. The deployment workflow reads the repository-level secret (`ACC_CACHE_UPDATE_BEARER_TOKEN` or `PROD_CACHE_UPDATE_BEARER_TOKEN`)
2. Adds it to the `.env` file during the build process
3. The `.env` file is deployed with the application
4. Azure Web App makes it available as the `UPDATE_CACHE_BEARER_TOKEN` environment variable at runtime

**Note:** The deployment workflows (`azure-webapps-node-acceptance.yml` and `azure-webapps-node-production.yml`) automatically include this in the `.env` file during deployment using the repository-level secrets `ACC_CACHE_UPDATE_BEARER_TOKEN` and `PROD_CACHE_UPDATE_BEARER_TOKEN` respectively.

### Step 4: Workflow Files

The workflow files already exist in the project:

1. **Acceptance**: `.github/workflows/update-report-caches-acceptance.yml`
2. **Production**: `.github/workflows/update-report-caches-production.yml`

**Key Features:**
- **Acceptance**: Runs daily at 03:00 UTC
- **Production**: Runs daily at 03:30 UTC (30 minutes later for safety)
- Both workflows reference existing GitHub Environments (`acceptance` and `production`) for protection rules
- Both workflows use repository-level variables and secrets
- The workflows automatically select the appropriate secret (`ACC_CACHE_UPDATE_BEARER_TOKEN` vs `PROD_CACHE_UPDATE_BEARER_TOKEN`) based on which workflow is running
- Both workflows can be manually triggered from the GitHub Actions UI with an optional `from_date` parameter

**To customize the schedule**, edit the `cron` expression in the respective workflow file.

### Step 5: Customize the Schedule

The workflows are configured as follows:
- **Acceptance**: Runs daily at 03:00 UTC
- **Production**: Runs daily at 03:30 UTC (30 minutes after acceptance)

To change the schedule:

1. Edit the `cron` expression in the workflow file
2. Use [crontab.guru](https://crontab.guru/) to help create the correct cron expression
3. Common examples:
   - `"0 3 * * *"` - Daily at 03:00 UTC
   - `"0 */6 * * *"` - Every 6 hours
   - `"0 2 * * 1"` - Every Monday at 02:00 UTC

### Step 6: Manual Triggering

You can also trigger cache updates manually from the UI:

1. Log in as a Fietsberaad super admin
2. Navigate to **Database beheer** (Database management)
3. Use the **"Rapport caches bijwerken"** (Update report caches) section
4. Select a start date and click **"Bijwerken"** (Update)

The UI button uses session-based authentication and works for super admins without needing a bearer token.

### Step 7: Manual API Testing

You can manually trigger the workflow:

1. Go to **Actions** tab in GitHub
2. Select either:
   - "Daily cache update (Acceptance)" workflow
   - "Daily cache update (Production)" workflow
3. Click **Run workflow**
4. Optionally specify a `from_date` parameter (ISO format) to update from a specific date (defaults to 30 days ago if not provided)
5. Select the branch and click **Run workflow**

**Note:** You can run acceptance and production workflows independently, allowing you to test changes in acceptance before running in production.

## Testing the Setup

### Test the API Endpoint Manually

Before setting up the GitHub Action, test the endpoint manually:

```bash
# Test with bearer token (for automated calls)
curl -H "Authorization: Bearer vs_your_token_here" https://your-domain.com/api/protected/database/update-cache

# Test with 'from' parameter
curl -H "Authorization: Bearer vs_your_token_here" "https://your-domain.com/api/protected/database/update-cache?from=2025-10-16T00:00:00.000Z"

# Test without authentication (should fail with 401)
curl https://your-domain.com/api/protected/database/update-cache
```

**Expected responses:**
- With valid bearer token: `200` or `207` with cache update results
- Without authentication: `401` with error message

### Test the GitHub Action

1. Push the workflow file to your repository
2. Manually trigger the workflow using `workflow_dispatch`
3. Check the Actions logs to verify:
   - The endpoint is called correctly
   - The response is parsed correctly
   - The summary is displayed in the step summary

## Monitoring

### GitHub Actions Logs

- View workflow runs in the **Actions** tab
- Each run shows:
  - Success/failure status
  - Summary text in the step summary
  - Full response JSON on failure

### Application Logs

The endpoint logs detailed information to the application console:
- `*** Update report caches started`
- `*** Updating Transaction Cache`
- `*** Updating Bezetting Cache`
- `*** Updating Stallingsduur Cache`
- `*** Log entry:` (with full summary)

Check your application logs to monitor cache update operations.

## Troubleshooting

### Workflow Fails with HTTP 401

- **Cause**: Bearer token is missing or incorrect
- **Solution**: 
  - Check if `ACC_CACHE_UPDATE_BEARER_TOKEN` (acceptance) or `PROD_CACHE_UPDATE_BEARER_TOKEN` (production) **repository-level secret** is set in GitHub (Settings → Secrets and variables → Actions → Secrets)
  - Verify the token matches the `UPDATE_CACHE_BEARER_TOKEN` in your application's environment variables (check Azure Portal or `.env` file)
  - Ensure the token was copied correctly (no extra spaces or newlines)
  - Regenerate token if needed and update both GitHub repository secret and application environment variable
  - For Azure deployments, ensure the secret is included in the deployment workflow's `.env` file creation step

### Workflow Fails with HTTP 400

- **Cause**: Invalid date format in `from` parameter
- **Solution**: Ensure dates are in ISO format: `YYYY-MM-DDTHH:mm:ss.sssZ`

### Workflow Returns HTTP 207 (Partial Failure)

- **Cause**: One or more cache updates failed
- **Solution**: 
  - Check the step summary for details on which cache failed
  - Review application logs for error messages
  - Verify database connectivity and permissions

### Workflow Returns HTTP 500

- **Cause**: Unexpected server error
- **Solution**:
  - Check application logs for detailed error messages
  - Verify database is accessible and healthy
  - Check for database connection issues or timeouts

### Cache Updates Are Slow

- **Cause**: Large date ranges or high transaction volumes
- **Solution**:
  - Run updates more frequently (e.g., every 6 hours instead of daily)
  - This reduces the amount of data processed per run
  - Consider running during off-peak hours

## Best Practices

1. **Schedule During Off-Peak Hours**: Run cache updates during low-traffic periods (e.g., 03:00 UTC)
2. **Monitor Regularly**: Check GitHub Actions logs weekly to ensure updates are running successfully
3. **Set Up Alerts**: Configure GitHub notifications for workflow failures
4. **Keep URLs Updated**: Update repository-level variables `ACC_NEXTAUTH_URL` and `PROD_NEXTAUTH_URL` if environment URLs change
5. **Test After Deployments**: After deploying code changes, verify the cache update endpoint still works

## Related Documentation

- `REPORTS_CACHE.md` - Additional information about report caches
- `src/pages/api/protected/database/update-cache.ts` - API endpoint implementation
- `src/components/beheer/database/CacheUpdate.tsx` - Manual cache update UI component

