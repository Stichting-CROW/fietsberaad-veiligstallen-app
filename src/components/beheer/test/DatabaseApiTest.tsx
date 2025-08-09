import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import type { ApiTestSection } from '~/types/test';
import { TestStatus } from '~/types/test';

const getStatusColors = (status: TestStatus) => {
  switch (status) {
    case TestStatus.Success:
      return {
        border: 'border-green-200',
        background: 'bg-green-50',
        badge: 'bg-green-200 text-green-800'
      };
    case TestStatus.Failed:
      return {
        border: 'border-red-200',
        background: 'bg-red-50',
        badge: 'bg-red-200 text-red-800'
      };
    case TestStatus.NotExecuted:
      return {
        border: 'border-gray-200',
        background: 'bg-gray-50',
        badge: 'bg-gray-200 text-gray-800'
      };
  }
};

const getStatusText = (status: TestStatus) => {
  switch (status) {
    case TestStatus.Success:
      return 'Passed';
    case TestStatus.Failed:
      return 'Failed';
    case TestStatus.NotExecuted:
      return 'Not Executed';
  }
};

const testSections: ApiTestSection[] = [
  {
    name: "Gemeenten API",
    endpoint: "/api/protected/gemeenten/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Contacts API",
    endpoint: "/api/protected/contacts/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Fietsenstallingen API",
    endpoint: "/api/protected/fietsenstallingen/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Exploitant API",
    endpoint: "/api/protected/exploitant/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Data Providers API",
    endpoint: "/api/protected/dataprovider/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Security Users API",
    endpoint: "/api/protected/security_users/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  },
  {
    name: "Articles API",
    endpoint: "/api/protected/articles/test",
    expanded: false,
    results: null,
    error: null,
    isLoading: false
  }
]

const DatabaseApiTest: React.FC = () => {
  const { data: session } = useSession();
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [apiSections, setApiSections] = useState<ApiTestSection[]>(testSections);

  const runTests = async (endpoint: string, sectionName: string) => {
    setApiSections(sections => sections.map(section => 
      section.name === sectionName 
        ? { ...section, isLoading: true, error: null }
        : section
    ));

    try {
      const response = await fetch(endpoint);
      // if (!response.ok) {
      //   throw new Error(`HTTP error! status: ${response.status}`);
      // }
      const data = await response.json();
      console.log(">>> test results", JSON.stringify(data, null, 2));
      setApiSections(sections => sections.map(section => 
        section.name === sectionName 
          ? { 
              ...section, 
              results: data, 
              expanded: !data.success,
              isLoading: false 
            } 
          : section
      ));
    } catch (err) {
      setApiSections(sections => sections.map(section => 
        section.name === sectionName 
          ? { 
              ...section, 
              error: err instanceof Error ? err.message : 'An unknown error occurred',
              isLoading: false 
            } 
          : section
      ));
    }
  };

  const runAllTests = async () => {
    setIsLoadingAll(true);
    setApiSections(sections => sections.map(section => ({
      ...section,
      results: null,
      error: null,
      isLoading: true
    })));

    for (const section of apiSections) {
      await runTests(section.endpoint, section.name);
    }

    setIsLoadingAll(false);
  };

  const toggleSection = (sectionName: string) => {
    setApiSections(sections => sections.map(section => 
      section.name === sectionName 
        ? { ...section, expanded: !section.expanded } 
        : section
    ));
  };

  if (!session) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Please log in to access the test page.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Database API Test</h1>
      
      <button
        onClick={runAllTests}
        disabled={isLoadingAll}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-4"
      >
        {isLoadingAll ? 'Running All Tests...' : 'Run All Tests'}
      </button>

      <div className="space-y-4 max-w-4xl mx-auto">
        {apiSections.map((section) => (
          <div
            key={section.name}
            className={`border rounded-lg overflow-hidden ${
              section.results?.success ? 'border-green-500' : 'border-red-500'
            }`}
          >
            <div
              className={`p-4 flex justify-between items-center ${
                section.results?.success ? 'bg-green-50' : 'bg-red-50'
              }`}
            >
              <div className="flex items-center space-x-4">
                <h2 className="text-xl font-semibold">{section.name}</h2>
                {section.results && (
                  <span className={`px-2 py-1 rounded text-sm ${
                    section.results.success ? 'bg-green-200' : 'bg-red-200'
                  }`}>
                    {section.results.success ? 'Passed' : 'Failed'}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => runTests(section.endpoint, section.name)}
                  disabled={section.isLoading}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
                >
                  {section.isLoading ? 'Running...' : 'Run Tests'}
                </button>
                <button
                  onClick={() => toggleSection(section.name)}
                  className="text-blue-500 hover:text-blue-700 text-sm"
                >
                  {section.expanded ? 'Hide Details' : 'View Details'}
                </button>
              </div>
            </div>

            {section.expanded && (
              <div className="p-4 border-t">
                {section.error ? (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {section.error}
                  </div>
                ) : section.results ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {section.results.tests.map((test, index) => {
                        const colors = getStatusColors(test.status);
                        return (
                          <div
                            key={index}
                            className={`p-4 rounded-lg border ${colors.border} ${colors.background}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-semibold text-lg">{test.name}</h3>
                              <span className={`px-2 py-1 rounded text-sm ${colors.badge}`}>
                                {getStatusText(test.status)}
                              </span>
                            </div>
                            <p className="text-gray-700 mb-2">{test.message}</p>
                            {test.details && (
                              <div className="mt-3">
                                <h4 className="font-semibold mb-2">Test Details:</h4>
                                <div className="bg-white p-3 rounded border">
                                  {Object.entries(test.details).map(([key, value]) => (
                                    <div key={key} className="mb-2">
                                      <span className="font-medium text-gray-700">{key}:</span>
                                      <span className="ml-2 text-gray-600">
                                        {typeof value === 'object' 
                                          ? JSON.stringify(value, null, 2)
                                          : String(value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500">No test results available</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DatabaseApiTest; 