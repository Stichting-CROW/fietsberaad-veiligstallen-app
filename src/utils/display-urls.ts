export type StallingOption = {
  id: string;
  stallingsID: string | null;
  title: string;
};

export type OverzichtenPage =
  | "VrijePlekken"
  | "BezettePlekken"
  | "Langstallers"
  | "Saldotekort"
  | "Pas"
  | "Stallingen";

export type StallingsschermKind =
  | "presentaties-frame"
  | "presentaties-slide"
  | "verwijssysteem-gemeente"
  | "verwijssysteem-stalling"
  | "overzichten";

export function displayProductionHosts() {
  return {
    presentaties:
      process.env.NEXT_PUBLIC_DISPLAY_HOST_PRESENTATIES?.replace(/\/$/, "") ??
      "https://presentaties.veiligstallen.nl",
    verwijssysteem:
      process.env.NEXT_PUBLIC_DISPLAY_HOST_VERWIJSSYSTEEM?.replace(/\/$/, "") ??
      "https://verwijssysteem.veiligstallen.nl",
    overzichten:
      process.env.NEXT_PUBLIC_DISPLAY_HOST_OVERZICHTEN?.replace(/\/$/, "") ??
      "https://overzichten.veiligstallen.nl",
  };
}

function presentatieQuery(siteId: string, bikeparkId?: string) {
  const q = new URLSearchParams({ siteID: siteId });
  if (bikeparkId) q.set("bikeparkID", bikeparkId);
  return q.toString();
}

export function slide2PathForRequestHost(host: string | undefined): string {
  const h = (host ?? "").toLowerCase();
  if (h.includes("presentaties.")) return "/slide2.cfm";
  return "/display/presentaties/slide2.cfm";
}

export function buildSlide2Src(host: string | undefined, siteId: string, bikeparkId?: string): string {
  const base = slide2PathForRequestHost(host);
  const q = presentatieQuery(siteId, bikeparkId);
  return `${base}?${q}`;
}

export function buildDisplayUrls(params: {
  kind: StallingsschermKind;
  siteId: string;
  urlName: string;
  stalling?: StallingOption | null;
  overzichtPage?: OverzichtenPage;
}): { previewUrl: string; productionUrl: string } {
  const hosts = displayProductionHosts();
  const urlName = encodeURIComponent(params.urlName);
  const stallExt = params.stalling?.stallingsID
    ? encodeURIComponent(params.stalling.stallingsID)
    : null;

  switch (params.kind) {
    case "presentaties-frame": {
      const q = presentatieQuery(params.siteId, params.stalling?.id);
      return {
        previewUrl: `/display/presentaties/presentatie.cfm?${q}`,
        productionUrl: `${hosts.presentaties}/presentatie.cfm?${q}`,
      };
    }
    case "presentaties-slide": {
      const q = presentatieQuery(params.siteId, params.stalling?.id);
      return {
        previewUrl: `/display/presentaties/slide2.cfm?${q}`,
        productionUrl: `${hosts.presentaties}/slide2.cfm?${q}`,
      };
    }
    case "verwijssysteem-gemeente":
      return {
        previewUrl: `/display/verwijssysteem/${urlName}`,
        productionUrl: `${hosts.verwijssysteem}/${urlName}`,
      };
    case "verwijssysteem-stalling":
      if (!stallExt) {
        return {
          previewUrl: `/display/verwijssysteem/${urlName}`,
          productionUrl: `${hosts.verwijssysteem}/${urlName}`,
        };
      }
      return {
        previewUrl: `/display/verwijssysteem/${urlName}/${stallExt}`,
        productionUrl: `${hosts.verwijssysteem}/${urlName}/${stallExt}`,
      };
    case "overzichten": {
      const page = params.overzichtPage ?? "VrijePlekken";
      const path = stallExt ? `/${urlName}/${page}/${stallExt}` : `/${urlName}/${page}`;
      return {
        previewUrl: `/display/overzichten${path}`,
        productionUrl: `${hosts.overzichten}${path}`,
      };
    }
    default:
      return { previewUrl: "", productionUrl: "" };
  }
}
