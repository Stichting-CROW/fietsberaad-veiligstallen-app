"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useAllUsers } from "~/hooks/useAllUsers";
import { useUsersColdfusion } from "~/hooks/useUsersColdfusion";
import { useGemeentenInLijst } from "~/hooks/useGemeenten";
import { useExploitanten } from "~/hooks/useExploitanten";
import { getNewRoleLabel, getOldRoleLabel, userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import type { VSUserWithRoles } from "~/types/users-coldfusion";
import type { VSUserWithRolesNew } from "~/types/users";

type ArchivedMap = Record<string, boolean>;

type Row = {
	id: string;
	name: string;
	email: string;
	organizationType: string;
	organizationName: string;
	coldfusionRole: string;
	exploitantMainOrSub: string;
	newRole: string;
	lastLogin: string;
	status: string;
	archived: string;
    neverLoggedIn: boolean;
};

const formatDate = (value: Date | string | null | undefined): string => {
	if (!value) return "";
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
};

const getOrganizationTypeLabel = (
	ownOrganizationID: string | undefined,
	gemeenten: { ID: string }[],
	exploitanten: { ID: string }[]
): string => {
	if (!ownOrganizationID) return "";
	if (ownOrganizationID === "1") return "Fietsberaad";
	if (gemeenten.some(g => g.ID === ownOrganizationID)) return "Gemeente";
	if (exploitanten.some(e => e.ID === ownOrganizationID)) return "Exploitant";
	return "";
};

const getOrganizationName = (
	ownOrganizationID: string | undefined,
	gemeenten: { ID: string; CompanyName?: string | null }[],
	exploitanten: { ID: string; CompanyName?: string | null }[]
): string => {
	if (!ownOrganizationID) return "";
	if (ownOrganizationID === "1") return "Fietsberaad";
	const g = gemeenten.find(x => x.ID === ownOrganizationID);
	if (g) return g.CompanyName || "";
	const e = exploitanten.find(x => x.ID === ownOrganizationID);
	if (e) return e.CompanyName || "";
	return "";
};

const normalize = (s: string): string => s
	.toLowerCase()
	.normalize("NFD")
	.replace(/[\u0300-\u036f]/g, "") // remove diacritics
	.replace(/['’`]/g, "")
	.replace(/&/g, "en")
	.replace(/[^a-z0-9]+/g, " ")
	.trim();

const emailMatchesOrganization = (email: string, organizationName: string): boolean => {
	if (!email || !organizationName) return false;
	const domain = email.split("@")[1] || "";
	if (!domain) return false;
	const labels = domain.toLowerCase().split(".").filter(Boolean);
	if (labels.length === 0) return false;
	const sld = (labels.length >= 2 ? labels[labels.length - 2] : labels[0]) || "";
	const domainCore = normalize(sld).replace(/\s+/g, "");

	const stopwords = new Set(["gemeente","aan","den","de","der","van","het","en","voor","op","bij","ter","te","aanhet","aanh",
		"s","’s","'s"]);
	const tokens = normalize(organizationName).split(/\s+/).filter(t => t && !stopwords.has(t));
	if (tokens.length === 0) return false;
	const orgSlug = tokens.join("");

	if (domainCore.includes(orgSlug) || orgSlug.includes(domainCore)) return true;
	const allTokensInDomain = tokens.every(t => domainCore.includes(t));
	if (allTokensInDomain) return true;

	// simple synonyms
	const synonyms: Record<string, string> = {
		"sgravenhage": "denhaag",
		"denhaag": "denhaag",
	};
	const orgSyn = synonyms[orgSlug];
	if (orgSyn && domainCore.includes(orgSyn)) return true;

	return false;
};

const isCrowInternal = (email: string): boolean => {
    if (!email) return false;
    const domain = (email.split("@")[1] || "").toLowerCase();
    return domain === "crow.nl";
};

const UserOverviewContent = () => {
	const { users: newUsers, isLoading: loadingNew, error: errorNew } = useAllUsers();
	const { users: cfUsers, isLoading: loadingCF, error: errorCF } = useUsersColdfusion();
	const { gemeenten, isLoading: loadingGemeenten } = useGemeentenInLijst();
	const { exploitanten, isLoading: loadingExploitanten } = useExploitanten(undefined);

	const [archivedMap, setArchivedMap] = useState<ArchivedMap>({});

	useEffect(() => {
		const fetchArchived = async () => {
			try {
				const res = await fetch("/api/protected/archive/user/list");
				if (!res.ok) return;
				const data = await res.json() as { archivedUserIds: string[] };
				const map: ArchivedMap = {};
				(data.archivedUserIds || []).forEach(id => { map[id] = true; });
				setArchivedMap(map);
			} catch (e) {
				// ignore
			}
		};
		fetchArchived();
	}, []);

	const cfById = useMemo(() => {
		const map: Record<string, VSUserWithRoles> = {};
		cfUsers.forEach(u => { map[u.UserID] = u; });
		return map;
	}, [cfUsers]);

	const rows: Row[] = useMemo(() => {
		return newUsers.map((u: VSUserWithRolesNew) => {
			const cf = cfById[u.UserID];
			const orgType = getOrganizationTypeLabel(u.ownOrganizationID, gemeenten, exploitanten);
			const orgName = getOrganizationName(u.ownOrganizationID, gemeenten, exploitanten);
			let cfRoleLabel = "";
			if (cf) {
				if (cf.security_roles?.Role) cfRoleLabel = cf.security_roles.Role;
				else if (typeof cf.RoleID === "number") cfRoleLabel = getOldRoleLabel(cf.RoleID as any);
			}
			const isExploitant = cf?.GroupID === "exploitant";
			const exploitantMainOrSub = isExploitant ? (cf?.ParentID ? "Sub" : "Main") : "";
			return {
				id: u.UserID,
				name: u.DisplayName || "",
				email: u.UserName || "",
				organizationType: orgType,
				organizationName: orgName,
				coldfusionRole: cfRoleLabel || "",
				exploitantMainOrSub,
				newRole: getNewRoleLabel(u.securityProfile.roleId),
				lastLogin: formatDate(u.LastLogin),
				status: u.Status || "",
				archived: archivedMap[u.UserID] ? "Yes" : "No",
                neverLoggedIn: !u.LastLogin,
			};
		});
	}, [newUsers, cfById, gemeenten, exploitanten, archivedMap]);

	const rowsByType = useMemo((): { gemeente: Row[]; exploitant: Row[]; fietsberaad: Row[] } => {
		const compare = (a: string, b: string) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
		const sortRows = (list: Row[]): Row[] =>
			[...list].sort((a, b) => {
				// 0 = active (not archived/disabled, has logged in)
				// 1 = never logged in (but not archived/disabled)
				// 2 = archived or disabled
				const isInactive = (r: Row) => r.status === "0" || r.archived === "Yes";
				const group = (r: Row) => (isInactive(r) ? 2 : (r.neverLoggedIn ? 1 : 0));
				const ga = group(a);
				const gb = group(b);
				if (ga !== gb) return ga - gb;
				const c1 = compare(a.organizationName, b.organizationName);
				if (c1 !== 0) return c1;
				const c2 = compare(a.name, b.name);
				if (c2 !== 0) return c2;
				return compare(a.email, b.email);
			});

		const gemeente = sortRows(rows.filter(r => r.organizationType === "Gemeente"));
		const exploitant = sortRows(rows.filter(r => r.organizationType === "Exploitant"));
		const fietsberaad = sortRows(rows.filter(r => r.organizationType === "Fietsberaad"));
		return { gemeente, exploitant, fietsberaad };
	}, [rows]);

	const Table = ({ data, showExploitantColumn = true }: { data: Row[]; showExploitantColumn?: boolean }) => (
		<table className="min-w-full border-collapse">
			<thead>
				<tr className="text-left border-b">
					<th className="py-2 pr-4">Naam</th>
					<th className="py-2 pr-4">Email</th>
					<th className="py-2 pr-4">Organisatie naam</th>
					<th className="py-2 pr-4">Rol (Oud/Nieuw)</th>
					{showExploitantColumn && <th className="py-2 pr-4">Exploitant hoofd/sub</th>}
					<th className="py-2 pr-4">Laatste inlog</th>
					<th className="py-2 pr-4">Status</th>
				</tr>
			</thead>
				<tbody>
				{data.map((r: Row) => (
					<tr
						key={r.id}
					className={
						"border-b align-top " +
						((r.status === "0" || r.archived === "Yes")
							? "line-through text-gray-500 bg-gray-100"
							: r.neverLoggedIn
								? "bg-gray-50"
								: "")
					}
					>
						<td className="py-1 pr-4 whitespace-nowrap">{r.name}</td>
						<td className="py-1 pr-4 whitespace-nowrap">{r.email}</td>
						<td className="py-1 pr-4 whitespace-nowrap">{r.organizationName}</td>
						<td className="py-1 pr-4 whitespace-nowrap">{r.coldfusionRole}/{r.newRole}</td>
						{showExploitantColumn && (
							<td className="py-1 pr-4 whitespace-nowrap">{r.exploitantMainOrSub}</td>
						)}
						<td className="py-1 pr-4 whitespace-nowrap">{r.lastLogin}</td>
						<td className="py-1 pr-4 whitespace-nowrap">{r.archived === "Yes" ? "gearchiveerd" : (r.status === "0" ? "niet actief" : "actief")}</td>
					</tr>
				))}
			</tbody>
		</table>
	);

	if (loadingNew || loadingCF || loadingGemeenten || loadingExploitanten) {
		return <div className="p-6">Laden…</div>;
	}
	if (errorNew || errorCF) {
		return <div className="p-6 text-red-600">Fout bij laden van gegevens</div>;
	}

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-4">Gebruikersoverzicht</h1>
			<div className="space-y-8">
				<div className="overflow-x-auto">
					<h2 className="text-xl font-semibold mb-2">Data-eigenaren (Gemeente) - interne gebruikers</h2>
					<Table data={rowsByType.gemeente.filter(r => emailMatchesOrganization(r.email, r.organizationName))} showExploitantColumn={false} />
				</div>
				<div className="overflow-x-auto">
					<h2 className="text-xl font-semibold mb-2">Data-eigenaren (Gemeente) - externe gebruikers</h2>
					<Table data={rowsByType.gemeente.filter(r => !emailMatchesOrganization(r.email, r.organizationName))} showExploitantColumn={false} />
				</div>
				<div className="overflow-x-auto">
					<h2 className="text-xl font-semibold mb-2">Exploitant</h2>
					<Table data={rowsByType.exploitant} />
				</div>
				<div className="overflow-x-auto">
					<h2 className="text-xl font-semibold mb-2">Fietsberaad - interne gebruikers</h2>
					<Table data={rowsByType.fietsberaad.filter(r => isCrowInternal(r.email))} showExploitantColumn={false} />
				</div>
				<div className="overflow-x-auto">
					<h2 className="text-xl font-semibold mb-2">Fietsberaad - externe gebruikers</h2>
					<Table data={rowsByType.fietsberaad.filter(r => !isCrowInternal(r.email))} showExploitantColumn={false} />
				</div>
			</div>
		</div>
	);
};

const UserOverviewPage = () => {
	const { data: session, status } = useSession();
	if (status === "loading") return <div className="p-6">Laden…</div>;
	const allowed = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
	if (!allowed) return <div className="p-6 text-red-600">Deze pagina is alleen beschikbaar voor de Fietsberaad beheerder</div>;
	return <UserOverviewContent />;
}

export default UserOverviewPage;


