import type { WizardStep } from "~/components/buurtstallingen/PublicFlow";

export type WizardNav = {
  step: (
    step: WizardStep,
    params?: { fiets?: number | string; rek?: string; soort?: string; tot?: string; plaats?: string },
  ) => string;
  start: () => string;
  mijnStalling: () => string;
};

export function accountWizardNav(siteId: string, parkingId: string): WizardNav {
  function step(
    wizard: WizardStep,
    params?: { fiets?: number | string; rek?: string; soort?: string; tot?: string; plaats?: string },
  ) {
    const search = new URLSearchParams({ siteId, parkingId, wizard });
    if (params?.fiets !== undefined) search.set("fiets", String(params.fiets));
    if (params?.rek) search.set("rek", params.rek);
    if (params?.soort) search.set("soort", params.soort);
    if (params?.tot) search.set("tot", params.tot);
    if (params?.plaats) search.set("plaats", params.plaats);
    return `/account/abonnement?${search.toString()}`;
  }
  return {
    step,
    start: () => step("fiets"),
    mijnStalling: () => "/account",
  };
}

export function publicWizardNav(base: string, urlName: string | null | undefined): WizardNav {
  function step(
    wizard: WizardStep,
    params?: { fiets?: number | string; rek?: string; soort?: string; tot?: string; plaats?: string },
  ) {
    const path = wizard === "fiets" ? base : `${base}/${wizard}`;
    const search = new URLSearchParams();
    if (params?.fiets !== undefined) search.set("fiets", String(params.fiets));
    if (params?.rek) search.set("rek", params.rek);
    if (params?.soort) search.set("soort", params.soort);
    if (params?.tot) search.set("tot", params.tot);
    if (params?.plaats) search.set("plaats", params.plaats);
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
  }
  return {
    step,
    start: () => base,
    mijnStalling: () => `/${urlName ?? "fietsberaad"}/mijn-stalling`,
  };
}
