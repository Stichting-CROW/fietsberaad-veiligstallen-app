import { prisma } from "~/server/db";
import { serializeDbDateTime } from "~/utils/datetime-nl";
import { ACCOUNTS_PASIDS_SELECT, TRANSACTIES_SELECT } from "~/server/services/test/pass-report-shared";

export type AccountReportPass = {
  pasID: string;
  pastype: string;
  naam: string | null;
  barcodeFiets: string | null;
  RFID: string | null;
  gemeente: string | null;
  huidigeStalling: string | null;
};

export type AccountReportAccount = {
  ID: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  saldo: number | null;
  accountType: string | null;
  status: string | null;
  newsletter: string | null;
  dateRegistration: string | null;
  lastLogin: string | null;
  dateLastSaldoUpdate: string | null;
  gemeenten: string[];
  passes: AccountReportPass[];
};

export type AccountReportFinancial = {
  ID: string;
  transactionDate: string | null;
  amount: number | null;
  route: string;
  code: string | null;
  description: string | null;
  status: string | null;
  paymentMethod: string | null;
  transactiekosten: number | null;
  gemeente: string | null;
  stalling: string | null;
  soort: string;
  sleutelhanger: string | null;
  fietstag: string | null;
  abonnement: string | null;
  mollieTransactionID: string | null;
};

export type AccountReportStalling = {
  ID: number;
  checkin: string | null;
  checkout: string | null;
  stalling: string | null;
  soort: string;
  sectie: string | null;
  plek: string | null;
  sleutelhanger: string | null;
  pastype: string | null;
  fietstagIn: string | null;
  fietstagUit: string | null;
  kosten: number | null;
  gemeente: string | null;
};

export type AccountReport = {
  account: AccountReportAccount;
  financial: AccountReportFinancial[];
  stalling: AccountReportStalling[];
  /** Set when the report was opened from a pas / sleutelhanger. */
  matchedPasId?: string;
};

export type AccountPasMatch = {
  accountId: string;
  name: string | null;
  email: string | null;
};

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

/** How money entered or left the balance, from the ColdFusion transaction code. */
export function moneyRoute(code: string | null, description: string | null): string {
  const c = (code ?? "").trim().toLowerCase();
  const d = (description ?? "").toLowerCase();
  if (c === "betaling abonnement website") return "Kopen abonnement";
  if (c === "abonnement") return "Abonnement geboekt";
  if (c === "betaling website" || d.includes("opwaardering stallingstegoed")) return "Opwaarderen saldo";
  if (c === "betaling in stalling" || c.startsWith("saldo_")) return "Betaling in stalling";
  if (c.includes("restitutie")) return "Restitutie";
  if (c === "overboeking") return "Overboeking";
  if (c === "reservering") return "Reservering";
  if (c.startsWith("afwaardering")) return "Afwaardering";
  if (c === "stallingstransactie" || c === "stallingskosten") return "Betaalde stalling";
  if (!c) return "Overig";
  return `Overig (${code})`;
}

export function stallingSoort(type: string | null | undefined, sectionIsLocker: boolean): string {
  if (type === "fietskluizen" || sectionIsLocker) return "Fietskluis";
  if (type) return "Stalling";
  return "—";
}

/**
 * A pas row points at gemeenteaccounts.ID. That council row points at accounts.ID.
 * Some rows store accounts.ID directly; those are used when no council row exists.
 * PasID is matched exactly, including leading zeroes.
 */
export async function resolveAccountsByPas(pasId: string): Promise<AccountPasMatch[]> {
  const rows = await prisma.accounts_pasids.findMany({
    where: { PasID: pasId },
    select: { AccountID: true },
  });
  const linkIds = [...new Set(rows.map((r) => r.AccountID).filter((id): id is string => !!id))];
  if (linkIds.length === 0) return [];

  const councils = await prisma.gemeenteaccounts.findMany({
    where: { ID: { in: linkIds } },
    select: { ID: true, AccountID: true },
  });
  const councilAccount = new Map(councils.map((c) => [c.ID, c.AccountID]));
  const accountIds = [...new Set(linkIds.map((id) => councilAccount.get(id) ?? id))];

  const accounts = await prisma.accounts.findMany({
    where: { ID: { in: accountIds } },
    select: { ID: true, FirstName: true, MiddleName: true, LastName: true, Email: true },
  });
  const byId = new Map(accounts.map((a) => [a.ID, a]));

  return accountIds.flatMap((id) => {
    const account = byId.get(id);
    if (!account) return [];
    const name = [account.FirstName, account.MiddleName, account.LastName].filter(Boolean).join(" ") || null;
    return [{ accountId: account.ID, name, email: account.Email }];
  });
}

export async function loadAccountReport(accountId: string): Promise<AccountReport | null> {
  const account = await prisma.accounts.findUnique({ where: { ID: accountId } });
  if (!account) return null;

  const councils = await prisma.gemeenteaccounts.findMany({
    where: { AccountID: account.ID },
    select: { ID: true, SiteID: true },
  });
  const councilIds = councils.map((c) => c.ID);

  const passes = await prisma.accounts_pasids.findMany({
    where: {
      OR: [
        ...(councilIds.length > 0 ? [{ AccountID: { in: councilIds } }] : []),
        { AccountID: account.ID },
      ],
    },
    select: ACCOUNTS_PASIDS_SELECT,
    orderBy: { PasID: "asc" },
  });

  const pasIds = [...new Set(passes.map((p) => p.PasID).filter((id) => id.length > 0))];

  const [financialRows, stallingRows] = await Promise.all([
    prisma.financialtransactions.findMany({
      where: { accountID: account.ID },
      orderBy: [{ transactionDate: "desc" }, { dateCreated: "desc" }],
    }),
    pasIds.length > 0
      ? prisma.transacties.findMany({
          where: { PasID: { in: pasIds } },
          select: TRANSACTIES_SELECT,
          orderBy: { Date_checkin: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const linkedTxIds = [
    ...new Set(financialRows.map((r) => r.transactionID).filter((id): id is number => id != null)),
  ];
  const missingTxIds = linkedTxIds.filter((id) => !stallingRows.some((r) => r.ID === id));
  const linkedExtra =
    missingTxIds.length > 0
      ? await prisma.transacties.findMany({
          where: { ID: { in: missingTxIds } },
          select: TRANSACTIES_SELECT,
        })
      : [];
  const stallingById = new Map([...stallingRows, ...linkedExtra].map((r) => [r.ID, r]));

  const stallingsIds = [
    ...new Set(
      [
        ...financialRows.map((r) => r.bikeparkID),
        ...stallingRows.map((r) => r.FietsenstallingID),
        ...linkedExtra.map((r) => r.FietsenstallingID),
        ...passes.map((p) => p.huidigeFietsenstallingId),
      ].filter((id): id is string => !!id)
    ),
  ];
  const sectionIds = [
    ...new Set(
      [
        ...financialRows.map((r) => r.sectionID),
        ...stallingRows.flatMap((r) => [r.SectieID, r.SectieID_uit]),
        ...passes.map((p) => p.huidigeSectieId),
      ].filter((id): id is string => !!id)
    ),
  ];
  const placeIds = [
    ...new Set(
      [...financialRows.map((r) => r.placeID), ...stallingRows.map((r) => r.PlaceID)].filter(
        (id): id is bigint => id != null
      )
    ),
  ];
  const contactIds = [
    ...new Set(
      [
        ...councils.map((c) => c.SiteID),
        ...passes.map((p) => p.SiteID),
        ...financialRows.flatMap((r) => [r.siteID, r.paidToSiteID, r.sourceSiteID, r.targetSiteID]),
      ].filter((id): id is string => !!id)
    ),
  ];
  const subscriptionTypeIds = [
    ...new Set(financialRows.map((r) => r.subscriptiontypeID).filter((id): id is number => id != null)),
  ];

  const [stallingen, secties, plekken, contacts, abonnementsvormen] = await Promise.all([
    stallingsIds.length > 0
      ? prisma.fietsenstallingen.findMany({
          where: { OR: [{ StallingsID: { in: stallingsIds } }, { ID: { in: stallingsIds } }] },
          select: { ID: true, StallingsID: true, Title: true, Type: true, SiteID: true },
        })
      : Promise.resolve([]),
    sectionIds.length > 0
      ? prisma.fietsenstalling_sectie.findMany({
          where: { externalId: { in: sectionIds } },
          select: { externalId: true, titel: true, isKluis: true },
        })
      : Promise.resolve([]),
    placeIds.length > 0
      ? prisma.fietsenstalling_plek.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, titel: true },
        })
      : Promise.resolve([]),
    contactIds.length > 0
      ? prisma.contacts.findMany({
          where: { ID: { in: contactIds } },
          select: { ID: true, CompanyName: true },
        })
      : Promise.resolve([]),
    subscriptionTypeIds.length > 0
      ? prisma.abonnementsvormen.findMany({
          where: { ID: { in: subscriptionTypeIds } },
          select: { ID: true, naam: true },
        })
      : Promise.resolve([]),
  ]);

  const stallingByKey = new Map<string, (typeof stallingen)[number]>();
  for (const s of stallingen) {
    stallingByKey.set(s.ID, s);
    if (s.StallingsID) stallingByKey.set(s.StallingsID, s);
  }
  const sectieByExternal = new Map(secties.filter((s) => s.externalId).map((s) => [s.externalId!, s]));
  const plekById = new Map(plekken.map((p) => [p.id, p.titel]));
  const contactName = new Map(contacts.map((c) => [c.ID, c.CompanyName]));
  const missingSiteIds = [
    ...new Set(stallingen.map((s) => s.SiteID).filter((id): id is string => !!id && !contactName.has(id))),
  ];
  if (missingSiteIds.length > 0) {
    const extraContacts = await prisma.contacts.findMany({
      where: { ID: { in: missingSiteIds } },
      select: { ID: true, CompanyName: true },
    });
    for (const c of extraContacts) contactName.set(c.ID, c.CompanyName);
  }
  const abonnementNaam = new Map(abonnementsvormen.map((a) => [a.ID, a.naam]));
  const passByPasId = new Map(passes.map((p) => [p.PasID, p]));

  const name = [account.FirstName, account.MiddleName, account.LastName].filter(Boolean).join(" ") || null;
  const address = [account.Address, account.Address_Nr].filter(Boolean).join(" ") || null;

  const reportPasses: AccountReportPass[] = passes.map((p) => {
    const parked = p.huidigeFietsenstallingId ? stallingByKey.get(p.huidigeFietsenstallingId) : undefined;
    return {
      pasID: p.PasID,
      pastype: p.Pastype,
      naam: p.Naam,
      barcodeFiets: p.barcodeFiets,
      RFID: p.RFID,
      gemeente: p.SiteID ? contactName.get(p.SiteID) ?? null : null,
      huidigeStalling: parked?.Title ?? p.huidigeFietsenstallingId,
    };
  });

  const financial: AccountReportFinancial[] = financialRows.map((r) => {
    const linked = r.transactionID != null ? stallingById.get(r.transactionID) : undefined;
    const stallingKey = r.bikeparkID ?? linked?.FietsenstallingID ?? null;
    const stalling = stallingKey ? stallingByKey.get(stallingKey) : undefined;
    const sectie = r.sectionID ? sectieByExternal.get(r.sectionID) : undefined;
    const pass = linked ? passByPasId.get(linked.PasID) : undefined;
    const pastype = pass?.Pastype ?? null;
    const sleutelhanger = linked
      ? pastype && pastype !== "sleutelhanger"
        ? `${linked.PasID} (${pastype})`
        : linked.PasID
      : null;
    const fietstag = linked?.BarcodeFiets_in ?? linked?.BarcodeFiets_uit ?? pass?.barcodeFiets ?? null;
    const gemeenteId = r.siteID ?? stalling?.SiteID ?? null;

    return {
      ID: r.ID,
      transactionDate: serializeDbDateTime(r.transactionDate),
      amount: num(r.amount),
      route: moneyRoute(r.code, r.description),
      code: r.code,
      description: r.description,
      status: r.status,
      paymentMethod: r.paymentMethod,
      transactiekosten: num(r.transactiekosten),
      gemeente: gemeenteId ? contactName.get(gemeenteId) ?? null : null,
      stalling: stalling?.Title ?? r.bikeparkID,
      soort: stallingSoort(stalling?.Type, !!sectie?.isKluis),
      sleutelhanger,
      fietstag,
      abonnement: r.subscriptiontypeID != null ? abonnementNaam.get(r.subscriptiontypeID) ?? null : null,
      mollieTransactionID: r.mollieTransactionID,
    };
  });

  const stalling: AccountReportStalling[] = stallingRows.map((r) => {
    const park = stallingByKey.get(r.FietsenstallingID);
    const sectie = r.SectieID ? sectieByExternal.get(r.SectieID) : undefined;
    const pass = passByPasId.get(r.PasID);
    const pastype = pass?.Pastype ?? (r.Pastype != null ? String(r.Pastype) : null);
    const plek = r.PlaceID != null ? plekById.get(r.PlaceID) ?? null : null;
    return {
      ID: r.ID,
      checkin: serializeDbDateTime(r.Date_checkin),
      checkout: serializeDbDateTime(r.Date_checkout),
      stalling: park?.Title ?? r.FietsenstallingID,
      soort: stallingSoort(park?.Type, !!sectie?.isKluis),
      sectie: sectie?.titel ?? r.SectieID,
      plek: plek ?? r.ExternalPlaceID,
      sleutelhanger: r.PasID,
      pastype,
      fietstagIn: r.BarcodeFiets_in,
      fietstagUit: r.BarcodeFiets_uit,
      kosten: num(r.Stallingskosten),
      gemeente: park?.SiteID ? contactName.get(park.SiteID) ?? null : null,
    };
  });

  return {
    account: {
      ID: account.ID,
      name,
      email: account.Email,
      phone: account.Phone,
      mobile: account.Mobile,
      address,
      zip: account.Zip,
      city: account.City,
      saldo: num(account.saldo),
      accountType: account.account_type,
      status: account.Status,
      newsletter: account.Nieuwsbrief,
      dateRegistration: serializeDbDateTime(account.DateRegistration),
      lastLogin: serializeDbDateTime(account.LastLogin),
      dateLastSaldoUpdate: serializeDbDateTime(account.dateLastSaldoUpdate),
      gemeenten: councils
        .map((c) => (c.SiteID ? contactName.get(c.SiteID) ?? c.SiteID : null))
        .filter((name): name is string => !!name && name !== ""),
      passes: reportPasses,
    },
    financial,
    stalling,
  };
}
