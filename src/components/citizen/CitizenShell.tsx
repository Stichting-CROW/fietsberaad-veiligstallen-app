import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { type AppState } from "~/store/store";
import {
  setActiveMunicipalityInfo,
  setInitialLatLng,
  setInitialViewAnimate,
  setInitialZoom,
} from "~/store/mapSlice";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { getMunicipalityBasedOnUrlName } from "~/utils/municipality";
import { convertCoordinatenToCoords } from "~/utils/map/index";
import { filterNavItems, getArticlesForMunicipality, getPrimary } from "~/utils/navigation";
import { clientLogoFallback } from "~/utils/library-url";

type PublicItem = { title: string; href: string };
type MenuFlags = { fms: boolean; topup: boolean; abonnement: boolean; bikeparkTypes: string[]; hasBikeparks: boolean };
export type CitizenTheme = {
  id: string | null;
  name: string;
  urlName: string;
  themeColor1: string;
  themeColor2: string;
  logo: string | null;
  menu: MenuFlags;
};

type Account = { loggedIn: boolean; saldo: number | null };
type PageArticle = { title: string; displayTitle: string; abstract: string; article: string };

const OWNER_STORAGE_KEY = "vs_citizen_site";
const DEFAULT_LOGO = clientLogoFallback();
const DEFAULT_MENU: MenuFlags = { fms: false, topup: false, abonnement: false, bikeparkTypes: [], hasBikeparks: false };
const DEFAULT_THEME: CitizenTheme = { id: null, name: "", urlName: "", themeColor1: "1f99d2", themeColor2: "96c11f", logo: null, menu: DEFAULT_MENU };
const TYPE_BOUND_NAV: Record<string, string> = { buurtstallingen: "buurtstalling", fietstrommels: "fietstrommel", fietskluizen: "fietskluizen" };

// Every account page mounts its own shell; these survive client-side navigation so the menu and theme don't flash.
const themeCache = new Map<string, CitizenTheme>();
let lastTheme: CitizenTheme | null = null;
let accountCache: Account | null = null;
const navCache = new Map<string, PublicItem[]>();
const articleCache = new Map<string, PageArticle | null>();

let storedOwner: string | null | undefined;
const ownerListeners = new Set<(owner: string | null) => void>();

function readOwner(): string | null {
  if (storedOwner === undefined) storedOwner = window.localStorage.getItem(OWNER_STORAGE_KEY) || null;
  return storedOwner;
}

function writeOwner(owner: string | null) {
  if (owner === readOwner()) return;
  storedOwner = owner;
  if (owner) window.localStorage.setItem(OWNER_STORAGE_KEY, owner);
  else window.localStorage.removeItem(OWNER_STORAGE_KEY);
  ownerListeners.forEach((listener) => listener(owner));
}

/** The gemeente the citizen chose (or arrived with); `undefined` until read from storage. */
export function useCitizenOwner(): string | null | undefined {
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setOwner(readOwner());
    ownerListeners.add(setOwner);
    return () => {
      ownerListeners.delete(setOwner);
    };
  }, []);
  return owner;
}

/** Makes a gemeente the current data-owner and moves the (hidden) map to it. */
export function useSetCitizenOwner() {
  const dispatch = useDispatch();
  return useCallback(async (owner: { id: string; urlName: string }) => {
    writeOwner(owner.id);
    if (!owner.urlName) return;
    const info = await getMunicipalityBasedOnUrlName(owner.urlName);
    if (!info) return;
    dispatch(setActiveMunicipalityInfo(info));
    dispatch(setInitialViewAnimate(false));
    const coords = convertCoordinatenToCoords(info.Coordinaten);
    if (coords) dispatch(setInitialLatLng(coords));
    dispatch(setInitialZoom(info.Zoom || 13));
  }, [dispatch]);
}

export const buttonClass = "inline-block cursor-pointer rounded bg-[var(--vs-theme1)] px-4 py-2.5 text-center font-semibold tracking-wide text-white no-underline hover:bg-[var(--vs-theme2)]";
export const inputClass = "w-full rounded border border-gray-300 px-2 py-1";

export function CitizenShell({
  title,
  siteId,
  page,
  pageText = true,
  pageFooter,
  children,
}: {
  title: string;
  siteId?: string | null;
  /** Title of the CF article (`url.page`) whose DisplayTitle, Abstract and Article head this page. */
  page?: string;
  pageText?: boolean;
  pageFooter?: ReactNode;
  children: ReactNode;
}) {
  const theme = useCitizenTheme(siteId);
  const article = usePageArticle(page, theme);
  const ready = Boolean(theme) && (!page || article !== undefined);
  const style = {
    "--vs-theme1": `#${theme?.themeColor1 ?? "1f99d2"}`,
    "--vs-theme2": `#${theme?.themeColor2 ?? "96c11f"}`,
  } as CSSProperties;
  const heading = <h1 className="mb-4 text-2xl font-semibold text-[var(--vs-theme1)]">{article?.displayTitle || title}</h1>;
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#1c2b33]" style={style}>
      <CitizenHeader theme={theme} />
      <div className={`mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 pt-24 md:flex-row ${ready ? "" : "invisible"}`}>
        <CitizenMenu theme={theme} />
        <main className="min-w-0 flex-1">
          {page ? (
            <div className="mb-4 space-y-2 bg-white p-4 [&_a]:text-[var(--vs-theme1)] [&_a]:underline">
              {heading}
              {pageText && article?.abstract && (
                <p><strong dangerouslySetInnerHTML={{ __html: article.abstract }} /></p>
              )}
              {pageText && article?.article && <div dangerouslySetInnerHTML={{ __html: article.article }} />}
              {pageFooter}
            </div>
          ) : heading}
          {children}
        </main>
      </div>
    </div>
  );
}

async function fetchArticle(site: string, page: string): Promise<PageArticle | null> {
  const key = `${site}|${page}`;
  if (articleCache.has(key)) return articleCache.get(key) ?? null;
  try {
    const response = await fetch(`/api/account/page?title=${encodeURIComponent(page)}&siteId=${encodeURIComponent(site)}`);
    const data = response.ok ? await response.json() as { page: PageArticle | null } : { page: null };
    articleCache.set(key, data.page);
    return data.page;
  } catch {
    return null;
  }
}

function usePageArticle(page: string | undefined, theme: CitizenTheme | null): PageArticle | null | undefined {
  const site = theme ? theme.id ?? "1" : null;
  const key = page && site ? `${site}|${page}` : "";
  const [article, setArticle] = useState<PageArticle | null | undefined>(() => (key ? articleCache.get(key) : undefined));

  useEffect(() => {
    if (!page || !site) return;
    if (articleCache.has(key)) {
      setArticle(articleCache.get(key));
      return;
    }
    setArticle(undefined);
    let cancelled = false;
    void fetchArticle(site, page).then((data) => {
      if (!cancelled) setArticle(data);
    });
    return () => {
      cancelled = true;
    };
  }, [page, site, key]);

  return article;
}

function useCitizenTheme(explicitSiteId?: string | null): CitizenTheme | null {
  const router = useRouter();
  const owner = useCitizenOwner();
  const activeMunicipalityId = useSelector((state: AppState) => state.map.activeMunicipalityInfo?.ID);
  const querySiteId = typeof router.query.siteId === "string" ? router.query.siteId : "";
  const [theme, setTheme] = useState<CitizenTheme | null>(() => lastTheme);

  useEffect(() => {
    if (!router.isReady || owner === undefined) return;
    const known = explicitSiteId || querySiteId;
    if (known) writeOwner(known);
    const siteId = known || owner || (activeMunicipalityId !== "1" ? activeMunicipalityId : "") || "";
    const apply = (next: CitizenTheme) => {
      lastTheme = next;
      setTheme(next);
    };
    const cached = themeCache.get(siteId);
    if (cached) {
      apply(cached);
      return;
    }
    let cancelled = false;
    void fetch(`/api/account/theme${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`)
      .then((response) => response.ok ? response.json() as Promise<CitizenTheme> : null)
      .then((data) => {
        if (cancelled || !data) return;
        themeCache.set(siteId, data);
        apply(data);
      })
      .catch(() => {
        if (!cancelled) apply(lastTheme ?? DEFAULT_THEME);
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, explicitSiteId, querySiteId, owner, activeMunicipalityId]);

  return theme;
}

function CitizenHeader({ theme }: { theme: CitizenTheme | null }) {
  const logo = theme?.logo;
  return (
    <div className="fixed z-10 flex h-16 w-full items-center bg-white px-5 py-3">
      <Link href={theme?.urlName ? `/${theme.urlName}` : "/"} className="flex h-full flex-col justify-center" aria-label="Ga naar startpagina">
        {theme && (
          <img
            key={logo ?? DEFAULT_LOGO}
            src={logo ?? DEFAULT_LOGO}
            alt={logo ? `Logo ${theme.name}` : "Logo"}
            width={64}
            height={64}
            className="max-h-full w-auto bg-white"
            onError={(event) => {
              if (event.currentTarget.src !== DEFAULT_LOGO) event.currentTarget.src = DEFAULT_LOGO;
            }}
          />
        )}
      </Link>
    </div>
  );
}

// The main navigation of site_wrapper.cfm: Home is shown as "Kaart", type pages only when the gemeente has such stallingen.
async function loadPublicItems(theme: CitizenTheme): Promise<PublicItem[]> {
  const key = theme.id ?? "1";
  const cached = navCache.get(key);
  if (cached) return cached;
  const [own, fietsberaad] = await Promise.all([
    theme.id ? getArticlesForMunicipality(theme.id) : Promise.resolve([]),
    getArticlesForMunicipality("1"),
  ]);
  const base = theme.urlName || "fietsberaad";
  const items = getPrimary(filterNavItems(own), filterNavItems(fietsberaad), Boolean(theme.id))
    .filter((item) => {
      const name = (item.Title ?? "").toLowerCase().replace(/ /g, "_");
      if (name === "stallingen") return theme.menu.hasBikeparks;
      const type = TYPE_BOUND_NAV[name];
      if (type) return theme.menu.bikeparkTypes.includes(type);
      return true;
    })
    .map((item) => item.Title === "Home"
      ? { title: "Kaart", href: theme.urlName ? `/${theme.urlName}` : "/" }
      : { title: item.DisplayTitle || item.Title || "", href: `/${base}/${item.Title ?? ""}` });
  navCache.set(key, items);
  return items;
}

function CitizenMenu({ theme }: { theme: CitizenTheme | null }) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(() => accountCache);
  const site = theme ? theme.id ?? "1" : null;
  const [publicItems, setPublicItems] = useState<PublicItem[] | undefined>(() => navCache.get(site ?? ""));
  const [textLeft, setTextLeft] = useState<PageArticle | null | undefined>(() => articleCache.get(`${site}|Tekst_links`));
  const path = router.asPath.split("?")[0] ?? "";

  const parkingId = typeof router.query.parkingId === "string" ? router.query.parkingId : "";
  const type = typeof router.query.type === "string" ? router.query.type : "";
  const abonnementQuery = new URLSearchParams();
  if (theme?.id) abonnementQuery.set("siteId", theme.id);
  if (parkingId) abonnementQuery.set("parkingId", parkingId);
  if (type) abonnementQuery.set("type", type);
  const abonnementHref = `/account/abonnement?${abonnementQuery.toString()}`;
  const ownerHref = `/account/gemeente?next=${encodeURIComponent(router.asPath)}`;

  function updateAccount(next: Account) {
    accountCache = next;
    setAccount(next);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next: Account = { loggedIn: false, saldo: null };
      try {
        const response = await fetch("/api/account/profile");
        if (response.ok) {
          const data = await response.json();
          const amount = Number(data.saldo);
          next = { loggedIn: true, saldo: Number.isFinite(amount) ? amount : null };
        }
      } catch {
        next = { loggedIn: false, saldo: null };
      }
      if (!cancelled) updateAccount(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [router.asPath]);

  useEffect(() => {
    if (!theme || !site || !account || account.loggedIn) return;
    let cancelled = false;
    void Promise.all([loadPublicItems(theme), fetchArticle(site, "Tekst_links")]).then(([items, text]) => {
      if (cancelled) return;
      setPublicItems(items);
      setTextLeft(text);
    });
    return () => {
      cancelled = true;
    };
  }, [theme, site, account]);

  async function logout() {
    await fetch("/api/account/session", { method: "DELETE" });
    updateAccount({ loggedIn: false, saldo: null });
    await router.push("/account/login");
  }

  if (!account || !theme || (!account.loggedIn && (publicItems === undefined || textLeft === undefined))) {
    return (
      <nav aria-label="Accountmenu" aria-busy="true" className="w-full shrink-0 md:w-72">
        <LoadingSpinner message="" size={28} />
      </nav>
    );
  }

  const { loggedIn, saldo } = account;
  const flags = theme.menu;
  const owned = Boolean(theme.id);
  const ownerItem = (
    <li>
      <MenuLink href={ownerHref} active={path === "/account/gemeente"}>
        {owned ? "Wijzig gemeente" : "Kies gemeente"}
      </MenuLink>
      {owned && <p className="px-4 pt-1 text-xs text-gray-600">Gemeente: {theme.name}</p>}
    </li>
  );
  const abonnementItem = owned && flags.abonnement && (
    <li><MenuLink href={abonnementHref} active={path.startsWith("/account/abonnement")}>Koop abonnement</MenuLink></li>
  );

  return (
    <nav aria-label="Accountmenu" className="w-full shrink-0 md:w-72">
      {!loggedIn && textLeft?.article && (
        <div className="mb-3 bg-white p-4 text-sm [&_a]:text-[var(--vs-theme1)] [&_a]:underline" dangerouslySetInnerHTML={{ __html: textLeft.article }} />
      )}
      <ul className="space-y-1">
        {loggedIn ? (
          <>
            <li><MenuLink href="/account" active={path === "/account"}>Mijn gegevens</MenuLink></li>
            {flags.fms && (
              <li>
                <MenuLink href="/account">
                  <span className="flex items-center justify-between gap-3">
                    <span>Mijn stallingstegoed</span>
                    {saldo !== null && (
                      <span className={saldo < 0 ? "text-red-200" : "text-lime-200"}>€ {saldo.toFixed(2)}</span>
                    )}
                  </span>
                </MenuLink>
              </li>
            )}
            {owned && flags.topup && (
              <li><MenuLink href="/account/tegoed" active={path.startsWith("/account/tegoed")}>Stallingstegoed opwaarderen</MenuLink></li>
            )}
            {ownerItem}
            {abonnementItem}
            <li><MenuLink onClick={() => void logout()}>Uitloggen</MenuLink></li>
          </>
        ) : (
          <>
            {(publicItems ?? []).map((item) => (
              <li key={item.href}>
                <MenuLink href={item.href}>{item.title}</MenuLink>
              </li>
            ))}
            {ownerItem}
            {abonnementItem}
            <li><MenuLink href="/account/login" active={path === "/account/login"}>Inloggen</MenuLink></li>
            <li><MenuLink href="/account/registreren" active={path === "/account/registreren"}>Registreren</MenuLink></li>
          </>
        )}
      </ul>
      <p className="mt-4 px-4 text-xs">
        <Link className="underline" href="/login">Inlog voor gemeenten</Link>
      </p>
    </nav>
  );
}

export function MenuLink({
  href,
  active = false,
  onClick,
  children,
}: {
  href?: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = `block w-full px-4 py-3 text-left text-sm font-semibold tracking-wide text-white no-underline ${active ? "bg-[var(--vs-theme2)]" : "bg-[var(--vs-theme1)] hover:bg-[var(--vs-theme2)]"}`;
  if (onClick) {
    return <button type="button" className={className} onClick={onClick}>{children}</button>;
  }
  return <Link href={href || "/account"} className={className}>{children}</Link>;
}

export function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="mb-3 bg-white shadow-sm" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between bg-[var(--vs-theme1)] px-4 py-3 font-semibold tracking-wide text-white hover:bg-[var(--vs-theme2)] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span aria-hidden="true" className="text-lg leading-none">▾</span>
      </summary>
      <div className="space-y-3 p-4">{children}</div>
    </details>
  );
}

export function IdealButton({ fee, onClick }: { fee: number; onClick: () => void }) {
  return (
    <button className={buttonClass} type="button" onClick={onClick}>
      iDeal
      <br />
      <span className="text-xs font-normal">&nbsp;transactiekosten: € {fee.toFixed(2)}</span>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
