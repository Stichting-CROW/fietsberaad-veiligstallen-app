import { type VSArticle } from "~/types/articles";

export const getArticlesForMunicipality = async (siteId: string | null): Promise<VSArticle[]> => {
  try {
    const url = siteId ? `/api/protected/articles/?compact=false&SiteID=${siteId}` : "/api/protected/articles/";
    const response = await fetch(url);
    const json = await response.json();
    return json.data as VSArticle[];
  } catch (err) {
    console.error(err);
    return [];
  }
}

export const filterNavItems = (items: VSArticle[]|undefined) => {
  if (!items) return [];

  const hasContent = (x: VSArticle) => (x.Abstract!=='' && x.Abstract!==null) || (x.Article!=='' && x.Article!==null)
  return items.filter(x => x.ModuleID === 'veiligstallen' && x.Status === '1' && hasContent(x)) // && x.ShowInNav === '1' 
}

export const getPrimary = (itemsMunicipality: VSArticle[]|undefined, itemsFietsberaad: VSArticle[]|undefined, showGemeenteMenu: boolean): VSArticle[] => {
  const filterPrimaryItems = (items: VSArticle[]) => {
    return items.filter(x => x.Navigation === 'main')
    .filter((x) => {
      const excludeTitles = ['Tips', 'Contact', 'FAQ'];
      const noContent = (x.Article||'') === '' && (x.Abstract||'') === '';

      return !excludeTitles.includes((x.Title || "")) && !noContent;
    })
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  }

  let items = showGemeenteMenu && itemsMunicipality ? filterPrimaryItems(itemsMunicipality) : [];
  if(items.length === 0 && itemsFietsberaad) {
    items = filterPrimaryItems(itemsFietsberaad);
  }
  // console.debug("#### primary items", items);
  return items;
}

export const getSecondary = (itemsMunicipality: VSArticle[]|undefined, itemsfietsberaad: VSArticle[]|undefined, showGemeenteMenu: boolean): VSArticle[] => {
  const secundaryItems = [];

  // Tips always comes from fietsberaad site
  const tips = itemsfietsberaad && itemsfietsberaad?.find(x => x.Title === 'Tips');
  if (tips) {
    const showTip = tips.Status === '1' &&
     ((tips.Abstract||"")!=='' || (tips.Article||"")!==''); 

    if (showTip) {  
      secundaryItems.push(tips);
    }
  }

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