import { PrismaClient } from "~/generated/prisma-client";
import { logPrismaError } from "./formatPrismaError";

export const MAX_ROWS_TO_CACHE = 10000;

export type DiffStatus = 'inserted' | 'modified' | 'deleted';

export type DiffEntry = {
  id: string | number;
  status: DiffStatus;
  data: Record<string, any>;
};

export type TableDiff = {
  [tableName: string]: DiffEntry[];
};

export type CheckpointResult = {
  checkpoint: Record<string, any[]>;
  warnings?: {
    [tableName: string]: {
      message: string;
      rowCount: number;
      limit: number;
    };
  };
};

export type DiffResult = {
  diff: TableDiff;
  warnings?: {
    [tableName: string]: {
      message: string;
      rowCount: number;
      limit: number;
    };
  };
};

/**
 * Gets the current database name
 */
async function getCurrentDatabaseName(prismaClient: PrismaClient): Promise<string> {
  try {
    const result = await prismaClient.$queryRawUnsafe<Array<{ db_name: string }>>(
      `SELECT DATABASE() as db_name`
    );
    const dbName = result[0]?.db_name || '';
    return dbName;
  } catch (error) {
    logPrismaError('Database name detection', error);
    return '';
  }
}

/**
 * Detects the primary key column for a table
 */
async function detectPrimaryKey(
  prismaClient: PrismaClient,
  tableName: string
): Promise<string | null> {
  try {
    // Get current database name
    const dbName = await getCurrentDatabaseName(prismaClient);
    
    // Try to query INFORMATION_SCHEMA for primary key
    try {
      if (dbName) {
        const result = await prismaClient.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
          `SELECT COLUMN_NAME 
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = ? 
           AND TABLE_NAME = ? 
           AND CONSTRAINT_NAME = 'PRIMARY'
           LIMIT 1`,
          dbName,
          tableName
        );

        if (result && result.length > 0 && result[0]) {
          return result[0].COLUMN_NAME;
        }
      }
    } catch (infoSchemaError) {
      // Fallback to other methods
    }

    // Fallback: Try to get column names from INFORMATION_SCHEMA
    const commonPatterns = [
      'ID',
      'id',
      `${tableName}_id`,
      `${tableName}ID`,
      `${tableName}_ID`,
    ];

    try {
      if (dbName) {
        const columns = await prismaClient.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
          `SELECT COLUMN_NAME 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? 
           AND TABLE_NAME = ?`,
          dbName,
          tableName
        );

        if (columns && columns.length > 0) {
          const columnNames = columns.map((c) => c.COLUMN_NAME);
          // Try exact match first
          for (const pattern of commonPatterns) {
            if (columnNames.includes(pattern)) {
              return pattern;
            }
          }
          // Try case-insensitive match
          const lowerColumnNames = columnNames.map(c => c.toLowerCase());
          for (const pattern of commonPatterns) {
            const lowerPattern = pattern.toLowerCase();
              const index = lowerColumnNames.indexOf(lowerPattern);
              if (index >= 0 && columnNames[index]) {
                return columnNames[index];
              }
          }
          // Fallback to first column
          const firstColumn = columns[0]?.COLUMN_NAME;
          if (firstColumn) {
            return firstColumn;
          }
        }
      }
    } catch (columnsError) {
      // Fallback to SHOW COLUMNS
    }

    // Last resort: Try to query the table directly with LIMIT 0 to get column info
    // This is a MySQL-specific approach - try SHOW COLUMNS
    try {
      const showColumnsResult = await prismaClient.$queryRawUnsafe<Array<{ Field: string; Key: string }>>(
        `SHOW COLUMNS FROM \`${tableName}\``
      );
      
      if (showColumnsResult && showColumnsResult.length > 0) {
        // Look for PRIMARY key
        const primaryKeyColumn = showColumnsResult.find(col => col.Key === 'PRI');
        if (primaryKeyColumn) {
          return primaryKeyColumn.Field;
        }
        
        // Fallback to common patterns
        const columnNames = showColumnsResult.map(c => c.Field);
        for (const pattern of commonPatterns) {
          if (columnNames.includes(pattern)) {
            return pattern;
          }
        }
        // Case-insensitive
        const lowerColumnNames = columnNames.map(c => c.toLowerCase());
        for (const pattern of commonPatterns) {
          const lowerPattern = pattern.toLowerCase();
          const index = lowerColumnNames.indexOf(lowerPattern);
          if (index >= 0 && columnNames[index]) {
            return columnNames[index];
          }
        }
        // First column as last resort
        const firstField = showColumnsResult[0]?.Field;
        if (firstField) {
          return firstField;
        }
      }
    } catch (showColumnsError) {
      // All methods failed
    }

    return null;
  } catch (error) {
    logPrismaError(`Primary key detection for table ${tableName}`, error);
    return null;
  }
}

/**
 * Fetches all rows from a table with row limit
 */
async function fetchTableRows(
  prismaClient: PrismaClient,
  tableName: string,
  primaryKey: string | null
): Promise<{ rows: any[]; totalCount: number }> {
  try {
    // Get total count
    const countResult = await prismaClient.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM \`${tableName}\``
    );
    const totalCount = Number(countResult[0]?.count || 0);

    // Get column list, excluding geometry columns (which Prisma can't handle with raw queries)
    const dbName = await getCurrentDatabaseName(prismaClient);
    const columnsResult = await prismaClient.$queryRawUnsafe<Array<{ COLUMN_NAME: string; DATA_TYPE: string }>>(
      `SELECT COLUMN_NAME, DATA_TYPE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = ? 
       AND DATA_TYPE NOT IN ('geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection')`,
      dbName,
      tableName
    );

    if (columnsResult.length === 0) {
      logPrismaError(`Fetching rows from table ${tableName}`, new Error('No columns found or table does not exist'));
      return { rows: [], totalCount: 0 };
    }

    // Build column list for SELECT
    const columnList = columnsResult.map(col => `\`${col.COLUMN_NAME}\``).join(', ');

    // Fetch rows with limit, excluding geometry columns
    const orderBy = primaryKey ? `ORDER BY \`${primaryKey}\`` : '';
    const rows = await prismaClient.$queryRawUnsafe<any[]>(
      `SELECT ${columnList} FROM \`${tableName}\` ${orderBy} LIMIT ${MAX_ROWS_TO_CACHE}`
    );

    // Normalize data types for consistent serialization and comparison
    // Convert BigInt, Date, and Decimal to JSON-compatible types
    const serializedRows = rows.map(row => {
      return normalizeForComparison(row);
    });

    return { rows: serializedRows, totalCount };
  } catch (error) {
    logPrismaError(`Fetching rows from table ${tableName}`, error);
    return { rows: [], totalCount: 0 };
  }
}

/**
 * Normalizes data types for comparison (handles Date, Decimal, BigInt, null/undefined)
 * This ensures checkpoint data (from JSON) and fresh data (from DB) can be compared correctly
 */
function normalizeForComparison(value: any): any {
  if (value === null || value === undefined) {
    return null; // Normalize both null and undefined to null
  }
  
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // Handle Prisma Decimal type - check for toNumber method
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return Number(value.toNumber());
  }
  
  // Handle string dates (from JSON) - normalize to ISO string
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    // Already an ISO string, return as-is
    return value;
  }
  
  if (typeof value === 'object' && !Array.isArray(value)) {
    const normalized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      normalized[key] = normalizeForComparison(val);
    }
    return normalized;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => normalizeForComparison(item));
  }
  
  return value;
}

/**
 * Serializes a row, converting BigInt values to strings for JSON compatibility
 * @deprecated Use normalizeForComparison instead
 */
function serializeRow(row: Record<string, any>): Record<string, any> {
  return normalizeForComparison(row);
}

/**
 * Compares two objects and returns only changed fields
 * Normalizes both sides before comparison to handle type differences
 */
function getChangedFields(oldData: Record<string, any>, newData: Record<string, any>): Record<string, any> {
  const changed: Record<string, any> = {};
  
  // Normalize both datasets for comparison
  const normalizedOld = normalizeForComparison(oldData);
  const normalizedNew = normalizeForComparison(newData);
  
  for (const key in normalizedNew) {
    const oldVal = normalizedOld[key];
    const newVal = normalizedNew[key];
    
    // Compare normalized values
    if (oldVal !== newVal) {
      // Handle null/undefined comparison (both normalized to null)
      if ((oldVal == null && newVal != null) || 
          (oldVal != null && newVal == null) ||
          (oldVal !== newVal)) {
        changed[key] = newVal;
      }
    }
  }
  
  return changed;
}

/**
 * Creates a checkpoint of the current state of specified tables
 */
export async function startCheckpoint(
  prismaClient: PrismaClient,
  tables: string[]
): Promise<CheckpointResult> {
  const checkpoint: Record<string, any[]> = {};
  const warnings: Record<string, { message: string; rowCount: number; limit: number }> = {};

  for (const tableName of tables) {
    try {
      const primaryKey = await detectPrimaryKey(prismaClient, tableName);
      if (!primaryKey) {
        checkpoint[tableName] = [];
        continue;
      }

      const { rows, totalCount } = await fetchTableRows(prismaClient, tableName, primaryKey);
      
      // Rows are already serialized in fetchTableRows, but ensure BigInt IDs are strings for consistency
      checkpoint[tableName] = rows.map(row => {
        const serialized: any = { ...row };
        // Ensure primary key is a string if it's BigInt
        if (row[primaryKey] && typeof row[primaryKey] === 'bigint') {
          serialized[primaryKey] = row[primaryKey].toString();
        }
        return serialized;
      });

      if (totalCount > MAX_ROWS_TO_CACHE) {
        warnings[tableName] = {
          message: `Table has more rows than limit`,
          rowCount: totalCount,
          limit: MAX_ROWS_TO_CACHE,
        };
      }
    } catch (error) {
      logPrismaError(`Checkpoint creation for table ${tableName}`, error);
      // Continue with other tables even if one fails
      checkpoint[tableName] = [];
    }
  }

  return {
    checkpoint,
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
  };
}

/**
 * Gets the diff between current state and checkpoint
 */
export async function getCurrentDiff(
  prismaClient: PrismaClient,
  tables: string[],
  checkpointData: Record<string, any[]>
): Promise<DiffResult> {
  const diff: TableDiff = {};
  const warnings: Record<string, { message: string; rowCount: number; limit: number }> = {};

  for (const tableName of tables) {
    try {
      const primaryKey = await detectPrimaryKey(prismaClient, tableName);
      if (!primaryKey) {
        continue;
      }

      const checkpointRows = checkpointData[tableName] || [];
      const { rows: currentRows, totalCount } = await fetchTableRows(prismaClient, tableName, primaryKey);

      if (totalCount > MAX_ROWS_TO_CACHE) {
        warnings[tableName] = {
          message: `Table has more rows than limit`,
          rowCount: totalCount,
          limit: MAX_ROWS_TO_CACHE,
        };
      }

      // Normalize checkpoint rows (from JSON) for comparison
      const normalizedCheckpointRows = checkpointRows.map(row => normalizeForComparison(row));
      const normalizedCurrentRows = currentRows.map(row => normalizeForComparison(row));

      // Helper function to get primary key value with case-insensitive field name matching
      const getPrimaryKeyValue = (row: Record<string, any>, pkName: string): any => {
        // Try exact match first
        if (pkName in row) {
          return row[pkName];
        }
        // Try case-insensitive match
        const lowerPkName = pkName.toLowerCase();
        for (const [key, value] of Object.entries(row)) {
          if (key.toLowerCase() === lowerPkName) {
            return value;
          }
        }
        return undefined;
      };

      // Create maps for efficient lookup
      const checkpointMap = new Map<string | number, any>();
      const currentMap = new Map<string | number, any>();

      for (const row of normalizedCheckpointRows) {
        const id = getPrimaryKeyValue(row, primaryKey);
        if (id != null) {
          // Ensure ID is string for consistent comparison
          const idKey = typeof id === 'number' ? id.toString() : String(id);
          checkpointMap.set(idKey, row);
        }
      }

      for (const row of normalizedCurrentRows) {
        const id = getPrimaryKeyValue(row, primaryKey);
        if (id != null) {
          // Ensure ID is string for consistent comparison
          const idKey = typeof id === 'number' ? id.toString() : String(id);
          currentMap.set(idKey, row);
        }
      }

      const diffEntries: DiffEntry[] = [];

      // Find deleted rows (in checkpoint but not in current)
      for (const [id, checkpointRow] of checkpointMap.entries()) {
        if (!currentMap.has(id)) {
          // Serialize BigInt values
          const serializedRow = serializeRow(checkpointRow);
          diffEntries.push({
            id,
            status: 'deleted',
            data: serializedRow,
          });
        }
      }

      // Find inserted and modified rows
      for (const [id, currentRow] of currentMap.entries()) {
        if (!checkpointMap.has(id)) {
          // Inserted - serialize BigInt values
          const serializedRow = serializeRow(currentRow);
          diffEntries.push({
            id,
            status: 'inserted',
            data: serializedRow,
          });
        } else {
          // Check if modified
          const checkpointRow = checkpointMap.get(id);
          const changedFields = getChangedFields(checkpointRow, currentRow);
          
          if (Object.keys(changedFields).length > 0) {
            // Serialize BigInt values in changed fields
            const serializedFields = serializeRow(changedFields);
            diffEntries.push({
              id,
              status: 'modified',
              data: serializedFields,
            });
          }
        }
      }

      diff[tableName] = diffEntries;
    } catch (error) {
      logPrismaError(`Diff calculation for table ${tableName}`, error);
      // Continue with other tables even if one fails
      diff[tableName] = [];
    }
  }

  return {
    diff,
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
  };
}

