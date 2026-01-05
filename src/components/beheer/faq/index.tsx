import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { LoadingSpinner } from '../common/LoadingSpinner';
import FaqEdit from './FaqEdit';
import FaqSection from './FaqSection';
import type { VSContactsFAQ, VSFAQ } from '~/types/faq';
import { SearchFilter } from '~/components/common/SearchFilter';

const FaqComponent: React.FC = () => {
  const router = useRouter();
  const [faqs, setFaqs] = useState<{sections: VSFAQ[], items: VSFAQ[]}>({ sections: [], items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filteredFaqs, setFilteredFaqs] = useState<{sections: VSFAQ[], items: VSFAQ[]}>({ sections: [], items: [] });
  const [currentFaqId, setCurrentFaqId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/protected/faqs');
        if (!response.ok) {
          throw new Error('Failed to fetch FAQs');
        }
        const data = await response.json();
        setFaqs(data.data);
        setFilteredFaqs(data.data);
      } catch (err) {
        setError('Failed to load FAQs');
        console.error('Error loading FAQs:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  const handleEditFaq = (id: string) => {
    setCurrentFaqId(id);
  };

  const handleDeleteFaq = async (id: string) => {
    if(! confirm('Weet je zeker dat je deze FAQ wilt verwijderen?')) {
      return;
    }

    try {
      // TODO: Replace with actual API call
      const response = await fetch(`/api/protected/faqs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete FAQ');
      }
      setFilteredFaqs({
        sections: filteredFaqs.sections,
        items: filteredFaqs.items.filter((faq: VSFAQ) => faq.ID !== id)
      });
    } catch (error) {
      console.error('Error deleting FAQ:', error);
    }
  };

  const handleCloseEdit = async (confirmClose = false) => {
    if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?') === false)) {
      return;
    }
    setCurrentFaqId(undefined);
    // Refresh the FAQs list
    const response = await fetch('/api/protected/faqs');
    if (response.ok) {
      const data = await response.json();
      setFaqs(data.data);
      setFilteredFaqs(data.data);
    }
  };

  const refreshFaqs = async () => {
    const response = await fetch('/api/protected/faqs');
    if (response.ok) {
      const data = await response.json();
      setFaqs(data.data);
      setFilteredFaqs(data.data);
    }
  };

  const handleMoveUp = async (id: string, currentIndex: number) => {
    if (currentIndex === 0) return; // Already at the top

    // Find the FAQ item (use full list to ensure we have all data)
    const currentFaq = faqs.items.find((faq: VSFAQ) => faq.ID === id);
    if (!currentFaq) return;

    // Get all items in the same group (same ParentID)
    const groupItems = faqs.items
      .filter((faq: VSFAQ) => faq.ParentID === currentFaq.ParentID)
      .sort((a, b) => {
        const orderA = a.SortOrder ?? 0;
        const orderB = b.SortOrder ?? 0;
        return orderA - orderB;
      });

    // Find the current item's position in the sorted group
    const sortedIndex = groupItems.findIndex((faq: VSFAQ) => faq.ID === id);
    if (sortedIndex === 0) return; // Already at the top

    const previousFaq = groupItems[sortedIndex - 1];
    if (!previousFaq) return;

    // Swap SortOrder values
    const currentSortOrder = currentFaq.SortOrder ?? 0;
    const previousSortOrder = previousFaq.SortOrder ?? 0;

    try {
      // Update both FAQs - only send SortOrder field
      await Promise.all([
        fetch(`/api/protected/faqs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SortOrder: previousSortOrder,
          }),
        }),
        fetch(`/api/protected/faqs/${previousFaq.ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SortOrder: currentSortOrder,
          }),
        }),
      ]);

      // Refresh the list
      await refreshFaqs();
    } catch (error) {
      console.error('Error moving FAQ up:', error);
      alert('Er is een fout opgetreden bij het verplaatsen van de FAQ.');
    }
  };

  const handleMoveDown = async (id: string, currentIndex: number) => {
    // Find the FAQ item (use full list to ensure we have all data)
    const currentFaq = faqs.items.find((faq: VSFAQ) => faq.ID === id);
    if (!currentFaq) return;

    // Get all items in the same group (same ParentID)
    const groupItems = faqs.items
      .filter((faq: VSFAQ) => faq.ParentID === currentFaq.ParentID)
      .sort((a, b) => {
        const orderA = a.SortOrder ?? 0;
        const orderB = b.SortOrder ?? 0;
        return orderA - orderB;
      });

    // Find the current item's position in the sorted group
    const sortedIndex = groupItems.findIndex((faq: VSFAQ) => faq.ID === id);
    if (sortedIndex === groupItems.length - 1) return; // Already at the bottom

    const nextFaq = groupItems[sortedIndex + 1];
    if (!nextFaq) return;

    // Swap SortOrder values
    const currentSortOrder = currentFaq.SortOrder ?? 0;
    const nextSortOrder = nextFaq.SortOrder ?? 0;

    try {
      // Update both FAQs - only send SortOrder field
      await Promise.all([
        fetch(`/api/protected/faqs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SortOrder: nextSortOrder,
          }),
        }),
        fetch(`/api/protected/faqs/${nextFaq.ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SortOrder: currentSortOrder,
          }),
        }),
      ]);

      // Refresh the list
      await refreshFaqs();
    } catch (error) {
      console.error('Error moving FAQ down:', error);
      alert('Er is een fout opgetreden bij het verplaatsen van de FAQ.');
    }
  };

  const renderOverview = () => {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">FAQ's</h1>
          <button 
            onClick={() => handleEditFaq('new')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe FAQ
          </button>
        </div>

        <div className="mb-4">
          <SearchFilter
            id="faqSearch"
            label="Zoek FAQ"
            value={searchTerm}
            onChange={(value) => {
              setSearchTerm(value);
              const searchTerm = value.toLowerCase();
              setFilteredFaqs({
                sections: faqs.sections,
                items: faqs.items.filter((faq: VSFAQ) =>
                  faq.Question?.toLowerCase().includes(searchTerm) ||
                  faq.Answer?.toLowerCase().includes(searchTerm)
                )
              });
            }}
          />
        </div>

        {filteredFaqs.sections.map((section: VSFAQ) => {
          const sectionItems = filteredFaqs.items.filter((item: VSFAQ) => item.ParentID === section.ID);
          return (
            <FaqSection
              key={section.ID}
              section={section}
              items={sectionItems}
              handleEditFaq={handleEditFaq}
              handleDeleteFaq={handleDeleteFaq}
              handleMoveUp={handleMoveUp}
              handleMoveDown={handleMoveDown}
            />
          );
        })}

      </div>
    );
  };

  if (isLoading) {
    return <LoadingSpinner message="FAQ's laden..." />;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-6">
      {currentFaqId === undefined ? (
        renderOverview()
      ) : (
        <FaqEdit
          id={currentFaqId}
          sections={faqs.sections}
          onClose={handleCloseEdit}
        />
      )}
    </div>
  );
};

export default FaqComponent;
