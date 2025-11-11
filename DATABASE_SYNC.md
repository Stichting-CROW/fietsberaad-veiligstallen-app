# Database Sync Documentation

This application uses Percona Toolkit's `pt-table-sync` tool to synchronize data from a master database to a slave database.

## Prerequisites

### Install Percona Toolkit

The sync service requires `pt-table-sync` to be installed on the server.

#### Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install percona-toolkit
```

#### CentOS/RHEL:
```bash
sudo yum install percona-toolkit
```

#### macOS (Homebrew):
```bash
brew install percona-toolkit
```

#### Verify Installation:
```bash
pt-table-sync --version
```

## Configuration

### Environment Variables

**Required for sync to be available:**

1. **DBSYNC_MASTER_URL** (required)
   - Source/production database connection string
   - Format: `mysql://user:password@host:port/database`
   - Example: `mysql://veiligstallen_web:password@10.132.29.69:3306/veiligstallen`
   - **Note**: If not set, the sync section will not be available in the UI

2. **DBSYNC_TEST_URL** (required)
   - Target/test database connection string
   - Format: `mysql://user:password@host:port/database`
   - Example: `mysql://veiligstallen_web:password@test-server:3306/veiligstallen`
   - **Note**: If not set, the sync section will not be available in the UI

**Optional:**

3. **PT_TABLE_SYNC_PATH** (optional)
   - Full path to `pt-table-sync` executable
   - Only needed if `pt-table-sync` is not in system PATH
   - Example: `/usr/local/bin/pt-table-sync`

**Important**: Both `DBSYNC_MASTER_URL` and `DBSYNC_TEST_URL` must be set for the sync functionality to be available. If either is missing, the sync section will be hidden in the UI.

### Example .env Configuration

```env
# Source database (production) - REQUIRED
DBSYNC_MASTER_URL=mysql://veiligstallen_web:your-password@10.132.29.69:3306/veiligstallen

# Target database (test) - REQUIRED
DBSYNC_TEST_URL=mysql://veiligstallen_web:your-password@test-server:3306/veiligstallen

# Optional: Custom pt-table-sync path
PT_TABLE_SYNC_PATH=/usr/bin/pt-table-sync
```

## Usage

### Via Web Interface

1. Navigate to **Beheer** → **Database** section
2. The **Database Sync** component appears at the top
3. Click **Start Sync** to begin synchronization
4. Monitor progress in real-time:
   - Table status (todo/busy/done/error)
   - Rows processed per table
   - Log messages
5. Click **Stop Sync** to cancel if needed

### How It Works

1. **Incremental Sync**: `pt-table-sync` automatically detects differences between master and slave
2. **Chunked Processing**: Tables are processed in chunks (default: 1000 rows)
3. **Safe Operations**: Uses `REPLACE` statements to handle conflicts
4. **Progress Tracking**: Real-time status updates for each table

### Sync Process

- Tables are synced sequentially
- Each table's status is tracked (todo → busy → done/error)
- Progress shows rows processed vs total rows
- Errors are logged and displayed per table
- Sync can be stopped gracefully

## Troubleshooting

### pt-table-sync Not Found

**Error**: `pt-table-sync not found`

**Solution**:
1. Install Percona Toolkit (see Prerequisites)
2. Or set `PT_TABLE_SYNC_PATH` to the full path of the executable
3. Verify with: `pt-table-sync --version`

### Connection Errors

**Error**: Connection refused or authentication failed

**Solution**:
1. Verify `DATABASE_URL` and `SLAVE_DATABASE_URL` are correct
2. Check network connectivity between servers
3. Verify database user has necessary permissions:
   - `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all tables
   - `REPLACE` permission (or use `INSERT ... ON DUPLICATE KEY UPDATE`)

### Permission Errors

**Error**: Access denied for user

**Solution**:
1. Ensure database user has proper permissions
2. Check user can connect from the application server
3. Verify user has access to all tables being synced

### Large Table Performance

For very large tables (>10GB), consider:
- Running sync during off-peak hours
- Adjusting chunk size (currently 1000 rows)
- Syncing specific tables only (modify `ALL_TABLES` in service)

## Security Notes

- Database passwords are masked in logs (shown as `p=***`)
- Connection strings are parsed securely
- Process runs with same permissions as Node.js application
- Consider using read-only user for master database if possible

## Advanced Configuration

### Custom Table List

To sync only specific tables, modify `ALL_TABLES` in:
`src/backend/services/database-sync-service.ts`

### Chunk Size

Adjust chunk size in the `startSyncProcess()` method:
```typescript
'--chunk-size', '1000',  // Change to desired size
```

### Sync Options

Additional `pt-table-sync` options can be added to the `args` array in `startSyncProcess()`.

See `pt-table-sync --help` for all available options.

## References

- [Percona Toolkit Documentation](https://www.percona.com/software/database-tools/percona-toolkit)
- [pt-table-sync Manual](https://www.percona.com/doc/percona-toolkit/LATEST/pt-table-sync.html)

