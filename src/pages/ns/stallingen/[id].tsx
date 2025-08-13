/* This page is used to redirect the user for old style NS links 
   in the format https://www.veiligstallen.nl/ns/stallingen/[id] */

import { prisma } from "~/server/db";
import { type GetServerSideProps } from 'next';

/* This stub redirects NS stallingen to a generic stalling ID 
   in the format https://www.veiligstallen.nl/stalling/[id]  
   Example: http://localhost:3000/ns/stallingen/uto002  */

export const getServerSideProps: GetServerSideProps = async (context) => {

  const id = context.query?.id || false;
  if (!id || Array.isArray(id)) {
    // redirect to /, no id given;
    return {
      redirect: {
        destination: `/`,
        permanent: true,
      },
    };
  }

  const theStalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: id,
      Title: {
        not: 'Systeemstalling'
      }
    },
    select: {
      ID: true
    }
  });

  if(theStalling) {
    return {
      redirect: {
        destination: `/?stallingid=${theStalling.ID}`,
        permanent: false,
      },
    };
  } else {
    // redirect to /, stalling not found
    return {
      redirect: {
        destination: `/`,
        permanent: true,
      },
    };
  }
};

const RedirectPage = () => {
  return null;
};

export default RedirectPage;