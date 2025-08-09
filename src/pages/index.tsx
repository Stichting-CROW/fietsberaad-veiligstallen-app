import { type NextPage } from "next";
import type { Metadata } from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { type Session } from "next-auth";
import HomeComponent from "~/components/HomeComponent";

export async function getServerSideProps(context: any) {
  try {
    const session: Session | null = await getServerSession(
      context.req,
      context.res,
      authOptions,
    );

    return {
      props: {
        online: true,
        message: "",
      },
    };
  } catch (ex: any) {
    console.error("index.getServerSideProps - error: ", ex.message);
    return {
      props: {
        online: false,
        message: ex.message,
      },
    };
  }
}

interface HomeProps {
  online: boolean,
  message: string,
}

const Home: NextPage<HomeProps> = ({ online, message }) => {
  return <HomeComponent online={online} message={message} url_municipality={undefined} url_municipalitypage={undefined} />
};

export const metadata: Metadata = {
  title: "VeiligStallen",
  description: "Nederlandse fietsenstallingen op de kaart",
};

export default Home;
