import React, { useEffect, useState } from 'react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import ArticleEdit from './ArticleEdit';
import { useArticles } from '~/hooks/useArticles';
import type { VSArticle } from '~/types/articles';
import { Table } from '~/components/common/Table';
import ArticleFilters from '~/components/common/ArticleFilters';
import { hasContent } from '~/utils/articles';
import { useSession } from 'next-auth/react';
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { useSelector } from 'react-redux';
import { selectArticleFilters } from '~/store/articleFiltersSlice';

const ArticlesComponent: React.FC = () => {
  const { data: session } = useSession();
  
  // Check user rights for access control
  const hasInstellingenSiteContent = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content);
  const canCreateNew = hasInstellingenSiteContent;
  const canDelete = hasInstellingenSiteContent;
  const { articles, isLoading, error, reloadArticles } = useArticles();
  const [filteredArticles, setFilteredArticles] = useState<VSArticle[]>([]);
  const [currentArticleId, setCurrentArticleId] = useState<string | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("Titel");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const filters = useSelector(selectArticleFilters);

  const articleIsVisibleOnSite = (article: VSArticle) => {
    return article.Status === '1' && hasContent(article);
  }

  useEffect(() => {
    let result = articles;
    // if (filters.gemeenteId) {
    //   result = result.filter(article => article.SiteID === filters.gemeenteId);
    // }
    if (filters.status !== 'All') {
      result = result.filter(article => articleIsVisibleOnSite(article) === (filters.status === 'Yes'));
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
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      result = result.filter(article =>
        article.Title?.toLowerCase().includes(search) ||
        article.DisplayTitle?.toLowerCase().includes(search) ||
        article.Article?.toLowerCase().includes(search)
      );
    }
    setFilteredArticles(result);
  }, [articles, filters]);

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

  const handleSort = (header: string) => {
    if (sortColumn === header) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(header);
      setSortDirection('asc');
    }
  };

  const getSortedData = () => {
    const sorted = [...filteredArticles].sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      switch (sortColumn) {
        case 'Paginanaam':
          aValue = a.Title || '';
          bValue = b.Title || '';
          break;
        case 'Titel':
          aValue = a.DisplayTitle || a.Title || '';
          bValue = b.DisplayTitle || b.Title || '';
          break;
        case 'Tonen':
          aValue = articleIsVisibleOnSite(a) ? 'Yes' : 'No';
          bValue = articleIsVisibleOnSite(b) ? 'Yes' : 'No';
          break;
        case 'Inhoud':
          aValue = hasContent(a) ? 'Yes' : 'No';
          bValue = hasContent(b) ? 'Yes' : 'No';
          break;
        case 'Standaard':
          aValue = a.System === '1' ? 'Yes' : 'No';
          bValue = b.System === '1' ? 'Yes' : 'No';
          break;
        case 'Laatst gewijzigd':
          aValue = new Date(a.DateModified || '').getTime();
          bValue = new Date(b.DateModified || '').getTime();
          break;
        case 'Volgorde':
          aValue = a.SortOrder || '';
          bValue = b.SortOrder || '';
          break;
        default:
          aValue = a.DisplayTitle || a.Title || '';
          bValue = b.DisplayTitle || b.Title || '';
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc' 
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    return sorted;
  };

  const renderOverview = () => {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Pagina's</h1>
          {canCreateNew && (
            <button 
              onClick={() => handleEditArticle('new')}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Nieuwe pagina
            </button>
          )}
        </div>

        <ArticleFilters activeMunicipalityID={session?.user?.activeContactId || ''} />

        <Table 
          columns={[
            {
              header: 'Titel',
              accessor: (article) => article.DisplayTitle || article.Title || ''
            },
            {
              header: 'Paginanaam',
              accessor: 'Title'
            },
            {
              header: 'Zichtbaar',
              accessor: (article) => articleIsVisibleOnSite(article) ? "Ja": "Nee",
              className: 'w-16 text-center'
            },
            {
              header: 'Inhoud',
              accessor: (article) => hasContent(article) ? 
              <span className="text-green-500">●</span> : 
              <span className="text-red-500">●</span>,
              className: 'w-16 text-center'
            },
            {
              header: 'Volgorde',
              accessor: (article) => article.SortOrder || '-',
              className: 'w-20 text-center'
            },
            {
              header: 'Standaard',
              accessor: (article) => article.System === '1' ? 
              <span className="text-green-500">●</span> : 
              <span className="text-red-500">●</span>,
              className: 'w-16 text-center'
            },
            {
              header: 'Laatst gewijzigd',
              accessor: (article) => (article.DateModified ? new Date(article.DateModified || '').toLocaleDateString() : 'Nooit')
            },
            {
              header: 'Acties',
              accessor: (article) => (
                <div className="whitespace-nowrap">
                  <button 
                    onClick={() => handleEditArticle(article.ID)} 
                    className="text-yellow-500 mx-1 disabled:opacity-40"
                  >
                    ✏️
                  </button>
                  {canDelete && article.System !== '1' && (
                    <button 
                      onClick={() => handleDeleteArticle(article.ID)} 
                      className="text-red-500 mx-1 disabled:opacity-40"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )
            }
          ]}
          data={getSortedData()}
          className="mt-4 min-w-full bg-white"
          sortableColumns={["Paginanaam", "Titel", "Tonen", "Volgorde", "Laatst gewijzigd"]}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
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
