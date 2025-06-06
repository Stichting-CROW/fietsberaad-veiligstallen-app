import { getTransactionCacheStatus, updateTransactionCache, clearTransactionCache, createTransactionCacheTable, dropTransactionCacheTable, createTransactionParentIndices, dropTransactionParentIndices } from "~/backend/services/database/TransactionsCacheActions";
import { getBezettingCacheStatus, updateBezettingCache, clearBezettingCache, createBezettingCacheTable, dropBezettingCacheTable, createBezettingParentIndices, dropBezettingParentIndices } from "~/backend/services/database/BezettingCacheActions";
import { getStallingsduurCacheStatus, updateStallingsduurCache, clearStallingsduurCache, createStallingsduurCacheTable, dropStallingsduurCacheTable, createStallingsduurParentIndices, dropStallingsduurParentIndices } from "~/backend/services/database/StallingsduurCacheActions";
export type CacheActions = 'update' | 'clear' | 'createtable' | 'droptable' | 'status' | 'createparentindices' | 'dropparentindices';

export interface CacheResult {
  success: boolean;
  message: string;
  status?: CacheStatus | false;
}

export interface CacheParams {
  action: CacheActions;
  allDates: boolean;
  allBikeparks: boolean;
  startDate: Date;
  endDate: Date;
  selectedBikeparkIDs: string[];
}

export interface CacheStatus {
  status: 'missing' | 'available' | 'error';

  indexstatus: 'missing' | 'available' | 'error';

  // stats for the cache table
  size: number | undefined;
  firstUpdate: Date | null | undefined; // null -> no data yet
  lastUpdate: Date | null | undefined; // null -> no data yet

  // stats for the original table
  originalSize: number | undefined;
  originalFirstUpdate: Date | null | undefined; // null -> no data yet
  originalLastUpdate: Date | null | undefined; // null -> no data yet
}

const DatabaseService = {
  manageTransactionCache: async (params: CacheParams): Promise<CacheResult> => {
    switch (params.action) {
      case 'status':
        const status = await getTransactionCacheStatus(params);
        return { success: status!==undefined, message: "", status };
      case 'update': {
        const status = await updateTransactionCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'clear': {
        const status = await clearTransactionCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createtable': {  
        // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await createTransactionCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'droptable': { // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await dropTransactionCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createparentindices': {
        const status = await createTransactionParentIndices(params);
        return { success: status!==undefined, message: "", status  };
      }
      case 'dropparentindices': {
        const status = await dropTransactionParentIndices(params);
        return { success: status!==undefined, message: "", status };
      }
      default: {
        return { success: false, message: "Invalid action" };
      }
    }
  },
  manageBezettingCache: async (params: CacheParams): Promise<CacheResult> => {
    switch (params.action) {
      case 'status':
        const status = await getBezettingCacheStatus(params);
        return { success: status!==undefined, message: "", status };
      case 'update': {
        const status = await updateBezettingCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'clear': {
        const status = await clearBezettingCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createtable': {  
        // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await createBezettingCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'droptable': { // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await dropBezettingCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createparentindices': {
        const status = await createBezettingParentIndices(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'dropparentindices': {
        const status = await dropBezettingParentIndices(params);
        return { success: status!==undefined, message: "", status };
      }
      default: {
        return { success: false, message: "Invalid action" };
      }
    }
  },
  manageStallingsduurCache: async (params: CacheParams): Promise<CacheResult> => {
    switch (params.action) {
      case 'status':
        const status = await getStallingsduurCacheStatus(params);
        return { success: status!==undefined, message: "", status };
      case 'update': {
        const status = await updateStallingsduurCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'clear': {
        const status = await clearStallingsduurCache(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createtable': {  
        // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await createStallingsduurCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'droptable': { // TODO: remove when this table has been implemented in the prisma scripts and primary database
        const status = await dropStallingsduurCacheTable(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'createparentindices': {
        const status = await createStallingsduurParentIndices(params);
        return { success: status!==undefined, message: "", status };
      }
      case 'dropparentindices': {
        const status = await dropStallingsduurParentIndices(params);
        return { success: status!==undefined, message: "", status };
      }
      default: {
        return { success: false, message: "Invalid action" };
      }
    }
  }
};

export default DatabaseService;

