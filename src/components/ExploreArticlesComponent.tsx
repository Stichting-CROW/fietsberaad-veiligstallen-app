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
import { Table } from '~/components/common/Table';

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
    const [sortColumn, setSortColumn] = useState<string>("Gemeente");
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

    const handleSort = (header: string) => {
        if (sortColumn === header) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(header);
            setSortDirection('asc');
        }
    };

    const getSortedData = (articles: VSArticle[]) => {
        const sorted = [...articles].sort((a, b) => {
            let aValue: string | number = '';
            let bValue: string | number = '';

            switch (sortColumn) {
                case 'Gemeente':
                    const aSite = gemeenten.find(x => x.ID === a.SiteID);
                    const bSite = gemeenten.find(x => x.ID === b.SiteID);
                    aValue = aSite?.CompanyName || '';
                    bValue = bSite?.CompanyName || '';
                    break;
                case 'Paginakop':
                    aValue = a.DisplayTitle || a.Title || '';
                    bValue = b.DisplayTitle || b.Title || '';
                    break;
                case 'Paginanaam':
                    aValue = a.Title || '';
                    bValue = b.Title || '';
                    break;
                case 'Sortering':
                    aValue = a.SortOrder || 0;
                    bValue = b.SortOrder || 0;
                    break;
                case 'Type':
                    aValue = a.Navigation || '';
                    bValue = b.Navigation || '';
                    break;
                case 'Actief':
                    aValue = a.Status === "1" ? 1 : 0;
                    bValue = b.Status === "1" ? 1 : 0;
                    break;
                default:
                    aValue = a.Title || '';
                    bValue = b.Title || '';
            }

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc' 
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else {
                return sortDirection === 'asc' 
                    ? (aValue as number) - (bValue as number)
                    : (bValue as number) - (aValue as number);
            }
        });

        return sorted;
    };

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
                <Table
                    columns={[
                        {
                            header: 'Gemeente',
                            accessor: (article: VSArticle) => {
                                const site = gemeenten.find(x => x.ID === article.SiteID);
                                return site?.CompanyName || '';
                            }
                        },
                        {
                            header: 'Paginakop',
                            accessor: (article: VSArticle) => article.DisplayTitle || article.Title || ''
                        },
                        {
                            header: 'Paginanaam',
                            accessor: 'Title'
                        },
                        {
                            header: 'Inhoud',
                            accessor: (article: VSArticle) => article.Article !== '' && article.Article !== null ? 
                                <input type="checkbox" checked={article.Status === "1"} readOnly /> : null
                        },
                        {
                            header: 'Abstract',
                            accessor: (article: VSArticle) => article.Abstract !== '' && article.Abstract !== null ? 
                                <input type="checkbox" checked={article.Status === "1"} readOnly /> : null
                        },
                        {
                            header: 'Sortering',
                            accessor: 'SortOrder'
                        },
                        {
                            header: 'Type',
                            accessor: 'Navigation'
                        },
                        {
                            header: 'Actief',
                            accessor: (article: VSArticle) => 
                                <input type="checkbox" checked={article.Status === "1"} readOnly />
                        }
                    ]}
                    data={getSortedData(filteredArticles || [])}
                    className="min-w-full bg-white shadow-md rounded-md w-full border border-gray-300"
                    sortableColumns={["Gemeente", "Paginakop", "Paginanaam", "Sortering", "Type", "Actief"]}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onRowClick={(article) => setSelectedArticleID(article.ID)}
                />
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

