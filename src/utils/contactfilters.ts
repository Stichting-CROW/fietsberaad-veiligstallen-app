import type { VSUserWithRolesNew } from "~/types/users";

export const getRelatedUsersForGemeente = (allUsers: VSUserWithRolesNew[], gemeenteID: string | null) => {
    if(gemeenteID===null) {
        return [];
    }

    return allUsers.filter((user) => { 
        return (
            user.sites.some((site) => {
                const isLinkedUser = site.SiteID === gemeenteID
                // const isSysteemGebruiker = user.GroupID === "intern" && site.SiteID === "0"    
                return ( isLinkedUser ) // 
            })
        )
    })
}