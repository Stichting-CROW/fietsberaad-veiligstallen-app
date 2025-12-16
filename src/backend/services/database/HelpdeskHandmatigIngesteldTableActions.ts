import { prisma } from "~/server/db";
import { type HelpdeskHandmatigIngesteldParams, type HelpdeskHandmatigIngesteldStatus } from "~/backend/services/database-service";

export const getHelpdeskHandmatigIngesteldStatus = async (params: HelpdeskHandmatigIngesteldParams) => {
  const sqldetectcolumn = `SELECT COUNT(*) As count FROM information_schema.columns 
    WHERE table_schema = DATABASE() 
    AND table_name = 'fietsenstallingen' 
    AND column_name = 'HelpdeskHandmatigIngesteld'`;

  let columnExists = false;
  const status: HelpdeskHandmatigIngesteldStatus | false = {
    status: 'missing',
    size: undefined,
  };

  try {
    const result = await prisma.$queryRawUnsafe<{ count: number }[]>(sqldetectcolumn);
    columnExists = result && result.length > 0 && result[0] ? result[0].count > 0 : false;
    if (columnExists) {
      status.status = 'available';

      const sqlGetStatistics = `SELECT COUNT(*) As count FROM fietsenstallingen WHERE HelpdeskHandmatigIngesteld IS NOT NULL`;
      const resultStatistics = await prisma.$queryRawUnsafe<{ count: number }[]>(sqlGetStatistics);
      if (resultStatistics && resultStatistics.length > 0 && resultStatistics[0] !== undefined) {
        status.size = parseInt(resultStatistics[0].count.toString());
      }
    }
    return status;
  } catch (error) {
    console.error(">>> HelpdeskHandmatigIngesteld ERROR Unable to get column status", error);
    return false;
  }
}

export const updateHelpdeskHandmatigIngesteldField = async (params: HelpdeskHandmatigIngesteldParams): Promise<HelpdeskHandmatigIngesteldStatus | false> => {
  const status = await getHelpdeskHandmatigIngesteldStatus(params);
  if(status === false) {
    return false;
  }

  if(status.status !== 'available') {
    console.error("HelpdeskHandmatigIngesteld column does not exist");
    return false;
  }

  // Update ALL records according to current logic (no WHERE clause - updates every row)
  // Logic: when exploitantID equals NULL AND beheerder is non-null and not empty (trimmed), set it to true, otherwise false
  // Only Beheerder is checked, not BeheerderContact - the flag is set based solely on Beheerder having a value
  // Also treat "---" as empty (common placeholder value)
  // This will correct any existing incorrect values and initialize NULL values
  const sqlUpdate = `UPDATE fietsenstallingen 
    SET HelpdeskHandmatigIngesteld = CASE 
      WHEN ExploitantID IS NULL 
        AND Beheerder IS NOT NULL 
        AND Beheerder != ''
        AND TRIM(Beheerder) != '---'
        AND LENGTH(TRIM(Beheerder)) > 0
      THEN true 
      ELSE false 
    END`;

  await prisma.$executeRawUnsafe(sqlUpdate);
  
  return getHelpdeskHandmatigIngesteldStatus(params);
}

export const createHelpdeskHandmatigIngesteldField = async (params: HelpdeskHandmatigIngesteldParams) => {
  // Check if column already exists
  const status = await getHelpdeskHandmatigIngesteldStatus(params);
  if(status !== false && status.status === 'available') {
    return status;
  }

  // Add the column to the fietsenstallingen table
  const sqlAddColumn = `ALTER TABLE fietsenstallingen 
    ADD COLUMN HelpdeskHandmatigIngesteld BIT(1) DEFAULT NULL`;

  try {
    await prisma.$executeRawUnsafe(sqlAddColumn);
    
    // After creating the column, update existing records
    return await updateHelpdeskHandmatigIngesteldField(params);
  } catch (error) {
    console.error("Unable to create HelpdeskHandmatigIngesteld column", error);
    return false;
  }
}

export const dropHelpdeskHandmatigIngesteldField = async (params: HelpdeskHandmatigIngesteldParams) => {
  // Check if column exists first
  const status = await getHelpdeskHandmatigIngesteldStatus(params);
  if(status === false) {
    return false;
  }

  if(status.status !== 'available') {
    // Column doesn't exist, return status as missing
    return status;
  }

  // Column exists, drop it
  const sql = "ALTER TABLE fietsenstallingen DROP COLUMN HelpdeskHandmatigIngesteld";

  try {
    await prisma.$executeRawUnsafe(sql);
    return getHelpdeskHandmatigIngesteldStatus(params);
  } catch (error) {
    console.error("Unable to drop HelpdeskHandmatigIngesteld column", error);
    return false;
  }
}

