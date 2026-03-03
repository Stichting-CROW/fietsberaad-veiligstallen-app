import { type VSArticle } from "~/types/articles";
import { hasContent } from "~/utils/articles";

// In-memory cache for articles by municipality (siteId) - makes menu load instant on repeat opens
const articlesCache = new Map<string, VSArticle[]>();
const inflightRequests = new Map<string, Promise<VSArticle[]>>();

export const getArticlesForMunicipality = async (siteId: string | null): Promise<VSArticle[]> => {
  const cacheKey = siteId ?? "default";
  
  // Return cached result immediately if available
  const cached = articlesCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  // Coalesce concurrent requests for the same siteId
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
    try {
      const url = siteId ? `/api/protected/articles/?compact=false&SiteID=${siteId}` : "/api/protected/articles/";
      const response = await fetch(url);
      const json = await response.json();
      const data = (json.data ?? []) as VSArticle[];
      articlesCache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.error(err);
      inflightRequests.delete(cacheKey);
      return [];
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
};

/** Preload articles for the given siteIds to warm the cache before user opens the menu */
export const prefetchNavArticles = (municipalitySiteId: string | undefined, fietsberaadSiteId = "1"): void => {
  const muniKey = municipalitySiteId ?? "1";
  if (!articlesCache.has(muniKey)) {
    getArticlesForMunicipality(muniKey).catch(() => {});
  }
  if (!articlesCache.has(fietsberaadSiteId)) {
    getArticlesForMunicipality(fietsberaadSiteId).catch(() => {});
  }
}

export const filterNavItems = (items: VSArticle[]|undefined) => {
  if (!items) return [];
  
  return items.filter(x => x.ModuleID === 'veiligstallen' && x.Status === '1' && hasContent(x)) // && x.ShowInNav === '1' 
}

export const getPrimary = (itemsMunicipality: VSArticle[]|undefined, itemsFietsberaad: VSArticle[]|undefined, showGemeenteMenu: boolean): VSArticle[] => {
  const filterPrimaryItems = (items: VSArticle[]) => {
    return items.filter(x => x.Navigation === 'main')
    .filter((x) => {
      const excludeTitles = ['Contact', 'FAQ'];
      return !excludeTitles.includes((x.Title || "")) && hasContent(x);
    })
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  }

  // console.debug("#### items municipality", itemsMunicipality);
  let items = showGemeenteMenu && itemsMunicipality ? filterPrimaryItems(itemsMunicipality) : [];
  if(items.length === 0 && itemsFietsberaad) {
    items = filterPrimaryItems(itemsFietsberaad);
  }
  //console.debug("#### primary items", items);
  return items;
}

export const getSecondary = (itemsMunicipality: VSArticle[]|undefined, itemsfietsberaad: VSArticle[]|undefined, showGemeenteMenu: boolean): VSArticle[] => {
  const secundaryItems = [];

  let contact = undefined;
  if(showGemeenteMenu === true && itemsMunicipality) {
    // check if a contact article exists in the municipality
    contact = itemsMunicipality?.find(x => x.Title === 'Contact');
  }
  if(!contact) { 
    // otherwise use the contact article from fietsberaad
    contact = itemsfietsberaad?.find(x => x.Title === 'Contact'); 
  }

  if (contact) {
    const showContact = contact.Status === '1' &&
     ((contact.Abstract||"")!=='' || (contact.Article||"")!==''); 

    if (showContact) {  
      secundaryItems.push(contact);
    }
  }

  // console.debug("#### secundary items", secundaryItems);
  return secundaryItems;
}

export const getFooter = (itemsfietsberaad: VSArticle[]|undefined): VSArticle[] => {
  const footerTitles = ['Disclaimer', 'Privacy', 'Algemene_voorwaarden', 'Copyright'];

  if (itemsfietsberaad) {
    return itemsfietsberaad.filter((x) => x.SiteID === '1' && footerTitles.includes(x.Title || ""));
  } else {
    return []
  }
}