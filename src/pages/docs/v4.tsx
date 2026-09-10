import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/docs/api/v4",
    permanent: false,
  },
});

export default function FmsApiV4DocsRedirect() {
  return null;
}
