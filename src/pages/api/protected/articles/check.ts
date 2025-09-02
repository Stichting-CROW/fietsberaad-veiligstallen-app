import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { prisma } from '~/server/db';
import { generateID } from "~/utils/server/database-tools";

export interface VSPagina {
  ID: string;
  SiteID: String;
  Title: string;
  DisplayTitle: string;
  Abstract: string;
  Article: string;
  SortOrder: number;
  Status: string;
  Navigation: string;
  ShowInNav: string;
  System: string;
  EditorCreated: string;
  DateCreated: Date;
  EditorModified: string
  DateModified: Date;
}

export const requiredPages = 
[ 'Home',
 'fietstrommels',
 'Buurtstallingen',
 'Stallingen',
 'Fietsen_in',
 'Contact',
 'Fietskluizen',
 'Tips' 
]

const ignorePages = [ 'Prijzenpot' ];

const createStandardPage = (pagename: string, dataOwnerID: string, dataOwnerName: string, editorName: string) => {
  const createNavPageData = (SiteID: string, Title: string, DisplayTitle: string, Status: Boolean, SortOrder: number, ShowInNav: boolean = true, EditorName: string = 'Systeem') => {
    const timestamp = new Date();
    return  (
      {
        ID: generateID(),
        ParentID: '0',
        SiteID,
        Title,
        DisplayTitle,
        Status: Status ? '1' : '0',
        Abstract: null,
        Article: null,
        SortOrder,
        Navigation: 'main',
        ShowInNav: ShowInNav ? '1' : '0',
        System: '1',
        EditorCreated: EditorName,
        DateCreated: timestamp,
      });
  }
  
  switch(pagename) {
    case'Home': return createNavPageData(dataOwnerID, 'Home', 'Kaart', true, 10, true, editorName);
    case'fietstrommels': return createNavPageData(dataOwnerID, 'fietstrommels', 'Fietstrommels', true, 24, false, editorName);
    case'Buurtstallingen': return createNavPageData(dataOwnerID, 'Buurtstallingen', '', true, 22,false, editorName);
    case'Stallingen': return createNavPageData(dataOwnerID, 'Stallingen', '', true, 22, false, editorName);
    case'Fietsen_in': return createNavPageData(dataOwnerID, 'Fietsen_in', 'Fietsen in ' + dataOwnerName, false, 50, true, editorName);
    case'Contact': return createNavPageData(dataOwnerID, 'Contact', 'Contact', false, 100, false, editorName);
    case'Fietskluizen': return createNavPageData(dataOwnerID, 'Fietskluizen', 'Fietskluizen', true, 26, false, editorName);
    case'Tips': return createNavPageData(dataOwnerID, 'Tips', 'Tips', true, 85, false, editorName);
    default: return false;
  }
}

const checkAndFixStandardPages = async (siteID?: string, editorName: string = 'System') => {
   const dataOwners = await prisma.contacts.findMany({
    where: {
      ItemType: { in: ['organizations'] },
      ID: siteID ? siteID : undefined
    },
    orderBy: {
      CompanyName: 'asc'
    }
  })

  const allPages = (await prisma.articles.findMany({
    where: {
      SiteID: siteID ? siteID : { not: '1' }
    },
    orderBy: {
      Title: 'asc'
    }
  }));

  console.log(`*** Checking pages for ${dataOwners.length} dataOwners`);

  const results: string[] = []

  for(const contact of dataOwners) {
    // first get all pages for this contact

    // next check if all required pages are available
    for(const page of requiredPages) {
      if(ignorePages.includes(page)) {
        continue;
      }

      const existingPage = allPages.find((p) => p.Title === page && p.SiteID === contact.ID)

      if(!existingPage) {
        results.push(`Add standard page ${page} for ${contact.CompanyName || contact.ID} by ${editorName}`);
        const newPage = createStandardPage(page, contact.ID, contact.CompanyName || contact.ID, editorName);
        if(newPage) {
          // console.log(JSON.stringify(newPage, null, 2))
          console.log(JSON.stringify(newPage))
          await prisma.articles.create({
            data: newPage
          })
        } else {
          console.log(`*** Failed to create standard page ${page} for ${contact.CompanyName || ""}`);
        }
      }
    }
  }

  // reset system flag for all non system nav pages 
  const badPages = await prisma.articles.findMany({
    where: {
      Navigation: 'main',
      System: '1',
      Title: { notIn: [...requiredPages, ...ignorePages] },
      SiteID: siteID ? siteID : { not: '1' }
    }
  })

  // update content for 
  for(const page of badPages) {
    const contactName = dataOwners.find((c) => c.ID === page.SiteID)?.CompanyName || page.SiteID;
    results.push(`Reset system flag for ${page.Title} for ${contactName} by ${editorName}`);
    await prisma.articles.update({
      where: { ID: page.ID },
      data: { System: '0' }
    })
  }

  const homePages = await prisma.articles.findMany({
    where: {
      Title: 'Home',
      SiteID: siteID ? siteID : { not: '1' }
    }
  })
  for(const page of homePages) {
    const contactName = dataOwners.find((c) => c.ID === page.SiteID)?.CompanyName || page.SiteID;
    if(page.DisplayTitle !== 'Kaart' || page.Abstract!==null && page.Abstract!=='' || page.Article!==null && page.Article!=='') {
      // Skip pages that have been modified by hand
      console.log(`*** Skipping home page for ${contactName} (manually modified)`);
      continue;
    }

    const newDisplayTitle = `Welkom in ${contactName}`;

    let updateHomeData: { DisplayTitle: string, Abstract?: string, Article?: string } = { 
      DisplayTitle: newDisplayTitle, 
    }

    const link = dataOwners.find((c) => c.ID === page.SiteID)?.UrlName;
    let linktext = ``;
    if(link) {
      linktext = `<p dir="ltr"><a href="https://beta.veiligstallen.nl/${link}" target="_blank" rel="noreferrer" title="" dir="ltr"><span style="white-space: pre-wrap;">Kaart</span></a></p><p dir="ltr"><a href="https://beta.veiligstallen.nl/${link}/stallingen" target="_blank" rel="noreferrer" title="" dir="ltr"><span style="white-space: pre-wrap;">Lijst</span></a></p>`
    }

    updateHomeData.Article = `<p dir="ltr"><span style="white-space: pre-wrap;">Welkom op VeiligStallen.nl.</span></p><p dir="ltr"><span style="white-space: pre-wrap;">De kortste weg naar een veilige plek voor uw fiets.</span></p>${linktext}`

    results.push(`Update ${page.Title} text for ${contactName} by ${editorName}`);

    await prisma.articles.update({
      where: { ID: page.ID },
      data: updateHomeData
    })
  }

  return results;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication and authorization
    const session = await getServerSession(req, res, authOptions);
    
    if (!session) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userName = session.user?.name || session.user?.email || 'unknown';

    // ** TEST CODE STARTS : Check & Fix a single data owner
    // const siteID = await prisma.contacts.findFirst({  
    //   where: {
    //     CompanyName: 'Aalsmeer',
    //   }
    // })
    // let results: string[] = [];
    // if(!siteID) {
    //   return res.status(400).json({ success: false, error: 'No siteID found' });
    // }
    // results = await checkAndFixStandardPages(siteID?.ID, userName);
    // ** TEST CODE ENDS

    const results = await checkAndFixStandardPages(undefined, userName);
    const result = {
      success: true,
      message: 'Check completed successfully',
      data: {
        timestamp: new Date().toISOString(),
        results: results,
      }
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in articles check:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}
