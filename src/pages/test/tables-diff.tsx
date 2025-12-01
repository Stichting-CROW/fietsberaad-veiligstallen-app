import React from 'react';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import dynamic from 'next/dynamic';

const TablesDiff = dynamic(() => import('~/components/beheer/test/TablesDiff'), { ssr: false });

export const getServerSideProps = async (
  context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<{ isDevelopment: boolean }>> => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    props: {
      isDevelopment,
    },
  };
};

type TablesDiffPageProps = {
  isDevelopment: boolean;
};

const TablesDiffPage: React.FC<TablesDiffPageProps> = ({ isDevelopment }) => {
  // Return blank page if not in development mode
  if (!isDevelopment) {
    return <div></div>;
  }

  return <TablesDiff />;
};

export default TablesDiffPage;

