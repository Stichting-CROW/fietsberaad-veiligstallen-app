import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { VSFAQ } from '~/types/faq';
import RichTextEditor from '~/components/common/RichTextEditor';
import FormSelect from '~/components/Form/FormSelect';
import FormInput from '~/components/Form/FormInput';

type FaqEditProps = {
  id: string;
  onClose: (confirmClose?: boolean) => void;
  sections: VSFAQ[];
};

const FaqEdit: React.FC<FaqEditProps> = ({
  id,
  onClose,
  sections
}: {
  id: string,
  onClose: (confirmClose?: boolean) => void,
  sections: VSFAQ[]
}) => {
  const { data: session } = useSession();
  const [faq, setFaq] = useState<VSFAQ | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchFaq = async () => {
      if (id === 'new') {
        setFaq({
          ID: '',
          ParentID: '',
          Question: '',
          Answer: '',
          DateModified: new Date(),
          DateCreated: new Date()
        });
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`/api/protected/faqs/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch FAQ');
        }
        const faqResponse = await response.json();
        setFaq(faqResponse.data);
      } catch (err) {
        setError('Failed to load FAQ');
        console.error('Error loading FAQ:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFaq();
  }, [id]);

  const addFaqFields = (faq: VSFAQ) => {
    const activeContactID = session?.user?.activeContactId || '';

    return {
      ...faq,
      SiteID: activeContactID,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faq) return;

    const faqObject = addFaqFields(faq)

    try {
      setIsSaving(true);
      const response = await fetch(`/api/protected/faqs${id === 'new' ? '/new' : `/${id}`}`, {
        method: id === 'new' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(faqObject),
      });

      if (!response.ok) {
        throw new Error('Failed to save FAQ');
      }

      onClose();
    } catch (err) {
      setError('Failed to save FAQ');
      console.error('Error saving FAQ:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!faq) return;

    const { name, value } = e.target;
    setFaq(prev => prev ? { ...prev, [name]: value } : null);
  };

  if (isLoading) {
    return <div>Laden...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!faq) {
    return <div>FAQ niet gevonden</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          {id === 'new' ? 'Nieuwe FAQ' : 'Bewerk FAQ'}
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
          <FormSelect
            value={faq.ParentID || ''}
            onChange={(e) => {
              if (!faq) return;
              setFaq(prev => prev ? { ...prev, ParentID: e.target.value } : null);
            }}
            label="Categorie"
            placeholder="Selecteer een categorie"
            required
            options={sections
              .filter((section: VSFAQ) => section.Title && section.Title !== '')
              .map((section) => ({
                label: section.Title!,
                value: section.ID || ''
              }))}
          />
        </div>

        <div>
          <FormInput
            type="text"
            value={faq.Question || ''}
            onChange={(e) => {
              if (!faq) return;
              setFaq(prev => prev ? { ...prev, Question: e.target.value } : null);
            }}
            label="Vraag"
            required
          />
        </div>

        <div>
          <label htmlFor="Answer" className="block text-sm font-medium text-gray-700">
            Antwoord
          </label>
          <RichTextEditor
            value={faq.Answer || ''}
            onChange={(value) => setFaq(prev => prev ? { ...prev, Answer: value } : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
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
            {isSaving ? 'FAQ opslaan...' : 'FAQ opslaan'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FaqEdit; 