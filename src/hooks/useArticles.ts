import { useState, useEffect } from 'react';
import type { VSArticle, VSArticleInLijst } from '~/types/articles';

type ArticlesResponse<T extends VSArticleInLijst | VSArticle> = {
  data?: T[];
  error?: string;
};

const useArticlesBasis = <T extends VSArticleInLijst | VSArticle>() => {
  const [articles, setArticles] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchArticles = async ({
    SiteID,
  }: {
    SiteID?: string;
  } = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      // Type-level check for compact flag
      const compact = {} as T extends VSArticleInLijst ? true : false;
      const response = await fetch(`/api/protected/articles?compact=${compact}${SiteID ? `&SiteID=${SiteID}` : ''}`);
      const result: ArticlesResponse<T> = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setArticles(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while fetching articles');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [version]);

  return {
    articles,
    isLoading,
    error: error || undefined,
    reloadArticles: () => setVersion(v => v + 1)
  };
}; 

export const useArticlesInLijst = () => useArticlesBasis<VSArticleInLijst>();
export const useArticles = () => useArticlesBasis<VSArticle>(); 