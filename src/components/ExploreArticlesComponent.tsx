import { useEffect, useState } from "react";
import { type VSArticle } from "~/types/articles";
import { type VSContactGemeenteInLijst } from "~/types/contacts";
import { useSelector } from 'react-redux';
import type { RootState } from '~/store/rootReducer';

import { 
    getArticlesForMunicipality,
    getPrimary,
    getSecondary,
    getFooter,
    filterNavItems,
} from "~/utils/navigation";
import ArticlesComponent from '~/components/ArticleComponent';
import { hasContent } from "~/utils/articles";
import Modal from './Modal';
import ArticleFilters, { ArticleFiltersState } from '~/components/common/ArticleFilters';

interface ExploreMenuComponent {
    gemeenten: VSContactGemeenteInLijst[];
}

const ExploreArticlesComponent = (props: ExploreMenuComponent) => {   

    const { gemeenten } = props;
    const [filters, setFilters] = useState<ArticleFiltersState>({
        gemeenteId: '1',
        status: 'Yes',
        navigation: 'All',
        content: 'All',
    });

    const [ selectedZoom, setSelectedZoom] = useState<"gemeente"|"fietsberaad">("gemeente");

    const [municipalityArticles, setMunicipalityArticles] = useState<VSArticle[]|undefined>([]);
    const [fietsberaadArticles, setFietsberaadArticles] = useState<VSArticle[]|undefined>([]);

    const [selectedArticleID, setSelectedArticleID] = useState<string>("");

    const activeMunicipalityInfo = useSelector((state: RootState) => state.map.activeMunicipalityInfo);
    const [gemeenteReadOnly, setGemeenteReadOnly] = useState(false);

    useEffect(() => {
        void (async () => {
            const articles = await getArticlesForMunicipality(filters.gemeenteId==="" ? null : filters.gemeenteId);
            setMunicipalityArticles(articles);
        })();
    }, [filters.gemeenteId, selectedZoom]);

    useEffect(() => {
        void (async () => {
            const articles = await getArticlesForMunicipality("1");
            setFietsberaadArticles(articles);
        })();
    }, []);

    useEffect(() => {
        setSelectedArticleID("");
    }, [municipalityArticles, fietsberaadArticles, filters.gemeenteId, selectedZoom, filters.status, filters.navigation]);

    useEffect(() => {
        if (activeMunicipalityInfo?.ID && activeMunicipalityInfo.ID !== '1') {
            setFilters(f => ({ ...f, gemeenteId: activeMunicipalityInfo.ID }));
            setGemeenteReadOnly(true);
        } else {
            setGemeenteReadOnly(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeMunicipalityInfo?.ID]);

    const resetFilters = () => {
        setFilters({
            gemeenteId: '1',
            status: 'Yes',
            navigation: 'All',
            content: 'All',
        });
        setSelectedZoom("gemeente");
    }

    const renderMenuItems = (key: string, title: string, items: VSArticle[]) => { 
        return (
            <>
            <div className="text-xl font-bold mb-2">{title}</div>
            <ul className="list-disc list-inside pl-4">
                {items &&items.map((item, index) => {
                    return (
                        <li key={`${title}-${index}`} onClick={() => setSelectedArticleID(item.ID)}>
                            <span className="text-gray-900">{item.DisplayTitle ? item.DisplayTitle : item.Title}{item.SiteID==="1" ? ` [Fietsberaad]` : ""}</span>
                        </li>
                    );
                })}
            </ul>
        </>
        );
    }

    const renderMenus = () => {
        if (filters.gemeenteId === "") return null;

        const primaryitems = getPrimary(filterNavItems(municipalityArticles), filterNavItems(fietsberaadArticles), selectedZoom === "gemeente");
        const secondaryitems = getSecondary(filterNavItems(municipalityArticles), filterNavItems(fietsberaadArticles), selectedZoom === "gemeente");
        const footeritems = getFooter(filterNavItems(fietsberaadArticles));

        return (
            <div className="w-full h-full">
                <div className="flex items-center mb-4">
                    <label htmlFor="showGemeentenWithoutStallingen" className="text-sm font-medium text-gray-700">Selecteer Zoom: </label>
                    <select 
                        id="zoomlevel" 
                        name="zoomlevel" 
                        value={selectedZoom}
                        onChange={(e) => setSelectedZoom(e.target.value as "fietsberaad"|"gemeente")}
                        className="ml-2 p-2 border border-gray-300 rounded-md"
                    >
                        <option value="fietsberaad">{`Landelijk`}</option>
                        <option value="gemeente">{`Gemeente`}</option>
                    </select>
                </div>
                <div className="mb-2">{renderMenuItems('primary', 'Menu links', primaryitems)}</div>
                <div className="mb-2">{renderMenuItems('secondary', 'Menu rechts', secondaryitems)}</div>
                <div className="mb-2">{ renderMenuItems('footer', 'Menu onder', footeritems) }</div>
            </div>
        );
    }



    const renderSelectedArticle = () => {
        let selectedArticle = municipalityArticles?.find(x => x.ID === selectedArticleID);
        if(!selectedArticle) selectedArticle = fietsberaadArticles?.find(x => x.ID === selectedArticleID);

        return (
            <Modal 
                onClose={() => {
                    setSelectedArticleID("");
                }}
                title={selectedArticle?.DisplayTitle || selectedArticle?.Title}
                modalBodyStyle={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}
            >
                <ArticlesComponent 
                    isSm={false}
                    municipality={selectedArticle?.SiteID || ""}
                    page={selectedArticle?.Title || ""}
                    fietsenstallingen={[]}
                    onFilterChange={(_filter: string[] | undefined) => {}} 
                />
            </Modal>
        );
    }

    const renderArticlesList = () => {
        const filteredArticles = municipalityArticles?.filter(
            x => { 
                const articleHasContent = hasContent(x);
                return( (filters.status === "All" || x.Status === (filters.status === "Yes" ? "1" : "0")) &&
                        (filters.navigation === "All" || (filters.navigation === "Main" && x.Navigation === "main") || (filters.navigation === "NotMain" && x.Navigation !== "main")) &&
                        (filters.content === "All" || (articleHasContent && filters.content === "Content") || (!articleHasContent && filters.content === "NoContent"))); 
            }
        );
        // if (!filteredArticles || filteredArticles.length === 0) return { 
        // }

        const getSiteName = (siteID: string) => {
            const site = gemeenten.find(x => x.ID === siteID);
            return site?.CompanyName;
        }

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white shadow-md rounded-md w-full border border-gray-300">
                    <thead>
                        <tr className="border-b">
                            <th className="p-4 text-left">Gemeente</th>
                            <th className="p-4 text-left">Paginakop</th>
                            <th className="p-4 text-left">Paginanaam</th>
                            <th className="p-4 text-left">Inhoud</th>
                            <th className="p-4 text-left">Abstract</th>
                            <th className="p-4 text-left">Sortering</th>
                            <th className="p-4 text-left">Type</th>
                            <th className="p-4 text-left">Actief</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredArticles && filteredArticles.map((article) => (
                            <tr key={article.ID} className={`border-b ${article.ID===selectedArticleID ? "bg-gray-200" : ""}`} onClick={() => {setSelectedArticleID(article.ID);}}>
                                <td className="truncate">{getSiteName(article.SiteID)}</td>
                                <td className="whitespace-normal">{article.DisplayTitle? article.DisplayTitle : article.Title}</td>
                                <td className="whitespace-normal">{article.Title}</td>
                                <td className="text-center">{article.Article!=='' && article.Article!==null ? <input type="checkbox" checked={article.Status === "1"} readOnly /> : null}</td>
                                <td className="text-center">{article.Abstract!=='' && article.Abstract!==null ? <input type="checkbox" checked={article.Status === "1"} readOnly /> : null}</td>
                                <td className="truncate">{article.SortOrder}</td>
                                <td className="truncate">{article.Navigation}</td>
                                <td className="text-center">
                                    <input type="checkbox" checked={article.Status === "1"} readOnly />
                                </td>
                            </tr>
                        ))}
                        { !filteredArticles || filteredArticles.length === 0 && <tr className="border-b"><td colSpan={8} className="py-8 text-center">Geen artikelen gevonden</td></tr> }
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="w-full mx-gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 mb-4">
                <div className="mx-4 p-4 border-2 rounded-xl border-gray-300">
                    <ArticleFilters
                        gemeenten={gemeenten}
                        filters={filters}
                        onChange={setFilters}
                        gemeenteReadOnly={gemeenteReadOnly}
                    />
                </div>
                <div className="mx-4 p-4 border-2 rounded-xl border-gray-300">
                    { renderMenus() }                    
                </div>
            </div>
            {selectedArticleID && renderSelectedArticle()}
            <div>
                {renderArticlesList()}
            </div>
        </div>
    );
}

export default ExploreArticlesComponent;

