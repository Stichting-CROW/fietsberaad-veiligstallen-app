import React, { useState } from 'react';

interface PagesFaqUpdateComponentProps {
  title?: string;
}

const PagesFaqUpdateComponent: React.FC<PagesFaqUpdateComponentProps> = ({ title = 'Paginas & FAQ beheer' }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleCheck = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/protected/articles/check', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      setResultMessage('✅ Check voltooid.');
      if (json?.data) {
        setStatusMessage(JSON.stringify(json.data, null, 2));
      }
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // const handlePaginaReport = async () => {
  //   setIsLoading(true);
  //   setResultMessage(null);
  //   setErrorMessage(null);
  //   setStatusMessage(null);

  //   try {
  //     const response = await fetch('/api/protected/articles/report?type=paginas', {
  //       method: 'GET',
  //       headers: { 'Content-Type': 'application/json' },
  //     });

  //     const json = await response.json();

  //     if (!response.ok || !json?.success) {
  //       const msg = json?.error || response.statusText || 'Onbekende fout';
  //       setErrorMessage(`❌ Fout: ${msg}`);
  //       return;
  //     }

  //     setResultMessage('✅ Pagina rapport gegenereerd.');
  //     if (json?.data) {
  //       setStatusMessage(JSON.stringify(json.data, null, 2));
  //     }
  //   } catch (error) {
  //     setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // const handleFaqReport = async () => {
  //   setIsLoading(true);
  //   setResultMessage(null);
  //   setErrorMessage(null);
  //   setStatusMessage(null);

  //   try {
  //     const response = await fetch('/api/protected/articles/report?type=faq', {
  //       method: 'GET',
  //       headers: { 'Content-Type': 'application/json' },
  //     });

  //     const json = await response.json();

  //     if (!response.ok || !json?.success) {
  //       const msg = json?.error || response.statusText || 'Onbekende fout';
  //       setErrorMessage(`❌ Fout: ${msg}`);
  //       return;
  //     }

  //     setResultMessage('✅ FAQ rapport gegenereerd.');
  //     if (json?.data) {
  //       setStatusMessage(JSON.stringify(json.data, null, 2));
  //     }
  //   } catch (error) {
  //     setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-4 rounded mb-4">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <button
          onClick={handleCheck}
          disabled={isLoading}
          className={`px-4 py-2 rounded-md text-white ${
            isLoading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-700'
          }`}
        >
          Check & Fix
        </button>
        {/* <button
          onClick={handlePaginaReport}
          disabled={isLoading}
          className={`px-4 py-2 rounded-md text-white ${
            isLoading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-green-500 hover:bg-green-700'
          }`}
        >
          Pagina rapport
        </button>
        <button
          onClick={handleFaqReport}
          disabled={isLoading || true}
          className={`px-4 py-2 rounded-md text-white ${
            isLoading || true
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-purple-500 hover:bg-purple-700'
          }`}
        >
          FAQ rapport
        </button> */}
      </div>

      <div className="mt-4 min-h-[1.25rem]">
        {isLoading && (
          <div className="spinner">
            <div className="loader" />
          </div>
        )}
        {!isLoading && resultMessage && (
          <div className="text-green-700 font-semibold">{resultMessage}</div>
        )}
        {!isLoading && errorMessage && (
          <div className="text-red-700 font-semibold">{errorMessage}</div>
        )}
        {!isLoading && statusMessage && (
          <pre className="mt-2 whitespace-pre-wrap text-sm bg-white border border-gray-300 rounded p-2 max-h-96 overflow-y-auto">{statusMessage}</pre>
        )}
      </div>
    </div>
  );
};

export default PagesFaqUpdateComponent;
