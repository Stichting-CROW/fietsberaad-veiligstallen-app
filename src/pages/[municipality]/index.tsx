import { type NextPage } from "next";
import type { Metadata } from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { type Session } from "next-auth";

import HomeComponent, { type HomeComponentProps } from "~/components/HomeComponent";

export const getServerSideProps = async (context: any) => {
    try {
        const {  municipality } = context.params as { municipality: string[]|string };
        // console.log("MunicipalitySlug - got municipality from context:", municipality);

        const session: Session | null = await getServerSession(
            context.req,
            context.res,
            authOptions,
          );
      
          return {
            props: {
              online: true,
              message: "",
              url_municipality: municipality,
              url_municipalitypage: undefined,
            },
          };
      
      } catch (ex: any) {
        console.error("index.getServerSideProps - error: ", ex.message);
        return {
          props: {
            allparkings: [],
            online: false,
            message: ex.message,
            url_municipality: undefined,
            url_municipalitypage: undefined,
          },
        };
      }
  }

  const MunicipalitySlug: NextPage<HomeComponentProps> = ( props ) => {
    return <HomeComponent {...props} />;
  }

  export const metadata: Metadata = {
    title: "VeiligStallen",
    description: "Nederlandse fietsenstallingen op de kaart",
  };
  
  export default MunicipalitySlug;