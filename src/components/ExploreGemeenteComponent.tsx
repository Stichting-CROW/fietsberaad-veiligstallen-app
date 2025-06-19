import { useEffect, useState } from "react";
import { VSMenuTopic } from "~/types";
import type { VSContactExploitant, VSContactGemeente } from "~/types/contacts";
import type { VSUserWithRolesNew } from "~/types/users";
import Link from "next/link";
import { useFietsenstallingen } from "~/hooks/useFietsenstallingen";
import { useGemeenten } from "~/hooks/useGemeenten";
import { useUsers } from "~/hooks/useUsers";
import { useExploitanten } from "~/hooks/useExploitanten";

interface ExploreGemeenteComponentProps {}

const ExploreGemeenteComponent = (props: ExploreGemeenteComponentProps) => {   
    const { gemeenten, isLoading: gemeentenLoading, error: gemeentenError } = useGemeenten();

    const [filteredGemeenten, setFilteredGemeenten] = useState<VSContactGemeente[]>(gemeenten);
    const [selectedGemeenteID, setSelectedGemeenteID] = useState<string | null>("E1991A95-08EF-F11D-FF946CE1AA0578FB");

    const { users, isLoading: usersLoading, error: usersError } = useUsers(selectedGemeenteID ?? "");
    const { exploitanten, isLoading: exploitantenLoading, error: exploitantenError } = useExploitanten(selectedGemeenteID ?? "");


    const { fietsenstallingen, isLoading: fietsenstallingenLoading, error: fietsenstallingenError, reloadFietsenstallingen } = useFietsenstallingen(selectedGemeenteID ?? "");


    const [nameFilter, setNameFilter] = useState<string>("");
    const [showGemeentenWithoutStallingen, setShowGemeentenWithoutStallingen] = useState<"yes"|"no"|"only">("no");
    // const [showGemeentenWithoutUsers, setShowGemeentenWithoutUsers] = useState<"yes"|"no"|"only">("no");
    // const [showGemeentenWithoutExploitanten, setShowGemeentenWithoutExploitanten] = useState<"yes"|"no"|"only">("yes");

    useEffect(() => {
        const filtered = gemeenten
            .filter((gemeente) => 
                nameFilter === "" || 
                gemeente.CompanyName?.toLowerCase().includes(nameFilter.toLowerCase())
            )
            .filter((gemeente) => {
                const numNietSysteemStallingen = 
                    (fietsenstallingen?.
                    filter((stalling) => stalling.Title !== 'Systeemstalling').length) || 0;
                // const hasUsers = users.some((user) => 
                //     user.sites.some((site) => site.SiteID === gemeente.ID)
                // );
                // const hasExploitanten = gemeente.isManagedByContacts?.length || 0 > 0;

                return (
                    (numNietSysteemStallingen === 0 && showGemeentenWithoutStallingen !== "no" || 
                     numNietSysteemStallingen > 0 && showGemeentenWithoutStallingen !== "only") // &&
                    // (!hasUsers && showGemeentenWithoutUsers !== "no" || 
                    // hasUsers && showGemeentenWithoutUsers !== "only") &&
                    // (!hasExploitanten && showGemeentenWithoutExploitanten !== "no" ||
                    // hasExploitanten && showGemeentenWithoutExploitanten !== "only")
                );
            });
        setFilteredGemeenten(filtered);
    }, [nameFilter, gemeenten, showGemeentenWithoutStallingen ]); // showGemeentenWithoutUsers, showGemeentenWithoutExploitanten

    const filterNameHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setNameFilter(event.target.value);
    }

    const selectGemeenteHandler = (gemeenteID: string) => {
        setSelectedGemeenteID(gemeenteID);

        if(gemeenteID) {
            const selectedGemeente = gemeenten.find((gemeente) => gemeente.ID === gemeenteID);
            if(selectedGemeente) {
                console.log(selectedGemeente.fietsenstallingen_fietsenstallingen_SiteIDTocontacts);
            }
        }
    }

    const resetFilters = () => {
        setNameFilter("");
        setShowGemeentenWithoutStallingen("no");
        // setShowGemeentenWithoutUsers("no");
        // setShowGemeentenWithoutExploitanten("yes");
        setSelectedGemeenteID(null);
    };

    // const resetUserRoles = () => {
    //     console.log("resetUserRoles");
    // }

    // const getDubiousUserIDs = (users: VSUserWithRolesNew[]) => {  
    //     const dubiousUserIDs: {UserID: string, Reasons: string[]}[] = [];

    //     const addReason = (user: VSUserWithRolesNew, reason: string) => {
    //         const dubiousUser = dubiousUserIDs.find((user) => user.UserID === user.UserID);
    //         if(dubiousUser) {
    //             dubiousUser.Reasons.push(reason);
    //         } else {
    //             dubiousUserIDs.push({UserID: user.UserID, Reasons: [reason]});
    //         }
    //     }
    //     // add all users that have a mismatch between GroupID in security_users and GroupID in security_roles
    //     const mismatchUsers = users.filter((user) => user.GroupID !== user.security_roles?.GroupID);
    //     mismatchUsers.forEach((user) => {
    //         addReason(user, `GroupID mismatch: ${user.GroupID} !== ${user.security_roles?.GroupID}`);
    //     });


    //     return dubiousUserIDs;
    // }


    const renderFilterSection = () => {
        return (
            <div className="p-6 bg-white shadow-md rounded-md">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold">Gemeente Explorer</h1>
                    <button 
                        className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                        onClick={resetFilters}
                    >
                        Reset Filters
                    </button>
                </div>
                <form className="space-y-4">
                    <div className="flex flex-col">
                        <label htmlFor="gemeenteName" className="text-sm font-medium text-gray-700">Gemeentenaam:</label>
                        <input 
                            type="text" 
                            id="gemeenteName" 
                            name="gemeenteName" 
                            placeholder="Type om te zoeken..." 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={nameFilter}
                            onChange={filterNameHandler} 
                        />
                    </div>
                    <div className="flex items-center">
                        <label htmlFor="showGemeentenWithoutStallingen" className="text-sm font-medium text-gray-700">Toon data-eigenaren zonder stallingen:</label>
                        <select 
                            id="showGemeentenWithoutStallingen" 
                            name="showGemeentenWithoutStallingen" 
                            value={showGemeentenWithoutStallingen}
                            onChange={(e) => setShowGemeentenWithoutStallingen(e.target.value as "yes"|"no"|"only")}
                            className="ml-2 p-2 border border-gray-300 rounded-md"
                        >
                            <option value="yes">Ja</option>
                            <option value="no">Nee</option>
                            <option value="only">Only</option>
                        </select>
                    </div>
                    {/* <div className="flex items-center">
                        <label htmlFor="showGemeentenWithoutUsers" className="text-sm font-medium text-gray-700">Toon Gemeenten Zonder Gemeentegebruikers:</label>
                        <select 
                            id="showGemeentenWithoutUsers" 
                            name="showGemeentenWithoutUsers" 
                            value={showGemeentenWithoutUsers}
                            onChange={(e) => setShowGemeentenWithoutUsers(e.target.value as "yes"|"no"|"only")}
                            className="ml-2 p-2 border border-gray-300 rounded-md"
                        >
                            <option value="yes">Ja</option>
                            <option value="no">Nee</option>
                            <option value="only">Only</option>
                        </select>
                    </div>
                    <div className="flex items-center">
                        <label htmlFor="showGemeentenWithoutExploitanten" className="text-sm font-medium text-gray-700">Toon Gemeenten Zonder Exploitanten:</label>
                        <select 
                            id="showGemeentenWithoutExploitanten" 
                            name="showGemeentenWithoutExploitanten" 
                            value={showGemeentenWithoutExploitanten}
                            onChange={(e) => setShowGemeentenWithoutExploitanten(e.target.value as "yes"|"no"|"only")}
                            className="ml-2 p-2 border border-gray-300 rounded-md"
                        >
                            <option value="yes">Ja</option>
                            <option value="no">Nee</option>
                            <option value="only">Only</option>
                        </select>
                    </div> */}
                    <div>
                        <h2 className="text-xl font-semibold mt-6">Lijst van Gemeenten</h2>
                        <ul className="list-disc list-inside max-h-fit overflow-y-auto">
                            {filteredGemeenten.map((gemeente) => (
                                    <li 
                                        key={gemeente.ID} 
                                        className={`cursor-pointer p-2 ${selectedGemeenteID === gemeente.ID ? 'bg-blue-100' : ''}`} 
                                        onClick={() => selectGemeenteHandler(gemeente.ID)}
                                    >
                                    {gemeente.CompanyName}
                                </li>
                            ))}
                        </ul>
                    </div>
                </form>
            </div>
        );
    }

    const renderUserSection = (users: VSUserWithRolesNew[] | undefined, title: string) => {
        if (users === undefined || users.length === 0) return null;

        return (
            <>
            <div className="text-xl font-bold mb-4">{title}</div>
            <ul className="list-disc list-inside pl-4">
                {users.map((user) => {
                    return (
                        <li key={user.UserID}>
                            <span className="text-gray-900">{user.UserName} [{user.isOwnOrganization ? "internal" : "external"}/{user.securityProfile?.roleId}]</span>
                        </li>
                    );
                })}
            </ul>
        </>
        );
    };

    const renderGemeenteDetailsSection = () => {
        const selectedGemeente = gemeenten.find(gemeente => gemeente.ID === selectedGemeenteID);
        if (!selectedGemeente) return null;

        const myExploitants = selectedGemeente.isManagedByContacts?.map((contactinfo) => {
            return exploitanten.find((exploitant) => exploitant.ID === contactinfo.parentSiteID);
        })

        return (
            <div className="p-2 bg-white shadow-md rounded-md">
                <div className="flex justify-between items-center mb-4">
                    <div className="text-2xl font-bold">Gemeente Details</div>
                    {/* <button 
                        className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                        onClick={resetUserRoles}
                    >
                        Reset User Roles
                    </button> */}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">ID:</label>
                        <span className="text-gray-900">{selectedGemeente.ID}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Name:</label>
                        <span className="text-gray-900">{selectedGemeente.CompanyName}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Alternative Name:</label>
                        <span className="text-gray-900">{selectedGemeente.AlternativeCompanyName}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">URL Name:</label>
                        <span className="text-gray-900">{selectedGemeente.UrlName}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Zip ID:</label>
                        <span className="text-gray-900">{selectedGemeente.ZipID}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Helpdesk:</label>
                        <span className="text-gray-900">{selectedGemeente.Helpdesk}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Day Begins At:</label>
                        <span className="text-gray-900">{selectedGemeente.DayBeginsAt.toString()}</span>
                    </div>
                    
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Coordinaten:</label>
                        <span className="text-gray-900">{selectedGemeente.Coordinaten}</span>
                    </div>

                    { myExploitants && myExploitants?.length > 0 && (
                        <>
                            <div className="text-xl font-bold mb-2">Exploitants</div>
                            <ul className="list-disc list-inside pl-4">
                                {myExploitants?.map((contact, idx) => (
                                    contact ? (
                                        <li key={contact.ID}>{contact.CompanyName}</li>
                                    ) : (
                                        <li key={'no-contact' + idx}>No contact found</li>
                                    )
                                ))}
                            </ul>   
                        </>
                    )}
                    
                    {renderUserSection(users, 'Gebruikers')}

                    <div className="text-xl font-bold mb-4">Fietsenstallingen</div>
                    <ul className="list-disc list-inside">
                        {selectedGemeente
                            .fietsenstallingen_fietsenstallingen_SiteIDTocontacts?.
                            filter((stalling) => stalling.Title !== 'Systeemstalling')
                            .map((stalling) => (
                            <li key={stalling.ID}>{stalling.Title} [{stalling.Type}]</li>
                        ))}
                    </ul> 
                </div>
            </div>
        );
    }

    const loading = gemeentenLoading || fietsenstallingenLoading || usersLoading || exploitantenLoading;
    if(loading) {
        const whatIsLoading = [
            gemeentenLoading && "gemeenten",
            fietsenstallingenLoading && "fietsenstallingen",
            usersLoading && "users",
            exploitantenLoading && "exploitanten",
        ].filter(Boolean).join("+");
        return <div>Loading: {whatIsLoading}</div>;
    }

    if(gemeentenError || fietsenstallingenError) {
        return <div>Error: {gemeentenError || fietsenstallingenError}</div>;
    }

    return (
        <div className="w-3/4 mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                {renderFilterSection()}
            </div>
            <div>
                {renderGemeenteDetailsSection()}
            </div>
        </div>
    );
}

export default ExploreGemeenteComponent;