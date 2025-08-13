import type { NextApiRequest, NextApiResponse } from "next";
import type { VSContactGemeente } from "~/types/contacts";
import { testRecordCreateGemeente } from "./gemeenten/test";
import { makeApiCall } from "~/utils/server/database-tools";

export const createTestContactGemeente = async (req: NextApiRequest): Promise<VSContactGemeente | false> => {
  try { 
    // First try to find the existing gemeente
    const { success: readSuccess, result: readResult } = await makeApiCall<{ data?: VSContactGemeente[], error?: string }>(req, '/api/protected/gemeenten', 'GET');
    if (!readSuccess || readResult?.error) {
      return false;
    }
    // Look for the test gemeente
    const testGemeente = readResult?.data?.find((g: VSContactGemeente) => g.CompanyName === "Test data-eigenaar tbv usertests");
    if (testGemeente) {
      return testGemeente;
    }

    // If not found, create it
    const testRecord = JSON.parse(JSON.stringify(testRecordCreateGemeente));
    testRecord.CompanyName = "Test data-eigenaar tbv usertests";
    testRecord.ZipID = "T001";

    const { success: createSuccess, result: createResult } = await makeApiCall<{ data?: VSContactGemeente[], error?: string }>(req, '/api/protected/gemeenten/new', 'POST', testRecord);
    if (!createSuccess || !createResult?.data) {
      return false;
    }

    return createResult.data[0] ?? false;
  } catch (error) {
    return false;
  }
}

