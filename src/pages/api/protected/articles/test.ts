import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession, makeApiCall } from "~/utils/server/database-tools";
import type { TestResult, TestResponse } from "~/types/test";
import { TestStatus } from "~/types/test";
import { type ArticleResponse } from "./[id]";
import { TestError } from "~/types/test";
import moment from "moment";

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
    const createTest = await testCreateArticle(req);
    console.log("createTest", createTest);
    testResults[0] = createTest;
    if (createTest.status === TestStatus.Failed) {
      throw new TestError("Create test failed", createTest);
    }
    createdRecordId = (createTest.details as { ID: string })?.ID || null;
    console.log("createdRecordId", createdRecordId);
    // Test 2: Retrieve all records
    const readAllTest = await testReadAllArticles(req);
    testResults[1] = readAllTest;
    if (readAllTest.status === TestStatus.Failed) {
      throw new TestError("Read all test failed", readAllTest);
    }

    // Test 3: Retrieve the new record
    if (createdRecordId) {
      const readSingleTest = await testReadSingleArticle(req, createdRecordId);
      testResults[2] = readSingleTest;
      if (readSingleTest.status === TestStatus.Failed) {
        throw new TestError("Read single test failed", readSingleTest);
      }
    }

    // Test 4: Update the record
    if (createdRecordId) {
      const updateTest = await testUpdateArticle(req, createdRecordId);
      testResults[3] = updateTest;
      if (updateTest.status === TestStatus.Failed) {
        throw new TestError("Update test failed", updateTest);
      }
    }

    // // Test 5: Delete the record
    if (createdRecordId) {
      const deleteTest = await testDeleteArticle(req, createdRecordId);
      testResults[4] = deleteTest;
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
    if (error instanceof TestError) {
      console.error(`Test failed: ${error.message} ${JSON.stringify(error.testResult, null, 2)}`);
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
        const { success, result } = await makeApiCall<ArticleResponse>(req, `/api/protected/articles/${createdRecordId}`, 'DELETE');
        if (!success || result?.error) {
          console.error("Failed to clean up test record:", result?.error);
        }
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }
    }
  }
}

export const testRecordCreateArticle = {
  SiteID: 'E1991A95-08EF-F11D-FF946CE1AA0578FB',// Utrecht
  Language: null,
  ParentID: '0',
  Title: `MyPage ${Date.now()}`,
  DisplayTitle: `MyPage ${Date.now()}`,
  Abstract: null,
  CustomField1_Title: null,
  CustomField1: null,
  Banner: null,
  Keywords: null,
  SortOrder: 1,
  PublishStartDate: new Date('2025-01-01').toISOString(),
  PublishEndDate: null,
  Status: '1',
  Navigation: 'main',
  ShowInNav: '1',
  System: '1',
  EditorCreated: 'Systeem',
  DateCreated: new Date().toISOString(),
  EditorModified: 'Systeem',
  DateModified: new Date().toISOString(),
  Module: 'veiligstallen'
};

async function testCreateArticle(req: NextApiRequest): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<ArticleResponse>(req, '/api/protected/articles/new', 'POST', testRecordCreateArticle);
    if (!success || !result?.data) {
      return {
        name: "Create Record",
        status: TestStatus.Failed,
        message: `Failed to create record: ${result?.error || 'Unknown error'}`,
        details: result?.error
      };
    }

    const createdRecordId = result.data?.ID;
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

async function testReadAllArticles(req: NextApiRequest): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<ArticleResponse>(req, '/api/protected/articles');
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

async function testReadSingleArticle(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<ArticleResponse>(req, `/api/protected/articles/${id}`);
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

async function testUpdateArticle(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<ArticleResponse>(req, `/api/protected/articles/${id}`);
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

    const { success: updateSuccess, result: updateResult } = await makeApiCall<ArticleResponse>(req, `/api/protected/articles/${id}`, 'PUT', updatedData);
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

async function testDeleteArticle(req: NextApiRequest, id: string): Promise<TestResult> {
  try {
    const { success, result } = await makeApiCall<ArticleResponse>(req, `/api/protected/articles/${id}`, 'DELETE');
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