import { type NextPage } from "next";
import type { Metadata } from "next";

export const getServerSideProps = async (context: any) => {
    try {
        const { slug } = context.params as { slug: string[] };
    
        return {
          props: {
            slug: slug,
          },
        };
      } catch (ex: any) {
        console.error("index.getServerSideProps - error: ", ex.message);
        return {
          props: {
            slug: [],
          },
        };
      }
  
  }

  const GottaCatchMAllPage: NextPage = ( props : any) => {
    console.log("rendering catchmallpage");
    return <div>Catchmallpage</div>;
  }

  export const metadata: Metadata = {
    title: "VeiligStallen",
    description: "Nederlandse fietsenstallingen op de kaart",
  };
  
  export default GottaCatchMAllPage;