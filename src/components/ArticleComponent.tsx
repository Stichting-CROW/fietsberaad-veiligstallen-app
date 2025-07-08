import React, { useState, useEffect } from "react";
import { type VSArticle } from "~/types/articles";

import Faq from "~/components/Faq";
import PageTitle from "~/components/PageTitle";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

interface ArticleComponentProps {
  municipality: string;
  page: string;
}

const ArticleComponent = ({municipality, page}: ArticleComponentProps): React.ReactNode => {
  const [pageContent, setPageContent] = useState<VSArticle | undefined | false>(undefined);

  // Get article content based on slug
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(
          `/api/protected/?Title=${page}&SiteID=${municipality}&findFirst=true`
        );
        const json = await response.json();
        if (!json) { 
          setPageContent(false);
          return;
        }
        // If result is an array with 1 node: Get node only
        const pageContentToSet: VSArticle = json && json.SiteID ? json : json[0];
        setPageContent(pageContentToSet);
      } catch (err) {
        setPageContent(false);
        console.error(err);
      }
    })();
  }, [
    municipality,
    page,
  ]);

  if (pageContent === undefined) {
    return <LoadingSpinner />;
  }

  if (pageContent === false) {
    return (
      <div className="p-10">
        Geen pagina-inhoud gevonden. <a href="javascript:history.back();" className="underline">Ga terug</a>
      </div>);
  }

  const isFaq = pageContent.Title === 'FAQ';

  // Decide on what parkings to show on this page, if any
  let parkingTypesToFilterOn: string[] | undefined;
  if (pageContent && pageContent.Title === 'Stallingen') {
    parkingTypesToFilterOn = ['bewaakt', 'geautomatiseerd', 'onbewaakt', 'toezicht'];
  }
  else if (pageContent && pageContent.Title === 'Buurtstallingen') {
    parkingTypesToFilterOn = ['buurtstalling'];
  }
  else if (pageContent && (pageContent.Title === 'Fietstrommels' || pageContent.Title === 'fietstrommels')) {
    parkingTypesToFilterOn = ['fietstrommel'];
  }
  else if (pageContent && pageContent.Title === 'Fietskluizen') {
    parkingTypesToFilterOn = ['fietskluizen'];
  } else {
    parkingTypesToFilterOn = ['bewaakt', 'geautomatiseerd', 'onbewaakt', 'toezicht'];
  }

  const renderArticle = () => {
    return (
      <div className="w-full bg-white border-2 border-black rounded-lg p-2 sm:p-4">
        <div className="flex-1 lg:mr-24">
          {(pageContent.DisplayTitle || pageContent.Title) && 
            <PageTitle>
              {pageContent.DisplayTitle ? pageContent.DisplayTitle : pageContent.Title}
            </PageTitle> }
          { pageContent.Abstract && <div className="text-lg my-4" dangerouslySetInnerHTML={{ __html: pageContent.Abstract }}/> }
          { pageContent.Article && <div className="my-4 mt-12" dangerouslySetInnerHTML={{ __html: pageContent.Article }}/> }
          { isFaq && <Faq />}
        </div>
      </div>)
  }

  return renderArticle();
};

export default ArticleComponent;
