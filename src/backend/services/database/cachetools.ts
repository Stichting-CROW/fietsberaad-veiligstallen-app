import { prisma } from "~/server/db";
export interface IndicesInfo {
  basetable: string;
  indices: Record<string, string>;
}

export const getParentIndicesStatus = async (indicesinfo: IndicesInfo): Promise<'available' | 'missing' | 'error'> => {
  try {
    for (const indexname of Object.keys(indicesinfo.indices)) {
      const result = await prisma.$queryRawUnsafe<{ Key_name: string }[]>(`SHOW INDEX FROM ${indicesinfo.basetable} WHERE Key_name = '${indexname}';`);
      if (!result) {
        console.error(`Unable to get index status on ${indicesinfo.basetable} [${indexname}]`, result);
        return 'error';
      }
      if(result.length === 0) {
        return 'missing';
      }
    }
    return 'available';
  } catch (error) {
    console.error(`Unable to get index status on ${indicesinfo.basetable}`, error);
    return 'error';
  }
}

export const dropParentIndices = async (indicesinfo: IndicesInfo) => {
  try {
    for (const indexname of Object.keys(indicesinfo.indices)) {
      const result = await prisma.$queryRawUnsafe(`DROP INDEX ${indexname} ON ${indicesinfo.basetable};`);
      if (!result) {
        console.error(`Unable to drop index on ${indicesinfo.basetable} [${indexname}]`, result);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(`Unable to drop index on ${indicesinfo.basetable}`, error);
    return false;
  }
}

export const createParentIndices = async (indicesinfo: IndicesInfo) => {
  try {
    console.log(`Creating parent indices for ${indicesinfo.basetable}`);
    for (const index_name of Object.keys(indicesinfo.indices) ) {
      const result = await prisma.$queryRawUnsafe(`CREATE INDEX ${index_name} ON ${indicesinfo.basetable} (${indicesinfo.indices[index_name]});`);
      if (!result) {
        console.error(`Unable to create index on ${indicesinfo.basetable} [${index_name}]`, result);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error("Unable to create index on bezettingsdata table", error);
    return false;
  }
}