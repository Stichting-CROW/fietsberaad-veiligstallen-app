import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import type { VSArticle } from '~/types/articles';

type ArticleEditProps = {
  id: string;
  onClose: (confirmClose?: boolean) => void;
};

const ArticleEdit: React.FC<ArticleEditProps> = ({ id, onClose }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const [article, setArticle] = useState<VSArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      if (id === 'new') {
        setArticle({
          ID: '',
          Title: '',
          Article: '',
          Navigation: 'article',
          Status: 'draft',
          DateModified: new Date().toISOString(),
          DateCreated: new Date().toISOString(),
          ModuleID: 'veiligstallenprisma'
        });
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // TODO: Replace with actual API call
        const response = await fetch(`/api/protected/articles/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch article');
        }
        const articleResponse = await response.json();
        setArticle(articleResponse.data);
      } catch (err) {
        setError('Failed to load article');
        console.error('Error loading article:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  const addArticleFields = (article: VSArticle) => {
    const activeContactID = session?.user?.activeContactId || '';

    return {
      ...article,
      SiteID: activeContactID,
      Title: (article.DisplayTitle || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_+/g, '_') // Replace multiple underscores with single underscore
        .trim(), // Remove leading/trailing spaces
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!article) return;

    const articleObject = addArticleFields(article)

    try {
      setIsSaving(true);
      const response = await fetch(`/api/protected/articles${id === 'new' ? '/new' : `/${id}`}`, {
        method: id === 'new' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(articleObject),
      });

      if (!response.ok) {
        throw new Error('Failed to save article');
      }

      onClose();
    } catch (err) {
      setError('Failed to save article');
      console.error('Error saving article:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!article) return;

    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setArticle(prev => prev ? { ...prev, [name]: checked ? '1' : '0' } : null);
    } else {
      setArticle(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  if (isLoading) {
    return <div>Laden...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!article) {
    return <div>Pagina niet gevonden</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          {id === 'new' ? 'Nieuwe pagina' : 'Bewerk pagina'}
        </h2>
        <button
          onClick={() => onClose(true)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="DisplayTitle" className="block text-sm font-medium text-gray-700">
            Titel
          </label>
          <input
            type="text"
            id="DisplayTitle"
            name="DisplayTitle"
            value={article.DisplayTitle || ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="Article" className="block text-sm font-medium text-gray-700">
            Content
          </label>
          <textarea
            id="Article"
            name="Article"
            value={article.Article}
            onChange={handleChange}
            rows={10}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        {/* Status checkbox */}
        <div>
          <label htmlFor="Status" className="block text-sm font-medium text-gray-700">
            <input 
              type="checkbox" 
              id="Status" 
              name="Status" 
              checked={article.Status === '1'} 
              onChange={handleChange}
              className="mr-2"
            />
            Toon deze pagina op de website
          </label>
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={() => onClose(true)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Annuleren
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {isSaving ? 'Pagina opslaan...' : 'Pagina opslaan'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ArticleEdit; 