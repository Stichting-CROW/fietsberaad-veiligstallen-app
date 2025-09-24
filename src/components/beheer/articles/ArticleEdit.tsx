import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { type VSArticle } from '~/types/articles';
import RichTextEditor from '~/components/common/RichTextEditor';
import FormInput from '~/components/Form/FormInput';
import PlainTextEditor from '~/components/common/PlainTextEditor';

type ArticleEditProps = {
  id: string;
  onClose: (confirmClose?: boolean) => void;
};

const ArticleEdit: React.FC<ArticleEditProps> = ({ id, onClose }) => {
  const { data: session } = useSession();
  const [article, setArticle] = useState<VSArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      if (id === 'new') {
        const activeContactID = session?.user?.activeContactId || '';
        setArticle({
          ID: '',
          SiteID: activeContactID,
          Title: '',
          Article: '',
          Navigation: 'article',
          Status: '1',
          System: '0',
          DateModified: new Date().toISOString(),
          DateCreated: new Date().toISOString(),
          ModuleID: 'veiligstallen'
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

  const articleIsValid = (article: VSArticle): boolean => {
    const fieldValueValid = (value: string | number | null | undefined): boolean => {
      return value !== null && value !== undefined
    }

    const titleOk = fieldValueValid(article.Title) && article.Title !== '';

    // not visible -> only check for valid title
    if(article.Status !== '1') {
      return titleOk;
    }

    const contentOk =     
      ((fieldValueValid(article.Abstract) && article.Abstract !== '') || (fieldValueValid(article.Article) && article.Article !== '')) &&
      fieldValueValid(article.SortOrder) && typeof article.SortOrder === 'number';

    return contentOk;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!article || !articleIsValid(article)) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/protected/articles${id === 'new' ? '/new' : `/${id}`}`, {
        method: id === 'new' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(article),
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!article) return;
    setArticle(prev => prev ? { ...prev, Title: e.target.value } : null);
  };

  const handleDisplayTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!article) return;
    setArticle(prev => prev ? { ...prev, DisplayTitle: e.target.value } : null);
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

  const isFietsberaad = session?.user?.activeContactId === '1';

  // Only Stallingen and Tips are editable, rest is fixed
  const canChangeDisplayTitle = article.System !== '1'; //  || (['Stallingen', 'Tips'].includes(article.Title||""))

  // Home is always fixed, Tips is always fixed for non fietsberaad
  const freezeStatus = (article.Title==='Home');

  const canSave = articleIsValid(article)

  const canSave = articleIsValid(article)


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
          <FormInput
            type="text"
            value={article.Title || ''}
            onChange={handleTitleChange}
            label="Paginanaam"
            disabled={article.System === '1'}
          />
        </div>        
        
         {/* Status checkbox */}
         { article.Title !== 'Home' ?<div>
          <label id="labelStatus" htmlFor="Status" className="block text-sm font-medium text-gray-700">
             <input 
              type="checkbox" 
              id="Status" 
              name="Status" 
              checked={article.Status === '1' || id === 'new'} 
              onChange={handleChange}
              className="mr-2"
              disabled={freezeStatus}
            />
            Toon deze pagina op de website
          </label>
        </div>: <div>
            <span>Deze pagina wordt altijd getoond op de website</span>
        </div> }
       <div>
          <FormInput
            type="text"
            value={article.DisplayTitle || ''}
            onChange={handleDisplayTitleChange}
            label="Titel"
            disabled={!canChangeDisplayTitle}
          />
        </div>

        <div>
          <label htmlFor="Abstract" className="block text-sm font-bold text-gray-700">
            Inleiding
          </label>
          <PlainTextEditor
            value={article.Abstract || ''}
            onChange={(value) => setArticle(prev => prev ? { ...prev, Abstract: value } : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="Article" className="block text-sm font-bold text-gray-700">
            Pagina inhoud
          </label>
          <RichTextEditor
            value={article.Article || ''}
            onChange={(value) => setArticle(prev => prev ? { ...prev, Article: value } : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <FormInput
            type="text"
            value={article.SortOrder || '9999999'}
            onChange={(e) => setArticle(prev => prev ? { ...prev, SortOrder: e.target.value === '9999999' ? null : parseInt(e.target.value) } : null)}
            label="Sorteervolgorde"
            required
            style={{width: '100px'}}
          />
        </div>
        
       { article.DateModified ? 
            <div>
              <label className="block text-sm font-bold text-gray-700">Laatst aangepast door {article.EditorModified || "Onbekend" } op {article.DateModified ? new Date(article.DateModified).toLocaleDateString() : ''}</label>
            </div>
            : article.DateCreated && 
                <div>
                  <label className="block text-sm font-bold text-gray-700">Aangemaakt door {article.EditorCreated || "Onbekend" } op {article.DateCreated ? new Date(article.DateCreated).toLocaleDateString() : ''}</label>
                </div>
        }

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
            disabled={isSaving || !canSave}
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