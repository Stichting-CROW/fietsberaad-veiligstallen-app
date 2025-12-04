import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Button } from '~/components/Button';

const TestIndexPage: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">
                Inloggen vereist
              </h3>
              <p className="text-sm text-yellow-700 mb-4">
                U moet ingelogd zijn om deze pagina te bekijken.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Test Pagina's
        </h1>
        
        <div className="grid grid-cols-1 gap-6">
          <Button
            onClick={() => handleNavigate('/test/controle-overzicht')}
            className="py-6 px-8 text-center w-full"
            style={{
              backgroundColor: '#3B82F6',
            }}
          >
            Synchronisatie overzicht
          </Button>
          
          <Button
            onClick={() => handleNavigate('/test/transacties')}
            className="py-6 px-8 text-center w-full"
            style={{
              backgroundColor: '#3B82F6',
            }}
          >
            Transacties overzicht
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TestIndexPage;

