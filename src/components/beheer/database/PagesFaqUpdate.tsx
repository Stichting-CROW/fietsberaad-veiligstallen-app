import React, { useState } from 'react';

interface PagesFaqUpdateComponentProps {
  title?: string;
}

const PagesFaqUpdateComponent: React.FC<PagesFaqUpdateComponentProps> = ({ title = 'Paginas & FAQ beheer' }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const downloadCSV = (data: string, type: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${timestamp}-${type}.csv`;
    
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCheck = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/articles/check?t=${Date.now()}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      setResultMessage('✅ Check voltooid.');
      if (json?.data) {
        downloadCSV(JSON.stringify(json.data, null, 2), 'check');
      }
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaginaReport = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/articles/report?type=paginas&t=${Date.now()}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      setResultMessage('✅ Pagina overzicht gegenereerd en gedownload.');
      if (json?.data) {
        downloadCSV(json.data, 'paginas');
      } else {
        setErrorMessage('❌ Geen data ontvangen');
      }
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaqReport = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/articles/report?type=faq&t=${Date.now()}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      console.log('json', json);

      setResultMessage('✅ FAQ overzicht gegenereerd en gedownload.');
      if (json?.data) {
        downloadCSV(json.data, 'faq');
      }
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

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
        <button
          onClick={handlePaginaReport}
          disabled={isLoading}
          className={`px-4 py-2 rounded-md text-white ${
            isLoading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-green-500 hover:bg-green-700'
          }`}
        >
          Pagina overzicht
        </button>
        <button
          onClick={handleFaqReport}
          disabled={isLoading}
          className={`px-4 py-2 rounded-md text-white ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-purple-500 hover:bg-purple-700'
          }`}
        >
          FAQ overzicht
        </button>
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
      </div>
    </div>
  );
};

export default PagesFaqUpdateComponent;
