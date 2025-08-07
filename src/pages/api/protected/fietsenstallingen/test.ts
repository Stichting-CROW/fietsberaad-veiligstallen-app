import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession, makeApiCall } from "~/utils/server/database-tools";
import type { TestResult, TestResponse } from "~/types/test";
import { TestStatus } from "~/types/test";
import { type FietsenstallingenResponse } from ".";
import { type FietsenstallingResponse } from "./[id]";
import { TestError } from "~/types/test";
// import type { FietsenstallingValidateResponse } from "./validate";
import { createTestContactGemeente } from "../test-tools";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  const validationResult = await validateUserSession(session, "any");
  
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

  // Do test preparations
  const testGemeente = await createTestContactGemeente(req);
  if (!testGemeente) {
    return {
      name: "Create Record",
      status: TestStatus.Failed,
      message: "Failed to create test gemeente",
    };
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
    }
  );

  try {
    // Test 1: Create a new record
    const createTest = await testCreateFietsenstalling(req, testGemeente.ID);
    testResults[0] = createTest;
    if (createTest.status === TestStatus.Failed) {
      throw new TestError("Create test failed", createTest);
    }
    createdRecordId = (createTest.details as { ID: string })?.ID || null;
    // Test 2: Retrieve all records
    const readAllTest = await testReadAllFietsenstallingen(req);
    testResults[1] = readAllTest;
    if (readAllTest.status === TestStatus.Failed) {
      throw new TestError("Read all test failed", readAllTest);
    }

    // Test 3: Retrieve the new record
    if (createdRecordId) {
      const readSingleTest = await testReadSingleFietsenstalling(req, createdRecordId);
      testResults[2] = readSingleTest;
      if (readSingleTest.status === TestStatus.Failed) {
        throw new TestError("Read single test failed", readSingleTest);
      }
    }

    // Test 4: Validate the record
    // if (createdRecordId) {
    //   const validateTest = await testValidateFietsenstalling(req, createdRecordId);
    //   testResults[3] = validateTest;
    //   if (validateTest.status === TestStatus.Failed) {
    //     throw new TestError("Validate test failed", validateTest);
    //   }
    // }

    // Test 5: Update the record
    if (createdRecordId) {
      const updateTest = await testUpdateFietsenstalling(req, createdRecordId);
      testResults[4] = updateTest;
      if (updateTest.status === TestStatus.Failed) {
        throw new TestError("Update test failed", updateTest);
      }
    }

    // Test 6: Delete the record
    if (createdRecordId) {
      const deleteTest = await testDeleteFietsenstalling(req, createdRecordId);
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
        const { success, result } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${createdRecordId}`, 'DELETE');
        if (!success || result?.error) {
          console.error("Failed to clean up test record:", result?.error);
        }
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }
    }

    if (testGemeente) {
      try {
        const { success, result } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/gemeenten/${testGemeente.ID}`, 'DELETE');
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }
    }
  }
}

export const testRecordCreateFietsenstalling = {
  StallingsID: `TEST0001`,
  Title: `Test Fietsenstalling ${Date.now()}`,
  Location: "Test Location",
  Plaats: "Test City",
  Capacity: 100,
  Status: "1",
  Type: "bewaakt",
  Verwijssysteem: false,
  FMS: false,
  IsStationsstalling: false,
  IsPopup: false,
  BerekentStallingskosten: false,
  AantalReserveerbareKluizen: 0,
  MaxStallingsduur: 0,
  HeeftExterneBezettingsdata: false,
  hasUniSectionPrices: true,
  hasUniBikeTypePrices: false,
  BronBezettingsdata: "FMS"
};

async function testCreateFietsenstalling(req: NextApiRequest, gemeenteID: string): Promise<TestResult> {
  const data = { ...testRecordCreateFietsenstalling, SiteID: gemeenteID };
  try {
    const { success, result }  = await makeApiCall<FietsenstallingenResponse>(req, '/api/protected/fietsenstallingen/new', 'POST', data);
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

async function testReadAllFietsenstallingen(req: NextApiRequest): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<FietsenstallingenResponse>(req, '/api/protected/fietsenstallingen');
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

async function testReadSingleFietsenstalling(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result }  = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${id}`);
    if (!success || result?.error) {
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

async function testUpdateFietsenstalling(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${id}`);
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
      Title: `Updated ${result.data?.Title}`,
      Location: "Updated Location"
    };

    const { success: updateSuccess, result: updateResult } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${id}`, 'PUT', updatedData);
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

async function testDeleteFietsenstalling(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${id}`, 'DELETE');
    if (!success) {
      return {
        name: "Delete Record",
        status: TestStatus.Failed,
        message: `Failed to delete record: ${result?.error || 'Unknown error'}`,
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
      message: "Failed to delete record",
      details: error
    };
  }
}

// async function testValidateFietsenstalling(req: NextApiRequest, id: string): Promise<TestResult> {
//   try {
//     // First get the current record to use as base for our tests
//     const { success: getSuccess, result: getResult } = await makeApiCall<FietsenstallingResponse>(req, `/api/protected/fietsenstallingen/${id}`);
//     if (!getSuccess || !getResult?.data) {
//       return {
//         name: "Validate Record",
//         status: TestStatus.Failed,
//         message: "Failed to get record for validation testing",
//         details: getResult?.error
//       };
//     }

//     const baseRecord = getResult.data;
//     const testCases = [
//       {
//         name: "Valid Record",
//         data: baseRecord,
//         expectedValid: true
//       },
//       // TODO: Add tests for missing fields
//       // {
//       //   name: "Missing Title",
//       //   data: { ...baseRecord, Title: "" },
//       //   expectedValid: false
//       // },
//       // {
//       //   name: "Missing StallingsID",
//       //   data: { ...baseRecord, StallingsID: "" },
//       //   expectedValid: false
//       // },
//       // {
//       //   name: "Invalid Coordinates",
//       //   data: { ...baseRecord, Coordinaten: "invalid" },
//       //   expectedValid: false
//       // },
//       // {
//       //   name: "Invalid Capacity",
//       //   data: { ...baseRecord, Capacity: -1 },
//       //   expectedValid: false
//       // }
//     ];

//     const results = [];
//     for (const testCase of testCases) {
//       const { success, result } = await makeApiCall<FietsenstallingValidateResponse>(
//         req,
//         `/api/protected/fietsenstallingen/validate`,
//         'POST',
//         testCase.data
//       );
//       if (!success) {
//         return {
//           name: "Validate Record",
//           status: TestStatus.Failed,
//           message: `Failed to validate record: ${result?.message || 'Unknown error'}`,
//           details: { testCase: testCase.name, message: result?.message }
//         };
//       }

//       const isValid = result?.valid === testCase.expectedValid;
//       results.push({
//         testCase: testCase.name,
//         expected: testCase.expectedValid,
//         actual: result?.valid,
//         message: result?.message
//       });

//       if (!isValid) {
//         return {
//           name: "Validate Record",
//           status: TestStatus.Failed,
//           message: `Validation test failed for ${testCase.name}`,
//           details: { testCase: testCase.name, expected: testCase.expectedValid, actual: result?.valid, message: result?.message }
//         };
//       }
//     }

//     return {
//       name: "Validate Record",
//       status: TestStatus.Success,
//       message: "Successfully validated record with all test cases",
//       details: { results }
//     };
//   } catch (error) {
//     return {
//       name: "Validate Record",
//       status: TestStatus.Failed,
//       message: "Failed to validate record",
//       details: error
//     };
//   }
// } 

async function cleanupTestdata(req: NextApiRequest): Promise<TestResult> {
  try {
    await prisma.fietsenstallingen.deleteMany({
      where: { StallingsID: testRecordCreateFietsenstalling.StallingsID }
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
