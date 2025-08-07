import React, { useEffect, useState } from 'react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import ArticleEdit from './ArticleEdit';
import { useArticles } from '~/hooks/useArticles';
import type { VSArticle } from '~/types/articles';
import { Table, Column } from '~/components/common/Table';
import ArticleFilters, { ArticleFiltersState } from '~/components/common/ArticleFilters';
import { hasContent } from '~/utils/articles';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useSession } from 'next-auth/react';

const ArticlesComponent: React.FC<{ type: "articles" | "pages" | "fietskluizen" | "buurtstallingen" | "abonnementen" }> = ({ type }) => {
  const { data: session } = useSession();
  const { gemeenten, isLoading: gemeentenLoading } = useGemeentenInLijst();
  const { articles, isLoading, error, reloadArticles } = useArticles();
  const [filteredArticles, setFilteredArticles] = useState<VSArticle[]>([]);
  const [currentArticleId, setCurrentArticleId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<ArticleFiltersState>({
    gemeenteId: '',
    status: 'All',
    navigation: 'All',
    content: 'All',
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let result = articles;
    if (filters.gemeenteId) {
      result = result.filter(article => article.SiteID === filters.gemeenteId);
    }
    if (filters.status !== 'All') {
      result = result.filter(article => article.Status === (filters.status === 'Yes' ? '1' : '0'));
    }
    if (filters.navigation !== 'All') {
      result = result.filter(article =>
        (filters.navigation === 'Main' ? article.Navigation === 'main' : article.Navigation !== 'main')
      );
    }
    if (filters.content !== 'All') {
      result = result.filter(article =>
        (filters.content === 'Content' ? hasContent(article) : !hasContent(article))
      );
    }
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(article =>
        article.Title?.toLowerCase().includes(search) ||
        article.Article?.toLowerCase().includes(search)
      );
    }
    setFilteredArticles(result);
  }, [articles, filters, searchTerm]);

  const handleEditArticle = (id: string) => {
    setCurrentArticleId(id);
  };

  const handleDeleteArticle = async (id: string) => {
    if(! confirm('Weet je zeker dat je deze pagina wilt verwijderen?')) {
      return;
    }

    try {
      // TODO: Replace with actual API call
      const response = await fetch(`/api/protected/articles/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete article');
      }
      setFilteredArticles(filteredArticles.filter(article => article.ID !== id));
    } catch (error) {
      console.error('Error deleting article:', error);
    }
  };

  const handleCloseEdit = async (confirmClose = false) => {
    if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?') === false)) {
      return;
    }
    setCurrentArticleId(undefined);
    // Refresh the articles list
    reloadArticles();
  };

  if(gemeentenLoading) {
    return <LoadingSpinner message="Loading gemeenten..." />;
  }

  const renderOverview = () => {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Pagina's</h1>
          <button 
            onClick={() => handleEditArticle('new')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe pagina
          </button>
        </div>

        <ArticleFilters
          onChange={(newFilters, newSearchTerm) => {
            setFilters(newFilters);
            setSearchTerm(newSearchTerm);
          }}
          showGemeenteSelection={false}
          activeMunicipalityID={session?.user?.activeContactId || ''}
        />

        <Table 
          columns={[
            {
              header: 'Titel',
              accessor: 'DisplayTitle'
            },
            {
              header: 'Gemeente',
              accessor: (article) => { 
                if(article.SiteID==="1") {
                  return 'Algemeen';
                } else {
                  return gemeenten.find(g => g.ID === article.SiteID)?.CompanyName || 'Onbekend';
                }
              }
            },
            {
              header: 'Status',
              accessor: (article) => article.Status === '1' ? 'Actief' : 'Inactief'
            },
            {
              header: 'Laatst gewijzigd',
              accessor: (article) => new Date(article.DateModified || '').toLocaleDateString()
            },
            {
              header: 'Acties',
              accessor: (article) => (
                <>
                  <button 
                    onClick={() => handleEditArticle(article.ID)} 
                    className="text-yellow-500 mx-1 disabled:opacity-40"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDeleteArticle(article.ID)} 
                    className="text-red-500 mx-1 disabled:opacity-40"
                  >
                    🗑️
                  </button>
                </>
              )
            }
          ]}
          data={filteredArticles}
          className="mt-4 min-w-full bg-white"
        />
      </div>
    );
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading articles..." />;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-6">
      {currentArticleId === undefined ? (
        renderOverview()
      ) : (
        <ArticleEdit
          id={currentArticleId}
          onClose={handleCloseEdit}
        />
      )}
    </div>
  );
};

export default ArticlesComponent;
