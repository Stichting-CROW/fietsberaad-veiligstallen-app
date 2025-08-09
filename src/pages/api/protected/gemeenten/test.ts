import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession, makeApiCall } from "~/utils/server/database-tools";
import { type TestResult, type TestResponse, TestStatus, TestError } from "~/types/test";
import { type GemeentenResponse } from ".";
import { type GemeenteResponse } from "./[id]";
import moment from "moment";
import type { GemeenteValidateResponse } from "./validate";
import { VSContactItemType } from "~/types/contacts";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  const validationResult = await validateUserSession(session, "organizations");

  if ('error' in validationResult) {
    res.status(validationResult.status).json({
      success: false,
      tests: [{
        name: "Authentication",
        status: TestStatus.Failed,
        message: "User not authenticated"
      }]
    });
    return;
  }

  const cleanupResult = await cleanupTestdata(req);
  if (cleanupResult.status === TestStatus.Failed) {
    res.status(500).json({
      success: false,
      tests: [{
        name: "Cleanup Testdata",
        status: TestStatus.Failed,
        message: "Failed to cleanup test data",
        details: cleanupResult.details
      }]
    });    
    return;
  }

  const testResults: TestResult[] = [];
  let createdRecordId: string | null = null;

  // Initialize all test results with not executed state
  testResults.push(
    {
      name: "Create Record",
      status: TestStatus.NotExecuted,
      message: "Not executed" 
    }, 
    {
      name: "Retrieve All Records",
      status: TestStatus.NotExecuted,
      message: "Not executed"
    }, 
    {
      name: "Retrieve Single Record",
      status: TestStatus.NotExecuted,
      message: "Not executed"
    }, 
    { 
      name: "Validate Record",
      status: TestStatus.NotExecuted,
      message: "Not executed"
    },
    {
      name: "Update Record",
      status: TestStatus.NotExecuted,
      message: "Not executed"
    }, 
    {
      name: "Delete Record",
      status: TestStatus.NotExecuted,
      message: "Not executed"
    },
  );

  try {
    // Test 1: Create a new record
    const createTest = await testCreateGemeente(req);
    testResults[0] = createTest;
    if (createTest.status === TestStatus.Failed) {
      throw new TestError("Create test failed", createTest);
    }
    createdRecordId = (createTest.details as { ID: string })?.ID || null;
    // Test 2: Retrieve all records
    const readAllTest = await testReadAllGemeenten(req);
    testResults[1] = readAllTest;
    if (readAllTest.status === TestStatus.Failed) {
      throw new TestError("Read all test failed", readAllTest);
    }

    // Test 3: Retrieve the new record
    if (createdRecordId) {
      const readSingleTest = await testReadSingleGemeente(req, createdRecordId);
      testResults[2] = readSingleTest;
      if (readSingleTest.status === TestStatus.Failed) {
        throw new TestError("Read single test failed", readSingleTest);
      }
    }

    // Test 4: use the Validate api to check if the record is valid
    if (createdRecordId) {
      const validateTest = await testValidateGemeente(req, createdRecordId);
      testResults[3] = validateTest;
      if (validateTest.status === TestStatus.Failed) {
        throw new TestError("Validate test failed", validateTest);
      }
    }

    // Test 5: Update the record
    if (createdRecordId) {
      const updateTest = await testUpdateGemeente(req, createdRecordId);
      testResults[4] = updateTest;
      if (updateTest.status === TestStatus.Failed) {
        throw new TestError("Update test failed", updateTest);
      }
    }

    // Test 6: Delete the record
    if (createdRecordId) {
      const deleteTest = await testDeleteGemeente(req, createdRecordId);
      testResults[5] = deleteTest;
      if (deleteTest.status === TestStatus.Failed) {
        throw new TestError("Delete test failed", deleteTest);
      } else {
        createdRecordId = null;
      }
    }

    res.status(200).json({
      success: testResults.every(t => (t.status === TestStatus.Success || t.status === TestStatus.NotExecuted)),
      tests: testResults
    });
  } catch (error) {
    if(error instanceof TestError) {
      console.error(`Test failed: ${error.message} ${JSON.stringify(error.testResult,null,2)}`);
    } else {
      console.error("Unexpected error:", error);
    }
    res.status(500).json({
      success: false,
      tests: testResults
    });
  } finally {
    // Always attempt cleanup
    if (createdRecordId) {
      try {
        const { success, result } = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${createdRecordId}`, 'DELETE');
        if (!success || result?.error) {
          console.error("Failed to clean up test record:", result?.error);
        }
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }
    }
  }
}

export const testRecordCreateGemeente = {
  CompanyName: `Test Gemeente ${Date.now()}`,
  ItemType: VSContactItemType.Organizations,
  ZipID: "T000",
  ThemeColor1: "1f99d2",
  ThemeColor2: "96c11f",
  DayBeginsAt: moment().startOf('day').toDate(),
  Coordinaten: "52.1326,5.2913",
  Zoom: 12,
  Status: "1"
};


async function testCreateGemeente(req: NextApiRequest): Promise<TestResult> {
  try {
    const { success, result, error }  = await makeApiCall<GemeentenResponse>(req, '/api/protected/gemeenten/new', 'POST', testRecordCreateGemeente);
    if (!success || !result?.data) {
      return {
        name: "Create Record",
        status: TestStatus.Failed,
        message: `Failed to create record: ${result?.error || 'Unknown error'}`,
        details: result?.error
      };
    }

    const createdRecordId = result.data?.[0]?.ID;
    if (!createdRecordId) {
      return {
        name: "Create Record",
        status: TestStatus.Failed,
        message: "Failed to get ID from created record",
        details: result.data
      };
    }

    return {
      name: "Create Record",
      status: TestStatus.Success,
      message: "Successfully created test record",
      details: { ID: createdRecordId }
    };
  } catch (error) {
    return {
      name: "Create Record",
      status: TestStatus.Failed,
      message: "Failed to create test record",
      details: error
    };
  }
}

async function testReadAllGemeenten(req: NextApiRequest): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<GemeentenResponse>(req, '/api/protected/gemeenten');
    if (!success || result?.error) {
      return {
        name: "Retrieve All Records",
        status: TestStatus.Failed,
        message: `Failed to retrieve records: ${result?.error || 'Unknown error'}`,
        details: result?.error
      };
    }

    return {
      name: "Retrieve All Records",
      status: TestStatus.Success,
      message: `Successfully retrieved ${result?.data?.length} records`,
      details: { count: result?.data?.length }
    }; 
  } catch (error) {
    return {
      name: "Retrieve All Records",
      status: TestStatus.Failed,
      message: "Failed to retrieve records",
      details: error
    };
  }
}

async function testReadSingleGemeente(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result }  = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${id}`);
    if (!success || result?.error) {
      console.error("testReadSingleGemeente", result?.error);
      return {
        name: "Retrieve Single Record",
        status: TestStatus.Failed,
        message: `Failed to retrieve single record: ${result?.error || 'Unknown error'}`,
        details: { id, error: result?.error }
      };
    }

    return {
      name: "Retrieve Single Record",
      status: TestStatus.Success,
      message: "Successfully retrieved the test record",
      details: result?.data
    };
  } catch (error) {
    return {
      name: "Retrieve Single Record",
      status: TestStatus.Failed,
      message: "Failed to retrieve single record",
      details: error
    };
  }
}

async function testUpdateGemeente(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${id}`);
    if (!success || !result?.data) {
      return {
        name: "Update Record",
        status: TestStatus.Failed,
        message: `Failed to retrieve record for update: ${result?.error || 'Unknown error'}`,
        details: { id, error: result?.error }
      };
    }

    const updatedData = {
      ID: result.data?.ID,
      CompanyName: `Updated ${result.data?.CompanyName}`,
      ThemeColor1: "ff0000"
    };

    const { success: updateSuccess, result: updateResult } = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${id}`, 'PUT', updatedData);
    if (!updateSuccess || !updateResult?.data) {
      return {
        name: "Update Record",
        status: TestStatus.Failed,
        message: `Failed to update record: ${updateResult?.error || 'Unknown error'}`,
        details: { id, error: updateResult?.error }
      };
    }

    return {
      name: "Update Record",
      status: TestStatus.Success,
      message: "Successfully updated the test record",
      details: updateResult?.data
    };
  } catch (error) {
    return {
      name: "Update Record",
      status: TestStatus.Failed,
      message: "Failed to update record",
      details: error
    };
  }
}

async function testDeleteGemeente(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${id}`, 'DELETE');
    if (!success) {
      return {
        name: "Delete Record",
        status: TestStatus.Failed,
        message: `Failed to delete record: ${result || 'Unknown error'}`,
        details: { id, error: result?.error }
      };
    }

    return {
      name: "Delete Record",
      status: TestStatus.Success,
      message: "Successfully deleted the test record",
      details: { ID: id }
    };
  } catch (error) {
    return {
      name: "Delete Record",
      status: TestStatus.Failed,
      message: `Failed to delete record - error ${error}`,
      details: error
    };
  }
} 

async function testValidateGemeente(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    // First get the current record to use as base for our tests
    const { success: getSuccess, result: getResult } = await makeApiCall<GemeenteResponse>(req, `/api/protected/gemeenten/${id}`);
    if (!getSuccess || !getResult?.data) {
      return {
        name: "Validate Record",
        status: TestStatus.Failed,
        message: "Failed to get record for validation testing",
        details: getResult?.error
      };
    }

    const baseRecord = getResult.data;
    const testCases = [
      {
        name: "Valid Record",
        data: baseRecord,
        expectedValid: true
      },
      {
        name: "Missing CompanyName",
        data: { ...baseRecord, CompanyName: "" },
        expectedValid: false
      },
      {
        name: "Invalid ZipID",
        data: { ...baseRecord, ZipID: "" },
        expectedValid: false
      },
      {
        name: "Invalid ThemeColor1",
        data: { ...baseRecord, ThemeColor1: "invalid" },
        expectedValid: false
      },
      {
        name: "Invalid ThemeColor2",
        data: { ...baseRecord, ThemeColor2: "invalid" },
        expectedValid: false
      },
      {
        name: "Invalid Coordinates",
        data: { ...baseRecord, Coordinaten: "invalid" },
        expectedValid: false
      },
      {
        name: "Invalid Zoom",
        data: { ...baseRecord, Zoom: -1 },
        expectedValid: false
      }
    ];

    const results = [];
    for (const testCase of testCases) {
      const { success, result } = await makeApiCall<GemeenteValidateResponse>(
        req,
        `/api/protected/gemeenten/validate`,
        'POST',
        testCase.data
      );

      if (!success) {
        return {
          name: "Validate Record",
          status: TestStatus.Failed,
          message: `Failed to validate record: ${result?.message || 'Unknown error'}`,
          details: { testCase: testCase.name, message: result?.message }
        };
      }

      const isValid = result?.valid === testCase.expectedValid;
      results.push({
        testCase: testCase.name,
        expected: testCase.expectedValid,
        actual: result?.valid,
        message: result?.message
      });

      if (!isValid) {
        return {
          name: "Validate Record",
          status: TestStatus.Failed,
          message: `Validation test failed for ${testCase.name}`,
          details: { testCase: testCase.name, expected: testCase.expectedValid, actual: result?.valid, message: result?.message }
        };
      }
    }

    return {
      name: "Validate Record",
      status: TestStatus.Success,
      message: "Successfully validated record with all test cases",
      details: { results }
    };
  } catch (error) {
    return {
      name: "Validate Record",
      status: TestStatus.Failed,
      message: "Failed to validate record",
      details: error
    };
  }
}

async function cleanupTestdata(req: NextApiRequest): Promise<TestResult> {
    try {
      await prisma.contacts.deleteMany({
        where: { ZipID: testRecordCreateGemeente.ZipID }
      });

      return {
        name: "Cleanup Testdata",
        status: TestStatus.Success,
        message: "Successfully cleaned up test data"
      };
    } catch (e) {
      console.error("Error cleaning up test data:", e);
      return {
        name: "Delete Record",
        status: TestStatus.Failed,
        message: "Failed to delete record",
        details: e
      };
    }
}

