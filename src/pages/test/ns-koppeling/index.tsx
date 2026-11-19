import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/beheer/nskoppeling/0',
    permanent: false,
  },
});

export default function NsKoppelingRedirect() {
  return null;
}
