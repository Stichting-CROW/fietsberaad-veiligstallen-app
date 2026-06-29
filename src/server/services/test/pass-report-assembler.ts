import { prisma } from "~/server/db";
import type {
  TagReportAccountInfo,
  TagReportFinancialRecord,
  TagReportPasidInfo,
  TagReportStallingRecord,
} from "~/pages/api/protected/test/tag-report";
import type { PasidSelectRow, StallingSourceRow } from "~/server/services/test/pass-report-shared";

function stallingsIdFromSectionExternalId(sectionId: string): string | null {
  const match = sectionId.match(/^(.+)_\d+$/);
  return match?.[1] ?? null;
}

type StallingLookupRow = {
  ID: string;
  Title: string | null;
  StallingsID: string | null;
  Plaats: string | null;
  SiteID: string | null;
  ExploitantID: string | null;
};

type SectionLookupRow = {
  titel: string;
  omschrijving: string | null;
  fietsenstalling: StallingLookupRow | null;
};

type AccountRow = {
  ID: string;
  FirstName: string | null;
  MiddleName: string | null;
  LastName: string | null;
  Email: string | null;
  Phone?: string | null;
  Mobile?: string | null;
  Address?: string | null;
  Address_Nr?: string | null;
  Zip?: string | null;
  City?: string | null;
  saldo?: { toNumber?: () => number } | number | null;
  Status?: string | null;
  DateRegistration?: Date | null;
  LastLogin?: Date | null;
  account_type?: string | null;
  dateLastSaldoUpdate?: Date | null;
};

function formatAccountName(account: {
  FirstName: string | null;
  MiddleName: string | null;
  LastName: string | null;
}): string | null {
  const parts = [account.FirstName, account.MiddleName, account.LastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatAddressLine(account: AccountRow): string | null {
  const street = [account.Address, account.Address_Nr].filter(Boolean).join(" ");
  return street || null;
}

function accountSaldo(account: AccountRow): number | null {
  if (account.saldo == null) return null;
  return typeof account.saldo === "number" ? account.saldo : Number(account.saldo);
}

function decimalToNumber(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

type PasidLookup = {
  Naam: string | null;
  Pastype: string;
  AccountID: string | null;
};

type LookupMaps = {
  sectionByExternalId: Map<string, SectionLookupRow>;
  bikeTypeById: Map<number, string | null>;
  clientTypeById: Map<number, string | null>;
  contactById: Map<string, string | null>;
  placeById: Map<bigint, string | null>;
  stallingById: Map<string, StallingLookupRow>;
  stallingByStallingsID: Map<string, StallingLookupRow>;
  subscriptionTypeById: Map<number, string | null>;
  accountById: Map<string, AccountRow>;
  pasidByPasIdAndSite: Map<string, PasidLookup>;
  pasidByPasId: Map<string, PasidLookup>;
};

export async function assemblePassReport(
  tagPasids: PasidSelectRow[],
  records: StallingSourceRow[]
): Promise<{
  accountInfo: TagReportAccountInfo[];
  stallingTransacties: TagReportStallingRecord[];
  financialTransacties: TagReportFinancialRecord[];
}> {
  const tagAccountIds = [
    ...new Set(tagPasids.map((r) => r.AccountID).filter((id): id is string => !!id)),
  ];

  const bikepassIds = tagPasids.map((r) => r.ID);
  const stallingTxIds = records.map((r) => r.ID);

  const subscriptionIds =
    bikepassIds.length > 0
      ? (
          await prisma.abonnementen.findMany({
            where: { bikepassID: { in: bikepassIds } },
            select: { ID: true },
          })
        ).map((s) => s.ID)
      : [];

  const financialOrConditions: Array<Record<string, unknown>> = [];
  if (tagAccountIds.length > 0) {
    financialOrConditions.push({ accountID: { in: tagAccountIds } });
  }
  if (stallingTxIds.length > 0) {
    financialOrConditions.push({ transactionID: { in: stallingTxIds } });
  }
  if (subscriptionIds.length > 0) {
    financialOrConditions.push({ subscriptionID: { in: subscriptionIds } });
  }

  const financialRecords =
    financialOrConditions.length > 0
      ? await prisma.financialtransactions.findMany({
          where: { OR: financialOrConditions },
          orderBy: { transactionDate: "desc" },
        })
      : [];

  const stallingIds = [...new Set(records.map((r) => r.FietsenstallingID))];
  const sectionExternalIds = [
    ...new Set(
      [
        ...records.flatMap((r) => [r.SectieID, r.SectieID_uit]),
        ...financialRecords.map((r) => r.sectionID),
        ...tagPasids.map((r) => r.huidigeSectieId),
      ].filter((id): id is string => !!id)
    ),
  ];
  const transactionPasIds = [...new Set(records.map((r) => r.PasID))];
  const placeIds = [
    ...new Set(
      [
        ...records.map((r) => r.PlaceID),
        ...financialRecords.map((r) => r.placeID),
      ].filter((id): id is bigint => id != null)
    ),
  ];
  const contactIds: string[] = [
    ...records.map((r) => r.ExploitantID).filter((id): id is string => !!id),
    ...financialRecords.flatMap((r) =>
      [r.siteID, r.paidToSiteID, r.paidBySiteID, r.sourceSiteID, r.targetSiteID].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const bikeparkStallingsIds = [
    ...new Set([
      ...financialRecords.map((r) => r.bikeparkID).filter((id): id is string => !!id),
      ...tagPasids.map((r) => r.huidigeFietsenstallingId).filter((id): id is string => !!id),
      ...records.map((r) => r.FietsenstallingID),
      ...sectionExternalIds
        .map((id) => stallingsIdFromSectionExternalId(id))
        .filter((id): id is string => !!id),
    ]),
  ];
  const subscriptionTypeIds = [
    ...new Set(
      financialRecords.map((r) => r.subscriptiontypeID).filter((id): id is number => id != null)
    ),
  ];

  const stallingsById =
    stallingIds.length > 0
      ? await prisma.fietsenstallingen.findMany({
          where: { ID: { in: stallingIds } },
          select: {
            ID: true,
            Title: true,
            StallingsID: true,
            Plaats: true,
            SiteID: true,
            ExploitantID: true,
          },
        })
      : [];

  const stallingsByStallingsID =
    bikeparkStallingsIds.length > 0
      ? await prisma.fietsenstallingen.findMany({
          where: { StallingsID: { in: bikeparkStallingsIds } },
          select: {
            ID: true,
            Title: true,
            StallingsID: true,
            Plaats: true,
            SiteID: true,
            ExploitantID: true,
          },
        })
      : [];

  const allStallings = [...stallingsById, ...stallingsByStallingsID];
  const stallingById = new Map(allStallings.map((s) => [s.ID, s]));
  const stallingByStallingsID = new Map(
    allStallings.filter((s) => s.StallingsID).map((s) => [s.StallingsID!, s])
  );

  for (const s of allStallings) {
    if (s.SiteID) contactIds.push(s.SiteID);
    if (s.ExploitantID) contactIds.push(s.ExploitantID);
  }
  for (const p of tagPasids) {
    if (p.SiteID) contactIds.push(p.SiteID);
  }
  const uniqueContactIds = [...new Set(contactIds)];

  const accountIds = [
    ...new Set([
      ...tagAccountIds,
      ...financialRecords.map((r) => r.accountID).filter((id): id is string => !!id),
    ]),
  ];

  const [
    sections,
    extraPasidDetails,
    bikeTypes,
    clientTypes,
    contacts,
    places,
    subscriptionTypes,
    accounts,
  ] = await Promise.all([
    sectionExternalIds.length > 0
      ? prisma.fietsenstalling_sectie.findMany({
          where: { externalId: { in: sectionExternalIds } },
          select: {
            externalId: true,
            titel: true,
            omschrijving: true,
            fietsenstalling: {
              select: {
                ID: true,
                Title: true,
                StallingsID: true,
                Plaats: true,
                SiteID: true,
                ExploitantID: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    transactionPasIds.length > 0
      ? prisma.accounts_pasids.findMany({
          where: { PasID: { in: transactionPasIds } },
          select: {
            PasID: true,
            SiteID: true,
            Naam: true,
            Pastype: true,
            AccountID: true,
          },
        })
      : Promise.resolve([]),
    prisma.fietstypen.findMany({ select: { ID: true, Name: true, naamenkelvoud: true } }),
    prisma.klanttypen.findMany({ select: { ID: true, Name: true } }),
    uniqueContactIds.length > 0
      ? prisma.contacts.findMany({
          where: { ID: { in: uniqueContactIds } },
          select: { ID: true, CompanyName: true },
        })
      : Promise.resolve([]),
    placeIds.length > 0
      ? prisma.fietsenstalling_plek.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, titel: true },
        })
      : Promise.resolve([]),
    subscriptionTypeIds.length > 0
      ? prisma.abonnementsvormen.findMany({
          where: { ID: { in: subscriptionTypeIds } },
          select: { ID: true, naam: true },
        })
      : Promise.resolve([]),
    accountIds.length > 0
      ? prisma.accounts.findMany({
          where: { ID: { in: accountIds } },
          select: {
            ID: true,
            FirstName: true,
            MiddleName: true,
            LastName: true,
            Email: true,
            Phone: true,
            Mobile: true,
            Address: true,
            Address_Nr: true,
            Zip: true,
            City: true,
            saldo: true,
            Status: true,
            DateRegistration: true,
            LastLogin: true,
            account_type: true,
            dateLastSaldoUpdate: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const pasidByPasIdAndSite = new Map<string, PasidLookup>();
  const pasidByPasId = new Map<string, PasidLookup>();
  for (const p of [...tagPasids, ...extraPasidDetails]) {
    const entry: PasidLookup = {
      Naam: p.Naam,
      Pastype: p.Pastype,
      AccountID: p.AccountID,
    };
    if (p.SiteID) {
      pasidByPasIdAndSite.set(`${p.PasID}::${p.SiteID}`, entry);
    }
    if (!pasidByPasId.has(p.PasID)) {
      pasidByPasId.set(p.PasID, entry);
    }
  }

  for (const section of sections) {
    if (section.fietsenstalling) {
      const st = section.fietsenstalling;
      stallingById.set(st.ID, st);
      if (st.StallingsID) stallingByStallingsID.set(st.StallingsID, st);
    }
  }

  const contactById = new Map(contacts.map((c) => [c.ID, c.CompanyName]));
  const sectionSiteIds = sections
    .map((s) => s.fietsenstalling?.SiteID)
    .filter((id): id is string => !!id && !contactById.has(id));
  if (sectionSiteIds.length > 0) {
    const extraContacts = await prisma.contacts.findMany({
      where: { ID: { in: sectionSiteIds } },
      select: { ID: true, CompanyName: true },
    });
    for (const c of extraContacts) contactById.set(c.ID, c.CompanyName);
  }

  const lookups: LookupMaps = {
    sectionByExternalId: new Map(
      sections.filter((s) => s.externalId).map((s) => [s.externalId!, s])
    ),
    bikeTypeById: new Map(bikeTypes.map((t) => [t.ID, t.Name ?? t.naamenkelvoud])),
    clientTypeById: new Map(clientTypes.map((t) => [t.ID, t.Name])),
    contactById,
    placeById: new Map(places.map((p) => [p.id, p.titel])),
    stallingById,
    stallingByStallingsID,
    subscriptionTypeById: new Map(subscriptionTypes.map((t) => [t.ID, t.naam])),
    accountById: new Map(accounts.map((a) => [a.ID, a])),
    pasidByPasIdAndSite,
    pasidByPasId,
  };

  function resolvePasid(pasId: string, siteId: string | null | undefined): PasidLookup | undefined {
    if (siteId) {
      const keyed = lookups.pasidByPasIdAndSite.get(`${pasId}::${siteId}`);
      if (keyed) return keyed;
    }
    return lookups.pasidByPasId.get(pasId);
  }

  function resolveAccount(accountId: string | null | undefined) {
    if (!accountId) return undefined;
    return lookups.accountById.get(accountId);
  }

  function resolveStallingForTransactie(
    fietsenstallingID: string,
    sectieID: string | null | undefined
  ): StallingLookupRow | undefined {
    const byId = lookups.stallingById.get(fietsenstallingID);
    if (byId) return byId;

    const byStallingsId = lookups.stallingByStallingsID.get(fietsenstallingID);
    if (byStallingsId) return byStallingsId;

    if (sectieID) {
      const sectie = lookups.sectionByExternalId.get(sectieID);
      if (sectie?.fietsenstalling) return sectie.fietsenstalling;
      const stallingsId = stallingsIdFromSectionExternalId(sectieID);
      if (stallingsId) {
        return lookups.stallingByStallingsID.get(stallingsId);
      }
    }

    return undefined;
  }

  const stallingTransacties: TagReportStallingRecord[] = records.map((r) => {
    const stalling = resolveStallingForTransactie(r.FietsenstallingID, r.SectieID);
    const siteId = stalling?.SiteID ?? null;
    const sectieIn = r.SectieID ? lookups.sectionByExternalId.get(r.SectieID) : undefined;
    const sectieUit = r.SectieID_uit ? lookups.sectionByExternalId.get(r.SectieID_uit) : undefined;
    const pasid = resolvePasid(r.PasID, siteId);
    const account = pasid?.AccountID ? resolveAccount(pasid.AccountID) : undefined;
    const exploitantId = r.ExploitantID ?? stalling?.ExploitantID ?? null;

    return {
      ID: r.ID,
      Date_checkin: r.Date_checkin.toISOString(),
      Date_checkout: r.Date_checkout?.toISOString() ?? null,
      Stallingsduur: r.Stallingsduur,
      dateCreated: r.dateCreated.toISOString(),
      FietsenstallingID: r.FietsenstallingID,
      StallingTitle: stalling?.Title ?? null,
      StallingsID: stalling?.StallingsID ?? null,
      StallingPlaats: stalling?.Plaats ?? null,
      GemeenteName: siteId ? lookups.contactById.get(siteId) ?? null : null,
      SiteID: siteId,
      SectieID: r.SectieID,
      SectieName: sectieIn?.titel ?? null,
      SectieDescription: sectieIn?.omschrijving ?? null,
      SectieID_uit: r.SectieID_uit,
      SectieName_uit: sectieUit?.titel ?? null,
      SectieDescription_uit: sectieUit?.omschrijving ?? null,
      PlaceID: r.PlaceID != null ? Number(r.PlaceID) : null,
      PlaceTitle: r.PlaceID != null ? lookups.placeById.get(r.PlaceID) ?? null : null,
      ExternalPlaceID: r.ExternalPlaceID,
      PasID: r.PasID,
      PasNaam: pasid?.Naam ?? null,
      Pastype: pasid?.Pastype ?? (r.Pastype != null ? String(r.Pastype) : null),
      AccountName: account ? formatAccountName(account) : null,
      AccountEmail: account?.Email ?? null,
      BarcodeFiets_in: r.BarcodeFiets_in,
      BarcodeFiets_uit: r.BarcodeFiets_uit,
      BikeTypeID: r.BikeTypeID,
      BikeTypeName: lookups.bikeTypeById.get(r.BikeTypeID) ?? null,
      ClientTypeID: r.ClientTypeID,
      ClientTypeName: lookups.clientTypeById.get(r.ClientTypeID) ?? null,
      Type_checkin: r.Type_checkin,
      Type_checkout: r.Type_checkout,
      Stallingskosten: decimalToNumber(r.Stallingskosten),
      ExploitantID: exploitantId,
      ExploitantName: exploitantId ? lookups.contactById.get(exploitantId) ?? null : null,
    };
  });

  function buildPasidInfo(p: PasidSelectRow): TagReportPasidInfo {
    const currentStalling = p.huidigeFietsenstallingId
      ? lookups.stallingByStallingsID.get(p.huidigeFietsenstallingId)
      : undefined;
    const currentSection = p.huidigeSectieId
      ? lookups.sectionByExternalId.get(p.huidigeSectieId)
      : undefined;

    return {
      pasidRecordId: p.ID,
      pasID: p.PasID,
      naam: p.Naam,
      pastype: p.Pastype,
      barcodeFiets: p.barcodeFiets,
      RFID: p.RFID,
      RFIDBike: p.RFIDBike,
      siteID: p.SiteID,
      siteName: p.SiteID ? lookups.contactById.get(p.SiteID) ?? null : null,
      bikeTypeID: p.BikeTypeID,
      bikeTypeName:
        p.BikeTypeID != null ? lookups.bikeTypeById.get(p.BikeTypeID) ?? null : null,
      huidigeStallingskosten:
        p.huidigeStallingskosten != null ? Number(p.huidigeStallingskosten) : null,
      dateLastCheck: p.dateLastCheck?.toISOString() ?? null,
      dateCreated: p.dateCreated?.toISOString() ?? null,
      currentlyParkedStallingTitle: currentStalling?.Title ?? null,
      currentlyParkedStallingsID: p.huidigeFietsenstallingId,
      currentlyParkedSectionName: currentSection?.titel ?? null,
      currentlyParkedSectionID: p.huidigeSectieId,
    };
  }

  const pasidsByAccount = new Map<string | null, TagReportPasidInfo[]>();
  for (const p of tagPasids) {
    const key = p.AccountID ?? null;
    if (!pasidsByAccount.has(key)) pasidsByAccount.set(key, []);
    pasidsByAccount.get(key)!.push(buildPasidInfo(p));
  }

  const accountInfo: TagReportAccountInfo[] = Array.from(pasidsByAccount.entries()).map(
    ([accountID, pasids]) => {
      const account = accountID ? lookups.accountById.get(accountID) : undefined;
      return {
        accountID,
        name: account ? formatAccountName(account) : null,
        email: account?.Email ?? null,
        phone: account?.Phone ?? null,
        mobile: account?.Mobile ?? null,
        addressLine: account ? formatAddressLine(account) : null,
        zip: account?.Zip ?? null,
        city: account?.City ?? null,
        saldo: account ? accountSaldo(account) : null,
        dateLastSaldoUpdate: account?.dateLastSaldoUpdate?.toISOString() ?? null,
        dateRegistration: account?.DateRegistration?.toISOString() ?? null,
        lastLogin: account?.LastLogin?.toISOString() ?? null,
        status: account?.Status ?? null,
        accountType: account?.account_type ?? null,
        pasids,
      };
    }
  );

  const financialTransacties: TagReportFinancialRecord[] = financialRecords.map((r) => {
    const account = resolveAccount(r.accountID);
    const stalling = r.bikeparkID ? lookups.stallingByStallingsID.get(r.bikeparkID) : undefined;
    const sectie = r.sectionID ? lookups.sectionByExternalId.get(r.sectionID) : undefined;

    return {
      ID: r.ID,
      transactionDate: r.transactionDate?.toISOString() ?? null,
      depositDate: r.depositDate?.toISOString() ?? null,
      dateCreated: r.dateCreated.toISOString(),
      amount: r.amount != null ? Number(r.amount) : null,
      btw: r.btw != null ? Number(r.btw) : null,
      btwPercentage: r.btwPercentage ?? null,
      transactiekosten: r.transactiekosten != null ? Number(r.transactiekosten) : null,
      paymentMethod: r.paymentMethod,
      status: r.status,
      description: r.description,
      code: r.code,
      mollieTransactionID: r.mollieTransactionID,
      accountID: r.accountID,
      AccountName: account ? formatAccountName(account) : null,
      AccountEmail: account?.Email ?? null,
      siteID: r.siteID,
      SiteName: r.siteID ? lookups.contactById.get(r.siteID) ?? null : null,
      paidToSiteID: r.paidToSiteID,
      PaidToSiteName: r.paidToSiteID ? lookups.contactById.get(r.paidToSiteID) ?? null : null,
      paidBySiteID: r.paidBySiteID,
      PaidBySiteName: r.paidBySiteID ? lookups.contactById.get(r.paidBySiteID) ?? null : null,
      sourceSiteID: r.sourceSiteID,
      SourceSiteName: r.sourceSiteID ? lookups.contactById.get(r.sourceSiteID) ?? null : null,
      targetSiteID: r.targetSiteID,
      TargetSiteName: r.targetSiteID ? lookups.contactById.get(r.targetSiteID) ?? null : null,
      bikeparkID: r.bikeparkID,
      StallingTitle: stalling?.Title ?? null,
      StallingsID: stalling?.StallingsID ?? r.bikeparkID,
      sectionID: r.sectionID,
      SectieName: sectie?.titel ?? null,
      placeID: r.placeID != null ? Number(r.placeID) : null,
      PlaceTitle: r.placeID != null ? lookups.placeById.get(r.placeID) ?? null : null,
      transactionID: r.transactionID,
      subscriptiontypeID: r.subscriptiontypeID,
      SubscriptionTypeName:
        r.subscriptiontypeID != null
          ? lookups.subscriptionTypeById.get(r.subscriptiontypeID) ?? null
          : null,
      subscriptionID: r.subscriptionID,
      reservationID: r.reservationID,
    };
  });

  return { accountInfo, stallingTransacties, financialTransacties };
}
