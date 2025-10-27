import React from 'react';
import type { WachtrijSummary } from '~/types/wachtrij';

interface WachtrijSummaryProps {
  summary: WachtrijSummary;
  title: string;
}

const WachtrijSummaryComponent: React.FC<WachtrijSummaryProps> = ({ summary, title }) => {
  const stats = [
    {
      label: 'Total',
      value: summary.total,
      color: 'bg-gray-100 text-gray-800',
      icon: '📊',
    },
    {
      label: 'Pending',
      value: summary.pending,
      color: 'bg-yellow-100 text-yellow-800',
      icon: '⏳',
    },
    {
      label: 'Processing',
      value: summary.processing,
      color: 'bg-blue-100 text-blue-800',
      icon: '⚙️',
    },
    {
      label: 'Success',
      value: summary.success,
      color: 'bg-green-100 text-green-800',
      icon: '✅',
    },
    {
      label: 'Error',
      value: summary.error,
      color: 'bg-red-100 text-red-800',
      icon: '❌',
    },
  ];

  return (
    <div className="bg-white shadow rounded-lg p-2">
      {title && <h3 className="text-sm font-medium text-gray-900 mb-2">{title}</h3>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded p-2 ${stat.color} transition-all hover:shadow-md`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{stat.icon}</span>
              <div>
                <p className="text-xs font-medium opacity-75">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WachtrijSummaryComponent;
