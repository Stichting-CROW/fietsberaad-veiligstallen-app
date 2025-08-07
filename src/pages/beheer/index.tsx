import React from 'react';
import { type GetServerSidePropsContext } from 'next';
import BeheerPage, { getServerSideProps as importedGetServerSideProps } from './[activecomponent]/index';

export const getServerSideProps = async (_props: GetServerSidePropsContext) => {
  return importedGetServerSideProps(_props);
}

const DefaultBeheerPage: React.FC<{}>= () => {
  return <BeheerPage />;
};

export default DefaultBeheerPage;
