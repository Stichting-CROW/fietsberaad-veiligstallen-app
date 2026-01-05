import React from 'react';
import type { VSFAQ } from "~/types/faq";
import { Table } from '~/components/common/Table';

const FaqSection = ({
  section, items, handleEditFaq, handleDeleteFaq, handleMoveUp, handleMoveDown
}: {
  section: VSFAQ, items: VSFAQ[], handleEditFaq: (id: string) => void, handleDeleteFaq: (id: string) => void,
  handleMoveUp: (id: string, currentIndex: number) => void, handleMoveDown: (id: string, currentIndex: number) => void
}) => {
  // Don't show empty sections
  if(items.length === 0) {
    return null;
  }

  // Sort items by SortOrder
  const sortedItems = [...items].sort((a, b) => {
    const orderA = a.SortOrder ?? 0;
    const orderB = b.SortOrder ?? 0;
    return orderA - orderB;
  });

  return (
    <div>
      <h2 className="text-xl font-bold my-4">{section.Title}</h2>

      <Table 
        options={{
          hideHeaders: true
        }}
        columns={[
          {
            header: 'Vraag',
            accessor: 'Question',
            className: 'w-full',
          },
          {
            header: '',
            accessor: (faq) => {
              const currentIndex = sortedItems.findIndex(item => item.ID === faq.ID);
              const isFirst = currentIndex === 0;
              const isLast = currentIndex === sortedItems.length - 1;
              return (
                <div className="whitespace-nowrap">
                  {isFirst ? (
                    <span className="mx-1 text-xl invisible inline-block" aria-hidden="true">
                      ▲
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleMoveUp(faq.ID, currentIndex)} 
                      className="text-blue-500 mx-1 text-xl"
                      title="Omhoog"
                    >
                      ▲
                    </button>
                  )}
                  {isLast ? (
                    <span className="mx-1 text-xl invisible inline-block" aria-hidden="true">
                      ▼
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleMoveDown(faq.ID, currentIndex)} 
                      className="text-blue-500 mx-1 text-xl"
                      title="Omlaag"
                    >
                      ▼
                    </button>
                  )}
                  <button 
                    onClick={() => handleEditFaq(faq.ID)} 
                    className="text-yellow-500 mx-1 disabled:opacity-40 text-xl"
                    title="Bewerken"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDeleteFaq(faq.ID)} 
                    className="text-red-500 mx-1 disabled:opacity-40 text-xl"
                    title="Verwijderen"
                  >
                    🗑️
                  </button>
                </div>
              );
            },
            className: 'whitespace-nowrap'
          }
        ]}
        data={sortedItems}
        className="min-w-full bg-white"
      />
    </div>
  );
};

export default FaqSection;