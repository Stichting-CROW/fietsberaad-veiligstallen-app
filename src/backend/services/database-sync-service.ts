import { spawn, ChildProcess } from 'child_process';
import { env } from '~/env.mjs';
import { prisma } from '~/server/db';

export type SyncStatus = 'todo' | 'busy' | 'done' | 'error';
export type LogLevel = 'info' | 'warning' | 'error';

export interface TableSyncStatus {
  table: string;
  status: SyncStatus;
  rowsProcessed?: number;
  rowsTotal?: number;
  rowCount?: number; // Total rows in table (from information_schema)
  tableSizeMB?: number; // Table size in MB (from information_schema)
  lastSyncTime?: Date;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface SyncLogEntry {
  timestamp: Date;
  level: LogLevel;
  table?: string;
  message: string;
}

export interface SyncState {
  isRunning: boolean;
  isStopping: boolean;
  startTime?: Date;
  tables: Map<string, TableSyncStatus>;
  logs: SyncLogEntry[];
  currentTable?: string;
  totalTables: number;
  completedTables: number;
}

import { getOrderedTables } from './database-sync-order';

// Tables to sync (from backup script)
const TABLES_LARGE_RAW = [
  'transacties_archief', 'bezettingsdata', 'transacties', 'webservice_log',
  'accounts_pasids', 'wachtrij_transacties', 'wachtrij_pasids', 'gemeenteaccounts',
  'accounts', 'bezettingsdata_day_hour_cache', 'financialtransactions', 'emails'
];

// Order tables based on foreign key dependencies
const TABLES_LARGE = getOrderedTables(TABLES_LARGE_RAW);

const TABLES_NORMAL_RAW = [
  'abonnementen', 'abonnementsvorm_fietsenstalling', 'abonnementsvorm_fietstype',
  'abonnementsvormen', 'account_transacties', 'articles', 'articles_templates',
  'barcoderegister', 'bezettingsdata_tmp', 'bikeparklog', 'bulkreservering',
  'bulkreserveringuitzondering', 'contact_contact', 'contact_fietsenstalling',
  'contact_report_settings', 'contacts', 'contacts_faq', 'contacts_fietsberaad',
  'documenttemplates', 'ds_sections', 'externe_apis', 'externe_apis_locaties',
  'faq', 'fietsenstalling_plek', 'fietsenstalling_plek_bezetting',
  'fietsenstalling_sectie', 'fietsenstalling_sectie_kostenperioden',
  'fietsenstallingen', 'fietsenstallingen_services', 'fietsenstallingen_winkansen',
  'fietsenstallingtypen', 'fietstypen', 'fmsservice_permit', 'fmsservicelog',
  'historischesaldos', 'instellingen', 'klanttypen', 'log', 'lopers', 'loterij_log',
  'mailings_lists', 'mailings_members', 'mailings_messages', 'mailings_standaardteksten',
  'modules', 'modules_contacts', 'modules_contacts_copy1', 'plaats_fietstype',
  'presentations', 'presentations_ticker', 'prijswinnaars', 'prijswinnaars_backup',
  'prijzen', 'prijzenpot', 'producten', 'rapportageinfo', 'schema_version',
  'sectie_fietstype', 'sectie_fietstype_tmp', 'security_roles', 'security_users',
  'security_users_sites', 'services', 'sleutelhangerreeksen', 'stallingsduur_cache',
  'tariefcodes', 'tariefregels', 'tariefregels_copy1', 'tariefregels_copy2',
  'tariefregels_copy3', 'tariefregels_copy4', 'tariefregels_copy5', 'tariefregels_tmp',
  'texts', 'tmp_audit_grabbelton_na', 'tmp_audit_grabbelton_voor',
  'transacties_archief_tmp', 'transacties_gemeente_totaal', 'transacties_view',
  'trekkingen', 'uitzonderingenopeningstijden', 'unieke_bezoekers',
  'users_beheerder_log', 'v_ds_surveyareas_parkinglocations', 'vw_fmsservice_errors',
  'vw_locations', 'vw_lopende_transacties', 'vw_pasids', 'vw_stallingstegoeden',
  'vw_stallingstegoedenexploitant', 'wachtlijst', 'wachtlijst_fietstype',
  'wachtlijst_item', 'wachtrij_betalingen', 'wachtrij_sync', 'winkansen',
  'winkansen_reminderteksten', 'winkansen_zelf_inzet'
];

// Order tables based on foreign key dependencies
const TABLES_NORMAL = getOrderedTables(TABLES_NORMAL_RAW);

const ALL_TABLES = [...TABLES_LARGE, ...TABLES_NORMAL];

class DatabaseSyncService {
  private state: SyncState;
  private syncProcess: ChildProcess | null = null;
  private masterDsn: string;
  private slaveDsn: string;
  private ptTableSyncPath: string;

  constructor() {
    this.state = {
      isRunning: false,
      isStopping: false,
      tables: new Map(),
      logs: [],
      totalTables: ALL_TABLES.length,
      completedTables: 0,
    };

    // Get master (source/production) and test (target/slave) database connections
    // Only use DBSYNC_MASTER_URL and DBSYNC_TEST_URL - no fallbacks
    const masterUrl = env.DBSYNC_MASTER_URL;
    const testUrl = env.DBSYNC_TEST_URL;

    if (!masterUrl || !testUrl) {
      // URLs not configured - service will be unavailable
      this.masterDsn = '';
      this.slaveDsn = '';
    } else {
      // Parse connection URLs and convert to DSN format
      // DSN format: h=host,u=user,p=password,D=database,P=port
      this.masterDsn = this.parseConnectionUrlToDsn(masterUrl);
      this.slaveDsn = this.parseConnectionUrlToDsn(testUrl);
    }

    // Path to pt-table-sync (default to system PATH, can be overridden)
    this.ptTableSyncPath = process.env.PT_TABLE_SYNC_PATH || 'pt-table-sync';

    // Initialize table statuses
    ALL_TABLES.forEach(table => {
      this.state.tables.set(table, {
        table,
        status: 'todo',
      });
    });
  }

  isAvailable(): boolean {
    // Sync is only available if both URLs are configured
    return !!(env.DBSYNC_MASTER_URL && env.DBSYNC_TEST_URL);
  }

  async checkPtTableSyncInstalled(): Promise<{ installed: boolean; error?: string }> {
    return new Promise((resolve) => {
      const checkProcess = spawn(this.ptTableSyncPath, ['--version'], {
        stdio: 'pipe',
      });

      let output = '';
      checkProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.on('close', (code) => {
        if (code === 0 || output.includes('pt-table-sync')) {
          resolve({ installed: true });
        } else {
          resolve({ 
            installed: false,
            error: 'pt-table-sync not found in PATH'
          });
        }
      });

      checkProcess.on('error', (error) => {
        resolve({ 
          installed: false,
          error: error.message || 'Failed to execute pt-table-sync'
        });
      });
    });
  }

  private parseConnectionUrlToDsn(url: string): string {
    // Parse mysql://user:password@host:port/database
    const urlObj = new URL(url);
    const parts: string[] = [];
    
    if (urlObj.hostname) {
      parts.push(`h=${urlObj.hostname}`);
    }
    if (urlObj.username) {
      parts.push(`u=${urlObj.username}`);
    }
    if (urlObj.password) {
      parts.push(`p=${urlObj.password}`);
    }
    if (urlObj.port) {
      parts.push(`P=${urlObj.port}`);
    } else if (urlObj.protocol === 'mysql:') {
      parts.push('P=3306');
    }
    if (urlObj.pathname && urlObj.pathname.length > 1) {
      parts.push(`D=${urlObj.pathname.slice(1)}`);
    }

    return parts.join(',');
  }

  private addLog(level: LogLevel, message: string, table?: string) {
    const entry: SyncLogEntry = {
      timestamp: new Date(),
      level,
      table,
      message,
    };
    this.state.logs.push(entry);
    // Keep only last 1000 log entries
    if (this.state.logs.length > 1000) {
      this.state.logs.shift();
    }
  }

  async getState(): Promise<SyncState> {
    // Ensure all tables are initialized
    ALL_TABLES.forEach(table => {
      if (!this.state.tables.has(table)) {
        this.state.tables.set(table, {
          table,
          status: 'todo',
        });
      }
    });

    // Fetch table statistics if not already loaded
    await this.ensureTableStatistics();

    return {
      ...this.state,
      tables: new Map(this.state.tables), // Return a copy
      logs: [...this.state.logs], // Return a copy
    };
  }

  clearLogs(): void {
    this.state.logs = [];
    this.addLog('info', 'Logs cleared');
  }

  private async ensureTableStatistics(): Promise<void> {
    // Check if we need to fetch statistics (if any table is missing rowCount)
    const needsStats = Array.from(this.state.tables.values()).some(
      table => table.rowCount === undefined
    );

    if (!needsStats || this.state.tables.size === 0) {
      return;
    }

    try {
      // Fetch statistics for all tables at once using information_schema
      const tableNames = Array.from(this.state.tables.keys());
      
      // Escape table names for SQL (they come from our predefined list, so they're safe, but we escape anyway)
      const escapedTableNames = tableNames.map(name => `'${name.replace(/'/g, "''")}'`).join(',');
      
      const sql = `
        SELECT 
          table_name AS tableName,
          table_rows AS rowCount,
          ROUND(((data_length + index_length) / 1024 / 1024), 2) AS tableSizeMB
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name IN (${escapedTableNames})
      `;

      const results = await prisma.$queryRawUnsafe<Array<{
        tableName: string;
        rowCount: bigint | number | null;
        tableSizeMB: number | null;
      }>>(sql);

      // Update table statuses with statistics
      results.forEach((result) => {
        const tableStatus = this.state.tables.get(result.tableName);
        if (tableStatus) {
          tableStatus.rowCount = typeof result.rowCount === 'bigint' 
            ? Number(result.rowCount) 
            : (result.rowCount ?? 0);
          tableStatus.tableSizeMB = result.tableSizeMB ?? 0;
        }
      });

      // Mark tables that don't exist in the database
      tableNames.forEach((tableName) => {
        const found = results.find(r => r.tableName === tableName);
        if (!found) {
          const tableStatus = this.state.tables.get(tableName);
          if (tableStatus) {
            tableStatus.rowCount = 0;
            tableStatus.tableSizeMB = 0;
          }
        }
      });
    } catch (error) {
      console.error('Error fetching table statistics:', error);
      // Don't throw - just log the error, statistics are optional
    }
  }

  async startSync(tables?: string[], dryRun: boolean = true): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Database sync is not configured. Please set DBSYNC_MASTER_URL and DBSYNC_TEST_URL environment variables.');
    }

    if (this.state.isRunning) {
      throw new Error('Sync is already running');
    }

    // Verify pt-table-sync is available
    await this.verifyPtTableSync();

    // Determine which tables to sync
    let tablesToSync = tables && tables.length > 0 ? tables : ALL_TABLES;
    
    // Validate that all requested tables exist in our known tables
    const invalidTables = tablesToSync.filter(table => !ALL_TABLES.includes(table));
    if (invalidTables.length > 0) {
      throw new Error(`Invalid table names: ${invalidTables.join(', ')}`);
    }

    // Order tables based on foreign key dependencies to prevent constraint violations
    tablesToSync = getOrderedTables(tablesToSync);

    this.state.isRunning = true;
    this.state.isStopping = false;
    this.state.startTime = new Date();
    this.state.completedTables = 0;
    this.state.currentTable = undefined;
    this.state.totalTables = tablesToSync.length;

    // Initialize all tables if not already present, and reset statuses only for tables that will be synced
    ALL_TABLES.forEach(table => {
      if (!this.state.tables.has(table)) {
        // Add new table with default status
        this.state.tables.set(table, {
          table,
          status: 'todo',
        });
      }
    });

    // Reset statuses only for tables that will be synced
    tablesToSync.forEach(table => {
      const tableStatus = this.state.tables.get(table);
      if (tableStatus) {
        tableStatus.status = 'todo';
        tableStatus.error = undefined;
        tableStatus.startedAt = undefined;
        tableStatus.completedAt = undefined;
        tableStatus.rowsProcessed = undefined;
        tableStatus.rowsTotal = undefined;
      } else {
        // Should not happen, but add it if missing
        this.state.tables.set(table, {
          table,
          status: 'todo',
        });
      }
    });

    this.addLog('info', `Sync started for ${tablesToSync.length} table(s)${dryRun ? ' (DRY RUN)' : ''}`);
    this.addLog('info', `Master DSN: ${this.masterDsn.replace(/p=[^,]+/, 'p=***')}`);
    this.addLog('info', `Slave DSN: ${this.slaveDsn.replace(/p=[^,]+/, 'p=***')}`);

    // Start syncing tables sequentially (one table per command)
    this.syncTablesSequentially(tablesToSync, dryRun);
  }

  private async verifyPtTableSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkProcess = spawn(this.ptTableSyncPath, ['--version'], {
        stdio: 'pipe',
      });

      let output = '';
      checkProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.on('close', (code) => {
        if (code === 0 || output.includes('pt-table-sync')) {
          resolve();
        } else {
          reject(new Error(
            `pt-table-sync not found. Please install Percona Toolkit.\n` +
            `Installation: https://www.percona.com/software/database-tools/percona-toolkit\n` +
            `Or set PT_TABLE_SYNC_PATH environment variable to the full path.`
          ));
        }
      });

      checkProcess.on('error', (error) => {
        reject(new Error(
          `Failed to execute pt-table-sync: ${error.message}\n` +
          `Please install Percona Toolkit or set PT_TABLE_SYNC_PATH environment variable.`
        ));
      });
    });
  }

  private async syncTablesSequentially(tablesToSync: string[], dryRun: boolean = true): Promise<void> {
    // Process tables one by one
    for (const table of tablesToSync) {
      if (this.state.isStopping) {
        this.addLog('warning', 'Sync stopped by user');
        break;
      }

      // Update current table status
      this.state.currentTable = table;
      const tableStatus = this.state.tables.get(table);
      if (tableStatus) {
        tableStatus.status = 'busy';
        tableStatus.startedAt = new Date();
        tableStatus.error = undefined;
      }

      this.addLog('info', `Starting sync for table: ${table}`, table);

      try {
        await this.syncSingleTable(table, dryRun);
        
        // Mark table as done
        if (tableStatus) {
          tableStatus.status = 'done';
          tableStatus.completedAt = new Date();
        }
        this.state.completedTables++;
        this.addLog('info', `Completed sync for table: ${table}`, table);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (tableStatus) {
          tableStatus.status = 'error';
          tableStatus.error = errorMessage;
          tableStatus.completedAt = new Date();
        }
        this.addLog('error', `Error syncing table ${table}: ${errorMessage}`, table);
        // Continue with next table even if one fails
      } finally {
        this.state.currentTable = undefined;
      }
    }

    // All tables processed
    this.state.isRunning = false;
    this.state.isStopping = false;
    this.addLog('info', 'Sync completed for all tables');
  }

  private syncSingleTable(table: string, dryRun: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build pt-table-sync command for a single table
      // Use T=table_name in DSN instead of --tables flag

      // Add table name to DSN using T=table_name
      const masterDsnWithTable = this.masterDsn + `,t=${table}`;
      const slaveDsnWithTable = this.slaveDsn + `,t=${table}`;

      const args: string[] = [
        '--verbose',
        '--no-check-slave', // Skip replication checks (don't require SUPER/REPLICATION CLIENT privileges)
      ];

      if (dryRun) {
        args.push('--dry-run');
      } else {
        args.push('--execute');
      }

      args.push(masterDsnWithTable, slaveDsnWithTable);

      this.addLog('info', `Executing: ${this.ptTableSyncPath} ${args.join(' ').replace(/p=[^,]+/g, 'p=***')}`, table);
      console.log(`Executing: ${this.ptTableSyncPath} ${args.join(' ')}`); // .replace(/p=[^,]+/g, 'p=***')

      const process = spawn(this.ptTableSyncPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Track current process so we can kill it if needed
      this.syncProcess = process;

      // Collect all output for error reporting
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      // Parse stdout for progress and status
      process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdoutChunks.push(output); // Collect for error reporting
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
          // Check for SQL statements
          if (line.match(/^(INSERT|UPDATE|DELETE|REPLACE)\s+/i)) {
            // Extract table name from SQL
            const sqlTableMatch = line.match(/(?:INTO|FROM|UPDATE)\s+`?(\w+)`?/i);
            const tableName = sqlTableMatch ? sqlTableMatch[1] : table;
            
            const tableStatus = this.state.tables.get(table);
            if (tableStatus) {
              tableStatus.rowsProcessed = (tableStatus.rowsProcessed || 0) + 1;
            }
            // Only log SQL in verbose mode or for errors
            if (line.includes('ERROR') || line.includes('error')) {
              this.addLog('error', `SQL Error: ${line.substring(0, 200)}`, table);
            }
          }
          // Check for chunk progress
          else if (line.match(/chunk|progress|rows/i)) {
            const progressMatch = line.match(/(\d+)\s*\/\s*(\d+)/);
            if (progressMatch) {
              const processed = parseInt(progressMatch[1] || '0');
              const total = parseInt(progressMatch[2] || '0');
              const tableStatus = this.state.tables.get(table);
              if (tableStatus) {
                tableStatus.rowsProcessed = processed;
                tableStatus.rowsTotal = total;
              }
            }
            this.addLog('info', line, table);
          }
          // Check for table completion
          else if (line.match(/complete|done|finished/i)) {
            this.addLog('info', `Table sync complete: ${table}`, table);
          }
          // Check for errors
          else if (line.match(/error|ERROR|failed|FAILED/i)) {
            this.addLog('error', line, table);
            const tableStatus = this.state.tables.get(table);
            if (tableStatus) {
              tableStatus.status = 'error';
              tableStatus.error = line.substring(0, 500);
            }
          }
          // Check for warnings
          else if (line.match(/warning|WARNING|warn/i)) {
            this.addLog('warning', line, table);
          }
          // Other informative output
          else if (line.trim() && !line.match(/^\s*$/)) {
            this.addLog('info', line, table);
          }
        }
      });

      // Parse stderr for errors
      process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrChunks.push(output); // Collect for error reporting
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.includes('Error') || line.includes('error') || line.includes('ERROR')) {
            this.addLog('error', line, table);
            const tableStatus = this.state.tables.get(table);
            if (tableStatus) {
              tableStatus.status = 'error';
              tableStatus.error = line;
            }
          } else if (line.includes('Warning') || line.includes('warning')) {
            this.addLog('warning', line, table);
          } else {
            this.addLog('info', line, table);
          }
        }
      });

      // Handle process completion
      process.on('close', (code) => {
        // Clear process reference
        if (this.syncProcess === process) {
          this.syncProcess = null;
        }

        this.addLog('info', `Sync process for table ${table} completed with code ${code}`, table);

        // Exit code 0 = success, 1 = differences found (normal for dry-run), 25 = differences + errors
        // Exit codes > 0 but not 1 or 25 are actual errors
        if (code === 0 || code === 1) {
          // Success or differences found (normal)
          resolve();
        } else if (code === 25) {
          // Differences found with non-fatal errors - still consider it success
          this.addLog('warning', `Table ${table} sync completed with warnings (exit code 25)`, table);
          resolve();
        } else {
          // Actual error - log all output
          const errorMsg = `Sync failed for table ${table} with exit code ${code}`;
          this.addLog('error', errorMsg, table);
          
          // Log collected output
          const allOutput = [
            '=== Process Output (stdout) ===',
            stdoutChunks.join(''),
            '=== Process Output (stderr) ===',
            stderrChunks.join(''),
          ].join('\n');
          
          if (allOutput.trim()) {
            this.addLog('error', `Process output for table ${table}:\n${allOutput}`, table);
          }
          
          // Include output in error message for better debugging
          const fullErrorMsg = `${errorMsg}\n\nProcess output:\n${allOutput}`;
          reject(new Error(fullErrorMsg));
        }
      });

      // Handle process errors
      process.on('error', (error) => {
        const errorMsg = `Process error for table ${table}: ${error.message}`;
        this.addLog('error', errorMsg, table);
        reject(new Error(errorMsg));
      });
    });
  }

  async stopSync(): Promise<void> {
    if (!this.state.isRunning) {
      throw new Error('Sync is not running');
    }

    this.state.isStopping = true;
    this.addLog('info', 'Stopping sync...');

    // Kill current process if running
    if (this.syncProcess) {
      this.addLog('info', 'Terminating current sync process...');
      this.syncProcess.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.syncProcess && !this.syncProcess.killed) {
          this.addLog('warning', 'Force killing sync process');
          this.syncProcess?.kill('SIGKILL');
        }
      }, 5000);
    }
    // The sequential sync loop will check isStopping and break after current table completes
  }
}

// Singleton instance
let syncServiceInstance: DatabaseSyncService | null = null;

export function getSyncService(): DatabaseSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new DatabaseSyncService();
  }
  return syncServiceInstance;
}

export default DatabaseSyncService;
