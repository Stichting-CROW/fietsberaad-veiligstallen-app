import React from 'react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  onRowClick?: (item: T) => void;
  getRowClassName?: (item: T) => string;
  options?: {
    hideHeaders?: boolean;
  };
  sortableColumns?: string[];
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (header: string) => void;
}

export function Table<T>({ columns, data, className = '', onRowClick, getRowClassName, options = {}, sortableColumns = [], sortColumn, sortDirection, onSort }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full bg-white ${className}`}>
        {!options.hideHeaders && <thead>
          <tr>
            {columns.map((column, index) => {
              const isSortable = sortableColumns.includes(column.header);
              const isSorted = sortColumn === column.header;
              return (
                <th 
                  key={index} 
                  className={`py-2 px-4 text-left ${column.className || ''} ${isSortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={isSortable && onSort ? () => onSort(column.header) : undefined}
                >
                  {column.header}
                  {isSorted && (
                    <span className="ml-1">
                      {sortDirection === 'desc' ? '▼' : '▲'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>}
        <tbody>
          {data.map((item, rowIndex) => (
            <tr 
              key={rowIndex}
              onClick={() => onRowClick?.(item)}
              className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''} ${getRowClassName ? getRowClassName(item) : ''}`}
            >
              {columns.map((column, colIndex) => (
                <td 
                  key={colIndex} 
                  className={`border px-4 py-2 ${column.className || ''}`}
                >
                  {typeof column.accessor === 'function'
                    ? column.accessor(item)
                    : String(item[column.accessor])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 