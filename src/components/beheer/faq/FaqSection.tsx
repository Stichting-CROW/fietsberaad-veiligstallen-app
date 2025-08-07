import React from 'react';
import type { VSFAQ } from "~/types/faq";
import { Table } from '~/components/common/Table';

const FaqSection = ({
  section, items, handleEditFaq, handleDeleteFaq
}: {
  section: VSFAQ, items: VSFAQ[], handleEditFaq: (id: string) => void, handleDeleteFaq: (id: string) => void
}) => {
  // Don't show empty sections
  if(items.length === 0) {
    return null;
  }

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
            accessor: (faq) => (
              <div className="whitespace-nowrap">
                <button 
                  onClick={() => handleEditFaq(faq.ID)} 
                  className="text-yellow-500 mx-1 disabled:opacity-40"
                >
                  ✏️
                </button>
                <button 
                  onClick={() => handleDeleteFaq(faq.ID)} 
                  className="text-red-500 mx-1 disabled:opacity-40"
                >
                  🗑️
                </button>
              </div>
            ),
            className: 'whitespace-nowrap'
          }
        ]}
        data={items}
        className="min-w-full bg-white"
      />
    </div>
  );
};

export default FaqSection;