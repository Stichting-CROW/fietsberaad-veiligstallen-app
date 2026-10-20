import type { NextApiRequest } from "next";
import { prisma } from "~/server/db";
import {
  CITIZEN_COOKIE,
  hashPassword,
  coldfusionUuid,
  newId,
  readCitizenSession,
  readCookie,
  readPasswordReset,
  signCitizenSession,
  signPasswordReset,
  verifyPassword,
} from "./auth";
import { mailOrigin, sendAccountMail, sendOpsMail } from "./mail";
import { createIdealPayment, fetchMolliePayment, ledgerStatus } from "./mollie";
import { deficitOverboekingen, OVERBOEKEN_CATCH_UP_SQL, positiveOverboekingen, runCatchUpRows, type ExploitantSaldoRow, type OverboekingBooking } from "./overboeken";

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const EXCLUDED_BIKEPARK_TYPES = new Set(["buurtstalling", "fietstrommel", "fietskluizen"]);
const VAT = 21;

export function sessionAccountId(req: NextApiRequest): string | null {
  return readCitizenSession(readCookie(req.headers.cookie, CITIZEN_COOKIE))?.accountId ?? null;
}

export async function signInAccount(email: string, password: string) {
  const account = await prisma.accounts.findFirst({ where: { Email: email.trim() } });
  if (!account || account.account_type === "DELETED") throw new AccountError("Uw e-mailadres is niet bekend");
  if (!(await verifyPassword(password, account.EncryptedPassword))) throw new AccountError("Uw wachtwoord is niet geldig");
  await prisma.accounts.update({ where: { ID: account.ID }, data: { LastLogin: new Date() } });
  return { accountId: account.ID, token: signCitizenSession(account.ID) };
}

export async function registerAccount(input: { email: string; password: string; nieuwsbrief: boolean; siteId?: string | null }) {
  const email = input.email.trim();
  if (!email.includes("@")) throw new AccountError("Uw opgegeven e-mailadres is niet geldig");
  if (input.password.length < 6) throw new AccountError("Kies een wachtwoord van minstens 6 tekens");
  const existing = await prisma.accounts.findFirst({ where: { Email: email } });
  if (existing && existing.account_type !== "DELETED") throw new AccountError("Het opgegeven e-mailadres wordt al gebruikt");
  const id = coldfusionUuid();
  await prisma.accounts.create({
    data: {
      ID: id,
      Email: email,
      EncryptedPassword: await hashPassword(input.password),
      Nieuwsbrief: input.nieuwsbrief ? "1" : "0",
      Status: "1",
      DateRegistration: new Date(),
      account_type: "USER",
    },
  });
  if (input.siteId && input.siteId !== "1") {
    const council = await prisma.contacts.findFirst({ where: { ID: input.siteId, ItemType: "organizations" }, select: { ID: true } });
    if (council) await councilAccountId(id, council.ID);
  }
  return { accountId: id, token: signCitizenSession(id) };
}

export async function requestPasswordReset(email: string, origin: string) {
  const account = await prisma.accounts.findFirst({ where: { Email: email.trim(), account_type: { not: "DELETED" } } });
  if (!account?.Email) throw new AccountError("Uw e-mailadres is niet bekend");
  await mailPasswordLink({ ...account, Email: account.Email }, origin);
}

async function mailPasswordLink(
  account: { Email: string; FirstName: string | null; MiddleName: string | null; LastName: string | null; Sex: string | null },
  origin: string,
  councilId?: string,
) {
  const token = signPasswordReset(account.Email);
  const link = `${origin}/account/wachtwoord?token=${encodeURIComponent(token)}`;
  await sendAccountMail({
    account,
    councilId,
    subject: "Logingegevens voor VeiligStallen",
    message: `<p>
<strong>U kunt een nieuw wachtwoord instellen voor <a href="${link}">www.veiligstallen.nl</a> met de volgende gegevens:</strong>
</p>
<p>
Gebruikersnaam: <strong>${escapeHtml(account.Email)}</strong><br/><br/>
Nieuw wachtwoord instellen: <strong><a href="${link}">deze link</a></strong> (2 uur geldig)</p>
<p>U kunt uw wachtwoord op Mijn Veiligstallen wijzigen. Klik hiervoor op 'Mijn inloggegevens wijzigen'.</p>`,
  });
}

export async function resetPassword(token: string, password: string) {
  const reset = readPasswordReset(token);
  if (!reset) throw new AccountError("De link is ongeldig of verlopen");
  if (password.length < 6) throw new AccountError("Kies een wachtwoord van minstens 6 tekens");
  const account = await prisma.accounts.findFirst({ where: { Email: reset.email, account_type: { not: "DELETED" } } });
  if (!account) throw new AccountError("Uw e-mailadres is niet bekend");
  await prisma.accounts.update({ where: { ID: account.ID }, data: { EncryptedPassword: await hashPassword(password) } });
}

export type ProfileInput = {
  email?: string;
  password?: string;
  nieuwsbrief?: boolean;
  sex?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  address?: string;
  addressNr?: string;
  zip?: string;
  city?: string;
  phone?: string;
  mobile?: string;
};

export async function updateProfile(accountId: string, input: ProfileInput) {
  const account = await requireUser(accountId);
  const data: Record<string, string | null> = {};
  if (input.email && input.email !== account.Email) {
    if (!input.email.includes("@")) throw new AccountError("Uw opgegeven e-mailadres is niet geldig");
    const taken = await prisma.accounts.findFirst({ where: { Email: input.email, NOT: { ID: accountId } } });
    if (taken) throw new AccountError("Het opgegeven e-mailadres wordt al gebruikt door een deelnemer");
    data.Email = input.email;
  }
  if (input.password) {
    if (input.password.length < 6) throw new AccountError("Kies een wachtwoord van minstens 6 tekens");
    data.EncryptedPassword = await hashPassword(input.password);
  }
  if (input.nieuwsbrief !== undefined) data.Nieuwsbrief = input.nieuwsbrief ? "1" : "0";
  if (input.sex !== undefined) data.Sex = input.sex;
  if (input.firstName !== undefined) data.FirstName = input.firstName;
  if (input.middleName !== undefined) data.MiddleName = input.middleName;
  if (input.lastName !== undefined) data.LastName = input.lastName;
  if (input.address !== undefined) data.Address = input.address;
  if (input.addressNr !== undefined) data.Address_Nr = input.addressNr;
  if (input.zip !== undefined) data.Zip = input.zip;
  if (input.city !== undefined) data.City = input.city;
  if (input.phone !== undefined) data.Phone = input.phone;
  if (input.mobile !== undefined) data.Mobile = input.mobile;
  await prisma.accounts.update({ where: { ID: accountId }, data });
}

export async function deleteAccount(accountId: string) {
  const account = await requireUser(accountId);
  const reasons: string[] = [];
  const saldo = await recalculateSaldo(accountId);
  if (Math.abs(saldo) > 0.001) reasons.push("Het stallingstegoed van deze account is niet 0.");
  const passes = await prisma.accounts_pasids.findMany({ where: await ownedPasses(accountId) });
  const parked = passes.filter((pass) => pass.huidigeFietsenstallingId);
  if (parked.length === 1) reasons.push("Er staat nog een fiets van deze account gestald.");
  if (parked.length > 1) reasons.push(`Er staan nog ${parked.length} fietsen van deze account gestald.`);
  const waiting = await prisma.wachtlijst_item.count({ where: { account_id: accountId } });
  if (waiting > 0) reasons.push("U staat nog op de wachtlijst voor een buurtstalling.");
  const occupations = await prisma.fietsenstalling_plek_bezetting.count({ where: { account_id: accountId } });
  if (occupations > 0) reasons.push("U heeft nog een lopend abonnement op een buurtstalling.");
  if (reasons.length) throw new AccountError(reasons.join(" "));

  for (const pass of passes) {
    const systemId = coldfusionUuid();
    await prisma.accounts.create({ data: { ID: systemId, account_type: "SYSTEM", Status: "1", DateRegistration: new Date() } });
    const owner = pass.SiteID ? await councilAccountId(systemId, pass.SiteID) : systemId;
    await prisma.accounts_pasids.update({ where: { ID: pass.ID }, data: { AccountID: owner } });
  }
  const email = account.Email;
  await prisma.accounts.update({
    where: { ID: accountId },
    data: {
      Email: coldfusionUuid(),
      EncryptedPassword: null,
      DateDeleted: new Date(),
      Nieuwsbrief: "0",
      FirstName: null,
      MiddleName: null,
      LastName: null,
      Address: null,
      Address_Nr: null,
      Zip: null,
      City: null,
      Phone: null,
      Mobile: null,
      account_type: "DELETED",
    },
  });
  if (email) {
    await sendAccountMail({
      account: { ...account, Email: email },
      subject: "Account VeiligStallen verwijderd",
      message: `<p>
Uw account op <a href="http://www.veiligstallen.nl">www.veiligstallen.nl</a> is verwijderd.
</p>`,
    });
  }
}

export async function accountHome(accountId: string) {
  const account = await requireUser(accountId);
  await refreshOpenPayments(accountId);
  const saldo = await recalculateSaldo(accountId);
  const passes = await prisma.accounts_pasids.findMany({ where: await ownedPasses(accountId), orderBy: { dateCreated: "desc" } });
  const subscriptions = await prisma.abonnementen.findMany({
    where: await ownedSubscription(accountId),
    omit: { sectionID: true },
    include: { abonnementsvormen: { select: { naam: true, bikeparkTypeID: true } } },
    orderBy: { dateCreated: "desc" },
  });
  return {
    email: account.Email,
    firstName: account.FirstName,
    middleName: account.MiddleName,
    lastName: account.LastName,
    sex: account.Sex,
    address: account.Address,
    addressNr: account.Address_Nr,
    zip: account.Zip,
    city: account.City,
    phone: account.Phone,
    mobile: account.Mobile,
    nieuwsbrief: account.Nieuwsbrief === "1",
    saldo,
    passes: passes.map((pass) => ({
      id: pass.ID,
      pasId: pass.PasID,
      type: pass.Pastype,
      name: pass.Naam,
    })),
    subscriptions: subscriptions.map((row) => ({
      id: row.ID,
      externalId: row.externalID,
      name: row.abonnementsvormen?.naam ?? "",
      siteId: row.siteID,
      type: row.abonnementsvormen?.bikeparkTypeID ?? row.type,
      active: Boolean(row.isActief),
      paid: row.isBetaald,
      start: row.ingangsdatum,
      end: row.afloopdatum,
      price: row.prijsInclBtw === null ? null : Number(row.prijsInclBtw),
    })),
  };
}

export async function parkingVisits(accountId: string, year: number, month: number) {
  await requireUser(accountId);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const passes = await prisma.accounts_pasids.findMany({
    where: await ownedPasses(accountId),
    select: { ID: true, PasID: true },
  });
  if (passes.length === 0) return [];
  const rows = await prisma.transacties.findMany({
    where: {
      Date_checkin: { gte: start, lt: end },
      OR: [{ PasID: { in: passes.map((pass) => pass.PasID) } }, { PassUUID: { in: passes.map((pass) => pass.ID) } }],
    },
    orderBy: { Date_checkin: "desc" },
  });
  const stallingIds = [...new Set(rows.map((row) => row.FietsenstallingID))];
  const stallings = stallingIds.length
    ? await prisma.fietsenstallingen.findMany({
        where: { OR: [{ ID: { in: stallingIds } }, { StallingsID: { in: stallingIds } }] },
        select: { ID: true, StallingsID: true, Title: true, Type: true },
      })
    : [];
  return rows
    .map((row) => {
      const stalling = stallings.find((item) => item.ID === row.FietsenstallingID || item.StallingsID === row.FietsenstallingID);
      return {
        checkin: row.Date_checkin,
        checkout: row.Date_checkout,
        stallingId: stalling?.ID ?? null,
        title: stalling?.Title ?? row.FietsenstallingID,
        type: stalling?.Type ?? "",
        amount: row.Stallingskosten === null ? 0 : Number(row.Stallingskosten),
      };
    })
    .filter((row) => row.type !== "fietskluizen");
}

export async function paymentList(accountId: string) {
  await requireUser(accountId);
  const rows = await prisma.financialtransactions.findMany({
    where: {
      accountID: accountId,
      status: { in: ["ok", "pending", "cancelled", "canceled", "expired", "failed"] },
      NOT: { code: "overboeking" },
    },
    orderBy: { transactionDate: "desc" },
  });
  return rows.map((row) => ({
    id: row.ID,
    date: row.transactionDate,
    description: row.description,
    code: row.code,
    amount: row.amount === null ? 0 : Number(row.amount),
    status: row.status,
  }));
}

export async function linkPass(accountId: string, input: { pasId: string; pasType: "sleutelhanger" | "ovchip"; name?: string; siteId?: string }) {
  await requireUser(accountId);
  const pasId = input.pasId.replace(/\s/g, "");
  if (!/^\d+$/.test(pasId)) throw new AccountError("Het pasnummer mag uitsluitend cijfers bevatten");
  const siteId = await passSiteId(accountId, input.siteId);
  if (input.pasType === "sleutelhanger" && pasId.length !== 12) {
    throw new AccountError("De barcode van een sleutelhanger moet uit 12 cijfers bestaan");
  }
  if (input.pasType === "ovchip" && (pasId.length !== 16 || !pasId.startsWith("3528"))) {
    throw new AccountError("Een pasnummer van een ov-chipkaart is een 16-cijferig nummer, beginnend met de cijfers 3528");
  }
  const pastype = input.pasType === "sleutelhanger" ? "sleutelhanger" : "tijdelijk";
  const storedPasId = input.pasType === "ovchip" ? temporaryPassCode() : pasId;
  const existing = await prisma.accounts_pasids.findMany({ where: { PasID: input.pasType === "ovchip" ? pasId : storedPasId } });
  if (existing.length === 0 && input.pasType === "ovchip") {
    const byName = await prisma.accounts_pasids.findMany({ where: { Naam: pasId, Pastype: "tijdelijk" } });
    existing.push(...byName);
  }
  // mypage createPass: every row of this pass (one per municipality) moves to the citizen, SYSTEM owners are taken over whole.
  const claims: Array<{ id: string; pasId: string; pastype: string; naam: string | null; siteId: string; systemId: string | null }> = [];
  for (const pass of existing) {
    const ownerId = await passTopAccountId(pass.AccountID);
    const owner = ownerId ? await prisma.accounts.findUnique({ where: { ID: ownerId } }) : null;
    if (owner && owner.ID !== accountId && owner.account_type !== "SYSTEM" && owner.account_type !== "DELETED") {
      throw new AccountError("Deze pas is al gekoppeld aan een ander account. Controleer het nummer of neem contact op via het contactformulier");
    }
    claims.push({
      id: pass.ID,
      pasId: pass.PasID,
      pastype: pass.Pastype,
      naam: pass.Naam,
      siteId: pass.SiteID || siteId,
      systemId: owner?.account_type === "SYSTEM" ? owner.ID : null,
    });
  }
  const first = claims[0];
  if (first) {
    for (const systemId of new Set(claims.map((claim) => claim.systemId).filter((id): id is string => Boolean(id)))) {
      await takeOverSystemAccount(accountId, systemId);
    }
    for (const claim of claims) {
      await prisma.accounts_pasids.update({ where: { ID: claim.id }, data: { AccountID: await councilAccountId(accountId, claim.siteId) } });
    }
    const name = input.name || (input.pasType === "ovchip" ? pasId : first.naam);
    const passes = new Map(claims.map((claim) => [`${claim.pasId}\u0000${claim.pastype}`, { PasID: claim.pasId, Pastype: claim.pastype }]));
    for (const pass of passes.values()) await setPassName(pass, name);
    return { id: first.id, temporaryCode: input.pasType === "ovchip" ? first.pasId : null };
  }
  const active = await prisma.abonnementen.findFirst({ where: { bikepassID: existing[0]?.ID, isActief: true }, select: { ID: true } });
  if (active && existing[0]) throw new AccountError("Aan deze pas is een abonnement gekoppeld.");
  const id = newId();
  await prisma.accounts_pasids.create({
    data: {
      ID: id,
      AccountID: await councilAccountId(accountId, siteId),
      SiteID: siteId,
      PasID: storedPasId,
      Pastype: pastype,
      Naam: input.name || (input.pasType === "ovchip" ? pasId : null),
      dateCreated: new Date(),
    },
  });
  return { id, temporaryCode: input.pasType === "ovchip" ? storedPasId : null };
}

export async function unlinkPass(accountId: string, passId: string) {
  await requireUser(accountId);
  const pass = await prisma.accounts_pasids.findFirst({ where: { ID: passId, ...(await ownedPasses(accountId)) } });
  if (!pass) throw new AccountError("Het pasnummer is niet gevonden");
  const active = await prisma.abonnementen.findFirst({ where: { bikepassID: pass.ID, isActief: true }, select: { ID: true } });
  if (active) throw new AccountError("Aan deze pas is een abonnement gekoppeld. U kunt deze pas daarom niet verwijderen.");
  const place = await prisma.fietsenstalling_plek.findFirst({ where: { bikeParked: pass.ID }, select: { id: true } });
  if (place) {
    const name = (await placeDisplayName(place.id))?.name ?? "";
    throw new AccountError(`De fiets staat gestald in stalling ${name} en moet eerst daar worden uitgecheckt`);
  }
  if (pass.transactionID) {
    const transaction = await prisma.transacties.findUnique({ where: { ID: pass.transactionID }, select: { FietsenstallingID: true } });
    if (transaction) {
      const name = await bikeparkDisplayName(transaction.FietsenstallingID);
      throw new AccountError(`De fiets staat gestald in stalling ${name} en moet daar eerst worden uitgecheckt`);
    }
  }
  await prisma.accounts_pasids.delete({ where: { ID: pass.ID } });
}

// Bikepark.getDisplayName.
async function bikeparkDisplayName(bikeparkId: string): Promise<string> {
  const bikepark = await prisma.fietsenstallingen.findFirst({
    where: { OR: [{ ID: bikeparkId }, { StallingsID: bikeparkId }] },
    select: { Title: true, Plaats: true, SiteID: true },
  });
  if (!bikepark) return "";
  if (bikepark.Plaats) return `${bikepark.Title ?? ""} te ${bikepark.Plaats}`;
  const council = bikepark.SiteID ? await prisma.contacts.findUnique({ where: { ID: bikepark.SiteID }, select: { CompanyName: true } }) : null;
  return `${bikepark.Title ?? ""} te ${council?.CompanyName ?? ""}`;
}

export async function listProducts() {
  const rows = await prisma.producten.findMany({ where: { status: "1" } });
  return rows.sort((a, b) => productAmount(a) - productAmount(b));
}

function productAmount(product: { prijs: { toString(): string } | null; credit: { toString(): string } | null }) {
  const prijs = Number(product.prijs ?? 0);
  const credit = Number(product.credit ?? 0);
  return prijs > 0 ? prijs : credit;
}

export async function startTopup(accountId: string, productId: number | "saldotekort", origin: string) {
  await requireUser(accountId);
  let credit = 0;
  if (productId === "saldotekort") {
    credit = -(await recalculateSaldo(accountId));
  } else {
    const product = await prisma.producten.findFirst({ where: { ID: productId, status: "1" } });
    credit = product ? productAmount(product) : 0;
  }
  if (!(credit > 0)) throw new AccountError("Kies een opwaardeerbedrag");
  const fee = await transactionFee();
  const charge = credit + fee;
  const id = coldfusionUuid();
  await prisma.financialtransactions.create({
    data: {
      ID: id,
      amount: credit,
      transactiekosten: fee,
      transactionDate: new Date(),
      paymentMethod: "ideal",
      status: "open",
      description: "Opwaardering stallingstegoed",
      code: "betaling website",
      accountID: accountId,
      paidToSiteID: "1",
    },
  });
  let payment;
  try {
    payment = await createIdealPayment({
      amount: charge,
      description: "Opwaardering stallingstegoed",
      redirectUrl: `${origin}/account/tegoed?transactionID=${id}`,
      webhookUrl: `${origin}/api/mollie/webhook`,
      transactionID: id,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Mollie-betaling mislukt";
    throw new AccountError(detail);
  }
  if (payment.id) {
    await prisma.financialtransactions.update({ where: { ID: id }, data: { mollieTransactionID: payment.id } });
  }
  return { transactionID: id, checkoutUrl: payment.checkoutUrl };
}

export async function applyMollieResult(input: { id: string; status: string; transactionID: string }) {
  const transaction = await prisma.financialtransactions.findUnique({ where: { ID: input.transactionID } });
  if (!transaction) throw new AccountError("Transactie niet gevonden");
  if (transaction.status === "ok") return { status: "ok" as const };
  const status = ledgerStatus(input.status);
  const applied = await prisma.financialtransactions.updateMany({
    where: { ID: transaction.ID, status: { not: "ok" } },
    data: {
      status,
      mollieTransactionID: input.id,
      depositDate: status === "ok" ? new Date() : transaction.depositDate,
    },
  });
  if (applied.count === 0) {
    const current = await prisma.financialtransactions.findUnique({ where: { ID: transaction.ID }, select: { status: true } });
    if (current?.status === "ok") return { status: "ok" as const };
    return { status: (current?.status ?? status) as typeof status };
  }
  if (status !== "ok") {
    if (transaction.code === "betaling abonnement website" && transaction.subscriptionID) {
      const subscription = await prisma.abonnementen.findUnique({ where: { ID: transaction.subscriptionID }, select: { ID: true, isBetaald: true, ingangsdatum: true } });
      if (subscription && !subscription.isBetaald) {
        await prisma.abonnementen.update({
          where: { ID: subscription.ID },
          data: {
            isActief: false,
            afloopdatum: subscription.ingangsdatum ? new Date(subscription.ingangsdatum.getTime() + 1000) : subscription.ingangsdatum,
          },
          select: { ID: true },
        });
      }
    }
    return { status };
  }
  if (transaction.accountID) await recalculateSaldo(transaction.accountID);
  if (transaction.code === "betaling website" && transaction.accountID) await settleOperatorBalances(transaction.accountID);
  if (transaction.code === "betaling abonnement website" && transaction.subscriptionID) {
    await activatePaidSubscription(transaction.subscriptionID);
  }
  return { status: "ok" as const };
}

export async function resolveWebhook(body: { id?: string; status?: string; metadata?: { transactionID?: string } }) {
  if (body.status && body.metadata?.transactionID && body.id) {
    return applyMollieResult({ id: body.id, status: body.status, transactionID: body.metadata.transactionID });
  }
  if (!body.id) throw new AccountError("Geen betalingskenmerk");
  const remote = await fetchMolliePayment(body.id);
  if (!remote) throw new AccountError("Betaling niet opgehaald bij Mollie");
  return applyMollieResult({ id: body.id, status: remote.status, transactionID: remote.transactionID });
}

const OWNER_EXCLUDED_URLNAMES = new Set(["fietsberaad"]); // "testgemeente", "testgemeente-api" -> these are never created in prod, only in the dev and acc databases for testing
const BUURT_TYPES = new Set(["buurtstalling", "fietstrommel"]);

function logoUrl(logo: string | null | undefined): string | null {
  const value = logo?.trim();
  if (!value) return null;
  if (value.startsWith("http")) return value;
  const local = value.replace("[local]", "/api");
  return local.startsWith("/") ? local : `/${local}`;
}

export async function citizenTheme(siteId: string | null | undefined) {
  const select = { ID: true, CompanyName: true, UrlName: true, ThemeColor1: true, ThemeColor2: true, CompanyLogo: true } as const;
  const contact = (siteId ? await prisma.contacts.findFirst({ where: { ID: siteId }, select }) : null)
    ?? await prisma.contacts.findFirst({ where: { ID: "1" }, select });
  const own = contact && contact.ID !== "1" && !OWNER_EXCLUDED_URLNAMES.has((contact.UrlName ?? "").toLowerCase());
  return {
    id: own ? contact.ID : null,
    name: own ? contact.CompanyName ?? "" : "",
    urlName: own ? contact.UrlName ?? "" : "",
    themeColor1: contact?.ThemeColor1 || "1f99d2",
    themeColor2: contact?.ThemeColor2 || "96c11f",
    logo: own ? logoUrl(contact.CompanyLogo) : null,
    menu: await citizenMenuFlags(own ? contact.ID : "1"),
  };
}

// Conditions of site_wrapper.cfm, evaluated for request.siteID (Fietsberaad when no gemeente is chosen).
async function citizenMenuFlags(siteId: string) {
  const [fms, bikeparks, activeForms, linkedForms] = await Promise.all([
    prisma.modules_contacts.count({ where: { SiteID: siteId, ModuleID: "fms" } }),
    prisma.fietsenstallingen.findMany({
      where: { SiteID: siteId, Status: "1", NOT: { Title: "Systeemstalling" } },
      select: { Type: true, BerekentStallingskosten: true },
    }),
    prisma.abonnementsvormen.count({ where: { siteID: siteId, isActief: true } }),
    prisma.abonnementsvorm_fietsenstalling.count({
      where: { fietsenstallingen: { SiteID: siteId }, abonnementsvormen: { isActief: true } },
    }),
  ]);
  return {
    fms: fms > 0,
    topup: bikeparks.some((bikepark) => !bikepark.BerekentStallingskosten),
    abonnement: activeForms > 0 && linkedForms > 0,
    bikeparkTypes: [...new Set(bikeparks.map((bikepark) => bikepark.Type ?? ""))].filter(Boolean),
    hasBikeparks: bikeparks.length > 0,
  };
}

// Port of gemeenten_Utility.getList.
export async function listCouncils() {
  const rows = await prisma.contacts.findMany({
    where: { ParentID: "0", Status: "1", Status_website: "1", NOT: { ID: "1" } },
    select: { ID: true, CompanyName: true, UrlName: true },
    orderBy: { CompanyName: "asc" },
  });
  return rows
    .filter((row) => row.CompanyName && !OWNER_EXCLUDED_URLNAMES.has((row.UrlName ?? "").toLowerCase()))
    .map((row) => ({ id: row.ID, name: row.CompanyName ?? "", urlName: row.UrlName ?? "" }));
}

export const CITIZEN_PAGE_TITLES = new Set(["Login", "Registreren", "MijnGegevens", "Stallingstegoed", "Abonnement", "Tekst_links"]);

// Port of articles_Utility.getArticle: Status and Archived are ignored, empty fields fall back to Fietsberaad (SiteID 1).
export async function citizenPageArticle(siteId: string | null | undefined, title: string) {
  const select = { Title: true, DisplayTitle: true, Abstract: true, Article: true } as const;
  const site = siteId || "1";
  const [own, fallback] = await Promise.all([
    prisma.articles.findFirst({ where: { SiteID: site, Title: title }, select }),
    prisma.articles.findFirst({ where: { SiteID: "1", Title: title }, select }),
  ]);
  if (!own && !fallback) return null;
  const empty = (value: string | null | undefined) => !value;
  let displayTitle: string | null | undefined;
  let abstract: string | null | undefined;
  let article: string | null | undefined;
  if (own) {
    displayTitle = empty(own.Article) && empty(own.Abstract) ? fallback?.DisplayTitle : own.DisplayTitle || own.Title;
    abstract = empty(own.Abstract) ? fallback?.Abstract : own.Abstract;
    article = empty(own.Article) ? fallback?.Article : own.Article;
  } else {
    displayTitle = fallback!.DisplayTitle || fallback!.Title;
    abstract = fallback!.Abstract;
    article = fallback!.Article;
  }
  return {
    title: (own ?? fallback)!.Title ?? title,
    displayTitle: displayTitle || (own ?? fallback)!.Title || title,
    abstract: abstract ?? "",
    article: article ?? "",
  };
}

/**
 * accounts_pasids.AccountID holds a gemeenteaccounts.ID (ColdFusion CouncilAccount), not an accounts.ID.
 * abonnementen.AccountID and financialtransactions.accountID do hold accounts.ID.
 * Passes written by Next.js before the council-account fix hold accounts.ID, so both are accepted.
 */
async function passOwnerIds(accountId: string): Promise<string[]> {
  const links = await prisma.gemeenteaccounts.findMany({ where: { AccountID: accountId }, select: { ID: true } });
  return [accountId, ...links.map((link) => link.ID)];
}

async function ownedPasses(accountId: string) {
  return { AccountID: { in: await passOwnerIds(accountId) } };
}

/** BikeparkAccount.getCouncilAccountByCouncil: find or create the account's link to a municipality. */
export async function councilAccountId(accountId: string, siteId: string): Promise<string> {
  const where = { AccountID: accountId, SiteID: siteId };
  const existing = await prisma.gemeenteaccounts.findFirst({ where, select: { ID: true } });
  if (existing) return existing.ID;
  const id = coldfusionUuid();
  try {
    await prisma.gemeenteaccounts.create({ data: { ID: id, ...where } });
    return id;
  } catch (error) {
    const raced = await prisma.gemeenteaccounts.findFirst({ where, select: { ID: true } });
    if (raced) return raced.ID;
    throw error;
  }
}

/** mypage/controller.cfm links a new pass to request.council; without one, fall back to the account's only municipality. */
async function passSiteId(accountId: string, siteId: string | null | undefined): Promise<string> {
  if (siteId && siteId !== "1") return siteId;
  const links = await prisma.gemeenteaccounts.findMany({ where: { AccountID: accountId }, select: { SiteID: true }, take: 2 });
  if (links.length === 1 && links[0]) return links[0].SiteID;
  throw new AccountError("Kies eerst uw gemeente om een pas toe te voegen");
}

/** BikePass.getTopAccount: the accounts.ID behind a pass. */
async function passTopAccountId(passAccountId: string | null): Promise<string | null> {
  if (!passAccountId) return null;
  const link = await prisma.gemeenteaccounts.findUnique({ where: { ID: passAccountId }, select: { AccountID: true } });
  return link?.AccountID ?? passAccountId;
}

/** BikePass.setName: one name for every row of the pass (same PasID and Pastype), in every municipality. */
async function setPassName(pass: { PasID: string; Pastype: string }, name: string | null) {
  await prisma.accounts_pasids.updateMany({ where: { PasID: pass.PasID, Pastype: pass.Pastype }, data: { Naam: name } });
}

/** BikeparkAccount.takeOverSystemAccount: the citizen gets the SYSTEM account's transactions, subscriptions and passes in every municipality. */
async function takeOverSystemAccount(accountId: string, systemId: string) {
  if (systemId === accountId) return;
  const system = await prisma.accounts.findUnique({ where: { ID: systemId }, select: { account_type: true } });
  if (system?.account_type !== "SYSTEM") return;
  await prisma.financialtransactions.updateMany({ where: { accountID: systemId }, data: { accountID: accountId } });
  await prisma.abonnementen.updateMany({ where: { AccountID: systemId }, data: { AccountID: accountId } });
  const links = await prisma.gemeenteaccounts.findMany({ where: { AccountID: systemId }, select: { ID: true, SiteID: true } });
  for (const link of links) {
    await prisma.accounts_pasids.updateMany({ where: { AccountID: link.ID }, data: { AccountID: await councilAccountId(accountId, link.SiteID) } });
  }
  const direct = await prisma.accounts_pasids.findMany({ where: { AccountID: systemId }, select: { ID: true, SiteID: true } });
  for (const pass of direct) {
    const owner = pass.SiteID ? await councilAccountId(accountId, pass.SiteID) : accountId;
    await prisma.accounts_pasids.update({ where: { ID: pass.ID }, data: { AccountID: owner } });
  }
  await prisma.gemeenteaccounts.deleteMany({ where: { AccountID: systemId } });
  await prisma.accounts.delete({ where: { ID: systemId } }).catch(() => undefined);
  await recalculateSaldo(accountId);
}

async function ownedSubscription(accountId: string) {
  return { OR: [{ AccountID: accountId }, { accounts_pasids: await ownedPasses(accountId) }] };
}

/** Citizen URLs carry `externalID` (as ColdFusion does), never the sequential ID; older rows get one on first use. */
async function subscriptionRef(row: { ID: number; externalID: string | null }): Promise<string> {
  if (row.externalID) return row.externalID;
  const externalID = coldfusionUuid();
  await prisma.abonnementen.update({ where: { ID: row.ID }, data: { externalID }, select: { ID: true } });
  return externalID;
}

export async function resolveSubscriptionRef(ref: unknown): Promise<number | null> {
  if (typeof ref !== "string" || !ref.trim()) return null;
  const row = await prisma.abonnementen.findFirst({ where: { externalID: ref.trim() }, select: { ID: true } });
  return row?.ID ?? null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function subscriptionEnd(start: Date, months: number): Date {
  return new Date(addMonths(start, months).getTime() + 24 * 60 * 60 * 1000 - 1000);
}

function isOvchipForm(idmiddelen: string | null | undefined): boolean {
  return (idmiddelen ?? "").toLowerCase().includes("ovchip");
}

function passDisplayName(pass: { PasID: string; Naam: string | null }, alwaysDisplayPassID: boolean): string {
  const name = pass.Naam?.trim();
  if (!name) return pass.PasID;
  return alwaysDisplayPassID && name !== pass.PasID ? `${name} (${pass.PasID})` : name;
}

async function transactionFee(): Promise<number> {
  const settings = await prisma.instellingen.findFirst({ select: { TransactiekostenIdeal: true } });
  return Number(settings?.TransactiekostenIdeal ?? 0);
}

async function prolongStart(accountId: string | null | undefined, prolongId: number | undefined) {
  if (!accountId || !prolongId) return null;
  const previous = await prisma.abonnementen.findFirst({
    where: { ID: prolongId, ...(await ownedSubscription(accountId)) },
    select: {
      ID: true,
      externalID: true,
      afloopdatum: true,
      bikepassID: true,
      subscriptiontypeID: true,
      abonnementsvormen: { select: { naam: true, isActief: true, idmiddelen: true } },
    },
  });
  if (!previous) return null;
  return {
    ...previous,
    start: previous.afloopdatum ? new Date(previous.afloopdatum.getTime() + 1000) : startOfToday(),
  };
}

type CatalogGroup =
  | {
      id: string;
      title: string;
      kind: "forms";
      forms: { id: number; naam: string | null; prijs: number; stallings: string[]; start: string; end: string }[];
    }
  | { id: string; title: string; kind: "links"; rows: { key: string; title: string; prijs: number; href: string }[] };

export async function listSubscriptionCatalog(
  siteId: string,
  options: { parkingId?: string; prolongId?: number; accountId?: string | null } = {},
) {
  const parking = options.parkingId
    ? await prisma.fietsenstallingen.findFirst({
        where: { ID: options.parkingId, SiteID: siteId },
        select: { ID: true, Title: true, Type: true, StallingsID: true },
      })
    : null;
  const [contact, types, forms, buurtModule, buurtStallings, fee, prolonged] = await Promise.all([
    prisma.contacts.findFirst({
      where: { ID: siteId },
      select: { ID: true, CompanyName: true, UrlName: true, ThemeColor1: true },
    }),
    prisma.fietsenstallingtypen.findMany({ orderBy: { sequence: "asc" } }),
    prisma.abonnementsvormen.findMany({
      where: { isActief: true, siteID: siteId },
      orderBy: { tijdsduur: "asc" },
      select: {
        ID: true,
        naam: true,
        prijs: true,
        tijdsduur: true,
        bikeparkTypeID: true,
        abonnementsvorm_fietsenstalling: { select: { BikeparkID: true, fietsenstallingen: { select: { Title: true } } } },
      },
    }),
    prisma.modules_contacts.findFirst({ where: { SiteID: siteId, ModuleID: "buurtstallingen" }, select: { ModuleID: true } }),
    prisma.fietsenstallingen.findMany({
      where: { SiteID: siteId, Status: "1", Type: { in: [...BUURT_TYPES] }, ...(parking ? { ID: parking.ID } : {}) },
      orderBy: { Title: "asc" },
      select: {
        ID: true,
        Title: true,
        Type: true,
        StallingsID: true,
        abonnementsvorm_fietsenstalling: {
          select: { abonnementsvormen: { select: { ID: true, naam: true, prijs: true, isActief: true } } },
        },
      },
    }),
    transactionFee(),
    prolongStart(options.accountId, options.prolongId),
  ]);
  const start = prolonged?.start ?? startOfToday();
  const visibleTypes = parking ? types.filter((type) => type.id === parking.Type) : types;
  const groups = visibleTypes.flatMap((type): CatalogGroup[] => {
    const title = `Abonnementen ${(type.name || type.id).toLowerCase()}`;
    if (BUURT_TYPES.has(type.id)) {
      if (!buurtModule || options.prolongId) return [];
      const rows = buurtStallings
        .filter((stalling) => stalling.Type === type.id)
        .flatMap((stalling) => stalling.abonnementsvorm_fietsenstalling
          .map((link) => link.abonnementsvormen)
          .filter((form): form is NonNullable<typeof form> => Boolean(form?.isActief))
          .map((form) => ({
            key: `${stalling.ID}_${form.ID}`,
            title: `${stalling.Title ?? ""} - ${form.naam ?? ""}`,
            prijs: form.prijs === null ? 0 : Number(form.prijs),
            href: `/account/abonnement?${new URLSearchParams({
              siteId,
              parkingId: stalling.ID,
              wizard: "fiets",
            }).toString()}`,
          })));
      if (!rows.length) return [];
      return [{ id: type.id, title, kind: "links", rows }];
    }
    if (type.id === "fietskluizen") return [];
    const sellable = forms
      .filter((form) => form.bikeparkTypeID === type.id)
      .filter((form) => !options.prolongId || form.ID === prolonged?.subscriptiontypeID)
      .filter((form) => form.abonnementsvorm_fietsenstalling.length > 0)
      .filter((form) => !parking || form.abonnementsvorm_fietsenstalling.some((link) => link.BikeparkID === parking.ID));
    if (!sellable.length) return [];
    return [{
      id: type.id,
      title,
      kind: "forms",
      forms: sellable.map((form) => ({
        id: form.ID,
        naam: form.naam,
        prijs: form.prijs === null ? 0 : Number(form.prijs),
        stallings: form.abonnementsvorm_fietsenstalling
          .map((link) => link.fietsenstallingen?.Title)
          .filter((name): name is string => Boolean(name)),
        start: formatDutchDate(start),
        end: formatDutchDate(addMonths(start, form.tijdsduur ?? 1)),
      })),
    }];
  });
  const prolongForm = prolonged?.abonnementsvormen;
  return {
    owner: {
      id: contact?.ID ?? siteId,
      name: contact?.CompanyName ?? "",
      themeColor: contact?.ThemeColor1 || "1f99d2",
    },
    fee,
    groups,
    prolong: prolonged
      ? {
          ref: await subscriptionRef(prolonged),
          formId: prolonged.subscriptiontypeID,
          error: prolongForm && !prolongForm.isActief
            ? `Abonnement '${prolongForm.naam ?? ""}' bestaat niet meer. Kies via Koop abonnement een ander abonnement.`
            : "",
        }
      : null,
  };
}

export async function subscriptionCheckout(accountId: string, formId: number) {
  await requireUser(accountId);
  const form = await prisma.abonnementsvormen.findUnique({
    where: { ID: formId },
    select: {
      ID: true,
      naam: true,
      prijs: true,
      tijdsduur: true,
      idmiddelen: true,
      bikeparkTypeID: true,
      siteID: true,
      conditionsID: true,
      isActief: true,
    },
  });
  if (!form || !form.isActief || EXCLUDED_BIKEPARK_TYPES.has(form.bikeparkTypeID ?? "")) {
    throw new AccountError("Dit abonnement is niet beschikbaar");
  }
  const ovchip = isOvchipForm(form.idmiddelen);
  const start = startOfToday();
  const end = subscriptionEnd(start, form.tijdsduur ?? 1);
  const [passes, council, fee] = await Promise.all([
    prisma.accounts_pasids.findMany({
      where: { ...(await ownedPasses(accountId)), Pastype: ovchip ? "ovchip" : "sleutelhanger" },
      orderBy: { dateCreated: "asc" },
      select: {
        ID: true,
        PasID: true,
        Naam: true,
        Pastype: true,
        abonnementen: { select: { subscriptiontypeID: true, ingangsdatum: true, afloopdatum: true, isActief: true, isBetaald: true } },
      },
    }),
    form.siteID ? prisma.contacts.findUnique({ where: { ID: form.siteID }, select: { CompanyName: true } }) : null,
    transactionFee(),
  ]);
  const seen = new Set<string>();
  const allowed = passes.filter((pass) => {
    if (seen.has(pass.PasID)) return false;
    seen.add(pass.PasID);
    return !pass.abonnementen.some((row) => sameFormOverlaps(row, form.ID, start, end));
  });
  return {
    form: {
      id: form.ID,
      naam: form.naam,
      prijs: form.prijs === null ? 0 : Number(form.prijs),
      ovchip,
      conditions: Boolean(form.conditionsID),
      council: council?.CompanyName ?? "",
      siteId: form.siteID,
    },
    passes: allowed.map((pass) => ({
      passId: pass.PasID,
      label: ovchip
        ? bikepassDisplayName(pass, { alwaysDisplayName: true })
        : bikepassDisplayName(pass, { alwaysDisplayName: true, alwaysDisplayPassID: true }),
    })),
    fee,
  };
}

function sameFormOverlaps(
  row: { subscriptiontypeID: number | null; ingangsdatum: Date | null; afloopdatum: Date | null; isActief: boolean | null; isBetaald: boolean },
  formId: number,
  start: Date,
  end: Date,
): boolean {
  if (row.subscriptiontypeID !== formId) return false;
  if (!row.isActief && !row.isBetaald) return false;
  if (!row.ingangsdatum || !row.afloopdatum) return true;
  return row.ingangsdatum <= end && row.afloopdatum >= start;
}

// application.domvalues.transactions labels, keyed by accounts_pasids.Pastype.
const PASS_TYPE_LABELS: Record<string, string> = {
  sleutelhanger: "Sleutelhanger",
  ovchip: "(OV-)chip",
  cijfercode: "Cijfercode",
  tijdelijk: "Aanmeldcode (OV-)chip",
  tmp_sleutelhanger: "Activeringscode sleutelhanger",
};
const TEMP_PASS_TYPES = new Set(["tijdelijk", "tmp_sleutelhanger"]);

// Port of BikePass.getDisplayName.
function bikepassDisplayName(
  pass: { PasID: string; Naam: string | null; Pastype: string },
  options: { alwaysDisplayPassID?: boolean; alwaysDisplayName?: boolean } = {},
): string {
  const label = PASS_TYPE_LABELS[pass.Pastype] ?? "";
  const name = pass.Naam ?? "";
  switch (pass.Pastype) {
    case "sleutelhanger":
      if (name.trim()) return `${label} '${name}'${options.alwaysDisplayPassID ? ` ${pass.PasID}` : ""}`;
      return `${label} ${pass.PasID}`;
    case "ovchip":
      return `${label} ${options.alwaysDisplayName ? ` ${name}` : ""}`.trim();
    case "tmp_sleutelhanger":
      return `${label} ${pass.PasID}`;
    case "tijdelijk":
      return `${label} ${pass.PasID}${options.alwaysDisplayName ? ` (Kaartnummer ${name})` : ""}`;
    default:
      return pass.PasID;
  }
}

// BikeparkAccount.subscriptions / BikePass.subscriptions.
function currentSubscriptionWhere(now = new Date()) {
  return { afloopdatum: { gte: now }, isActief: true, isBetaald: true, type: "abonnement" };
}

// Place.getDisplayName.
async function placeDisplayName(plekID: bigint): Promise<{ name: string; bikeparked: boolean } | null> {
  const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: plekID }, select: { titel: true, sectie_id: true, bikeParked: true } });
  const section = place?.sectie_id
    ? await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) }, select: { titel: true, fietsenstallingsId: true } })
    : null;
  const bikepark = section?.fietsenstallingsId
    ? await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId }, select: { ID: true, Title: true, Type: true, Plaats: true, SiteID: true } })
    : null;
  if (!place || !section || !bikepark) return null;
  const sectionCount = await prisma.fietsenstalling_sectie.count({ where: { fietsenstallingsId: bikepark.ID } });
  const prefix = bikepark.Type === "fietskluizen" ? "kluis " : "";
  let name = sectionCount === 1
    ? `${prefix}${place.titel ?? ""} van ${bikepark.Title ?? ""}`
    : `${prefix}${place.titel ?? ""}${bikepark.Title ? ` in sector ${section.titel}` : ""} van locatie ${bikepark.Title ?? ""}`;
  if (bikepark.Plaats) {
    name += ` te ${bikepark.Plaats}`;
  } else {
    const council = bikepark.SiteID ? await prisma.contacts.findUnique({ where: { ID: bikepark.SiteID }, select: { CompanyName: true } }) : null;
    name += ` te ${council?.CompanyName ?? ""}`;
  }
  return { name, bikeparked: Boolean(place.bikeParked) };
}

/** The subscription table of account.cfm (Mijn abonnementen). */
export async function mySubscriptions(accountId: string) {
  const [rows, passes] = await Promise.all([
    prisma.abonnementen.findMany({
      where: { ...(await ownedSubscription(accountId)), ...currentSubscriptionWhere() },
      select: {
        ID: true,
        externalID: true,
        siteID: true,
        plekID: true,
        bikeparkID: true,
        ingangsdatum: true,
        afloopdatum: true,
        abonnementsvormen: { select: { naam: true, idmiddelen: true, siteID: true } },
        accounts_pasids: { select: { PasID: true, Naam: true, Pastype: true } },
      },
      orderBy: { ingangsdatum: "asc" },
    }),
    prisma.accounts_pasids.findMany({
      where: await ownedPasses(accountId),
      select: { ID: true, Pastype: true, abonnementen: { where: currentSubscriptionWhere(), select: { plekID: true, bikeparkID: true } } },
    }),
  ]);
  const siteIds = [...new Set(rows.map((row) => row.abonnementsvormen?.siteID).filter((id): id is string => Boolean(id)))];
  const councils = siteIds.length
    ? await prisma.contacts.findMany({ where: { ID: { in: siteIds } }, select: { ID: true, CompanyName: true } })
    : [];
  return Promise.all(rows.map(async (row) => {
    const keyfob = (row.abonnementsvormen?.idmiddelen ?? "").split(",").includes("sleutelhanger");
    const pass = row.accounts_pasids;
    const place = row.plekID !== null ? await placeDisplayName(row.plekID) : null;
    const council = councils.find((item) => item.ID === row.abonnementsvormen?.siteID)?.CompanyName ?? "";
    const actions: { kind: "prolong" | "pass"; label: string }[] = [];
    if (pass && !TEMP_PASS_TYPES.has(pass.Pastype)) {
      if (!place || !place.bikeparked) {
        actions.push({ kind: "prolong", label: "Verlengen" });
        actions.push({ kind: "pass", label: keyfob ? "Wijzig sleutelhanger" : "Wijzig OV-chipkaart" });
      }
    } else if (pass && keyfob) {
      actions.push({ kind: "pass", label: "Koppel sleutelhanger" });
    } else {
      const ofType = passes.filter((item) => item.Pastype === (keyfob ? "sleutelhanger" : "ovchip"));
      const usable = row.plekID === null
        ? ofType.length > 0
        : ofType.some((item) => item.abonnementen.length === 0
          || item.abonnementen.some((other) => other.plekID === null || other.bikeparkID !== row.bikeparkID));
      if (usable) actions.push({ kind: "pass", label: keyfob ? "Koppel sleutelhanger" : "Koppel OV-chipkaart" });
    }
    return {
      id: row.ID,
      ref: await subscriptionRef(row),
      siteId: row.abonnementsvormen?.siteID ?? row.siteID,
      pass: pass ? bikepassDisplayName(pass, { alwaysDisplayPassID: true, alwaysDisplayName: true }) : "",
      title: place ? `${row.abonnementsvormen?.naam ?? ""}, ${place.name}` : `${row.abonnementsvormen?.naam ?? ""}, gemeente ${council}`,
      hasPlace: Boolean(place),
      start: row.ingangsdatum ? formatDutchDate(row.ingangsdatum) : "",
      end: row.afloopdatum ? formatDutchDate(row.afloopdatum) : "",
      actions,
    };
  }));
}

async function ownSubscriptionForRelink(accountId: string, subscriptionId: number) {
  const subscription = await prisma.abonnementen.findFirst({
    where: { ID: subscriptionId, ...(await ownedSubscription(accountId)) },
    select: {
      ID: true,
      externalID: true,
      isBetaald: true,
      ingangsdatum: true,
      afloopdatum: true,
      subscriptiontypeID: true,
      plekID: true,
      bikeparkID: true,
      abonnementsvormen: true,
      accounts_pasids: { select: { ID: true, PasID: true, Naam: true, Pastype: true } },
    },
  });
  if (!subscription?.abonnementsvormen) throw new AccountError("Abonnement niet gevonden");
  return { subscription, form: subscription.abonnementsvormen };
}

// Subscription.isBikepassAllowed for the passes of the account.
function bikepassAllowed(
  subscription: { ID: number; subscriptiontypeID: number | null; plekID: bigint | null; bikeparkID: string | null; ingangsdatum: Date | null; afloopdatum: Date | null },
  others: { ID: number; subscriptiontypeID: number | null; plekID: bigint | null; bikeparkID: string | null; ingangsdatum: Date | null; afloopdatum: Date | null }[],
): boolean {
  if (subscription.plekID !== null) {
    return !others.some((other) => other.plekID !== null && other.plekID !== subscription.plekID && other.bikeparkID === subscription.bikeparkID);
  }
  return !others.some((other) => {
    if (other.ID === subscription.ID || other.subscriptiontypeID !== subscription.subscriptiontypeID) return false;
    if (!subscription.ingangsdatum || !subscription.afloopdatum || !other.ingangsdatum || !other.afloopdatum) return true;
    return other.ingangsdatum <= subscription.afloopdatum && other.afloopdatum >= subscription.ingangsdatum;
  });
}

/** koppelPas.cfm for an existing subscription (Wijzig/Koppel sleutelhanger of OV-chipkaart). */
export async function subscriptionRelinkCheckout(accountId: string, subscriptionId: number) {
  await requireUser(accountId);
  const { subscription, form } = await ownSubscriptionForRelink(accountId, subscriptionId);
  const ovchip = isOvchipForm(form.idmiddelen);
  const [passes, council, fee] = await Promise.all([
    prisma.accounts_pasids.findMany({
      where: { ...(await ownedPasses(accountId)), Pastype: ovchip ? "ovchip" : "sleutelhanger" },
      orderBy: { dateCreated: "asc" },
      select: {
        ID: true,
        PasID: true,
        Naam: true,
        Pastype: true,
        abonnementen: {
          where: currentSubscriptionWhere(),
          select: { ID: true, subscriptiontypeID: true, plekID: true, bikeparkID: true, ingangsdatum: true, afloopdatum: true },
        },
      },
    }),
    form.siteID ? prisma.contacts.findUnique({ where: { ID: form.siteID }, select: { CompanyName: true } }) : null,
    transactionFee(),
  ]);
  const seen = new Set<string>();
  const allowed = passes.filter((pass) => {
    if (seen.has(pass.PasID)) return false;
    seen.add(pass.PasID);
    return bikepassAllowed(subscription, pass.abonnementen);
  });
  const current = subscription.accounts_pasids;
  return {
    form: {
      id: form.ID,
      naam: form.naam,
      prijs: form.prijs === null ? 0 : Number(form.prijs),
      ovchip,
      conditions: Boolean(form.conditionsID),
      council: council?.CompanyName ?? "",
      siteId: form.siteID,
      fietskluizen: form.bikeparkTypeID === "fietskluizen",
    },
    passes: allowed.map((pass) => ({
      passId: pass.PasID,
      label: ovchip
        ? bikepassDisplayName(pass, { alwaysDisplayName: true })
        : bikepassDisplayName(pass, { alwaysDisplayName: true, alwaysDisplayPassID: true }),
    })),
    fee,
    subscription: {
      ref: await subscriptionRef(subscription),
      paid: subscription.isBetaald,
      currentPassId: current?.PasID ?? null,
      tempPassAttached: Boolean(current && TEMP_PASS_TYPES.has(current.Pastype)),
    },
  };
}

export async function relinkSubscriptionPass(input: {
  accountId: string;
  subscriptionId: number;
  pass: PassChoice;
  acceptedConditions: boolean;
  source: string;
  origin: string;
}) {
  await requireUser(input.accountId);
  const { subscription, form } = await ownSubscriptionForRelink(input.accountId, input.subscriptionId);
  if (!subscription.isBetaald && form.conditionsID && !input.acceptedConditions) {
    throw new AccountError("U dient akkoord te gaan met de abonnementsvoorwaarden");
  }
  const start = subscription.ingangsdatum ?? startOfToday();
  const end = subscription.afloopdatum ?? subscriptionEnd(start, form.tijdsduur ?? 1);
  const passId = await chooseSubscriptionPass(input.accountId, form, input.pass, start, end, subscription.ID);
  if (passId) {
    if (subscription.plekID !== null) {
      const others = await prisma.abonnementen.findMany({
        where: { bikepassID: passId, ...currentSubscriptionWhere() },
        select: { ID: true, subscriptiontypeID: true, plekID: true, bikeparkID: true, ingangsdatum: true, afloopdatum: true },
      });
      if (!bikepassAllowed(subscription, others)) {
        throw new AccountError("Met deze pas hebt u al een abonnement in deze stalling. Het is niet toegestaan met één pas twee abonnementen voor dezelfde stalling af te sluiten.");
      }
    }
    await prisma.abonnementen.update({ where: { ID: subscription.ID }, data: { bikepassID: passId }, select: { ID: true } });
  }
  if (!subscription.isBetaald) return paySubscription(input.accountId, subscription.ID, input.origin);
  const pass = passId
    ? await prisma.accounts_pasids.findUnique({ where: { ID: passId }, select: { PasID: true, Naam: true, Pastype: true } })
    : null;
  const redirect = input.source === "mijngegevens" && pass && !TEMP_PASS_TYPES.has(pass.Pastype)
    ? "/account?showForm=abonnementen"
    : null;
  return {
    subscriptionRef: await subscriptionRef(subscription),
    checkoutUrl: null as string | null,
    feedback: pass ? `Pas ${bikepassDisplayName(pass)} is nu gekoppeld aan uw abonnement.` : "",
    redirect,
  };
}

export async function subscriptionConditions(formId: number) {
  const form = await prisma.abonnementsvormen.findUnique({
    where: { ID: formId },
    select: { naam: true, prijs: true, siteID: true, conditionsID: true },
  });
  const template = form?.conditionsID
    ? await prisma.documenttemplates.findUnique({ where: { ID: form.conditionsID } })
    : null;
  if (!form || !template?.html) return null;
  const council = form.siteID
    ? await prisma.contacts.findUnique({ where: { ID: form.siteID }, select: { CompanyName: true, CompanyLogo: true } })
    : null;
  return {
    title: `Abonnementsvoorwaarden ${form.naam ?? ""}`.trim(),
    html: template.html,
    subscriptionName: form.naam,
    subscriptionPrice: form.prijs?.toString() ?? null,
    councilName: council?.CompanyName ?? "",
    councilLogo: council?.CompanyLogo ?? null,
  };
}

export type PassChoice = { passID?: string; newPass?: string; newPassName?: string };

export async function buySubscription(input: {
  accountId: string | null;
  formId: number;
  origin: string;
  prolongId?: number;
  pass?: PassChoice;
  acceptedConditions?: boolean;
}) {
  const accountId = input.accountId;
  if (!accountId) throw new AccountError("Log in om verder te gaan");
  await requireUser(accountId);
  const form = await prisma.abonnementsvormen.findUnique({ where: { ID: input.formId } });
  if (!form || !form.isActief || EXCLUDED_BIKEPARK_TYPES.has(form.bikeparkTypeID ?? "")) {
    throw new AccountError("Dit abonnement is niet beschikbaar");
  }
  if (form.siteID) await councilAccountId(accountId, form.siteID);
  const prolonged = await prolongStart(accountId, input.prolongId);
  if (input.prolongId && !prolonged) throw new AccountError("Abonnement niet gevonden");
  if (prolonged && prolonged.subscriptiontypeID !== form.ID) throw new AccountError("Dit abonnement kan niet worden verlengd");
  const start = prolonged?.start ?? startOfToday();
  const end = subscriptionEnd(start, form.tijdsduur ?? 1);
  let bikepassID: string | null = null;
  if (prolonged) {
    if (prolonged.abonnementsvormen?.idmiddelen === form.idmiddelen) bikepassID = prolonged.bikepassID;
  } else {
    if (form.conditionsID && !input.acceptedConditions) {
      throw new AccountError("U dient akkoord te gaan met de abonnementsvoorwaarden");
    }
    bikepassID = await chooseSubscriptionPass(accountId, form, input.pass ?? {}, start, end);
  }
  const created = await prisma.abonnementen.create({
    data: {
      externalID: coldfusionUuid(),
      ingangsdatum: start,
      afloopdatum: end,
      prijsInclBtw: form.prijs,
      isActief: false,
      isBetaald: false,
      subscriptiontypeID: form.ID,
      AccountID: accountId,
      siteID: form.siteID,
      exploitantID: form.exploitantSiteID,
      type: "abonnement",
      bikepassID,
      emailNadertEinde: false,
      dateCreated: new Date(),
    },
  });
  const price = Number(form.prijs ?? 0);
  if (price <= 0) {
    await prisma.abonnementen.update({ where: { ID: created.ID }, data: { isActief: true, isBetaald: true }, select: { ID: true } });
    await ensureTemporaryPass(created.ID);
    return { subscriptionRef: await subscriptionRef(created), checkoutUrl: null as string | null };
  }
  return paySubscription(accountId, created.ID, input.origin, prolonged ? await subscriptionRef(prolonged) : undefined);
}

async function chooseSubscriptionPass(
  accountId: string,
  form: { ID: number; idmiddelen: string; siteID: string | null; bikeparkTypeID: string | null },
  choice: PassChoice,
  start: Date,
  end: Date,
  excludeSubscriptionId?: number,
): Promise<string | null> {
  const ovchip = isOvchipForm(form.idmiddelen);
  const passID = choice.passID?.trim() ?? "";
  const newPass = (choice.newPass ?? "").replace(/\s/g, "");
  let pass: { ID: string; PasID?: string; Pastype?: string } | null = null;
  if (passID === "dummy" && !ovchip && form.bikeparkTypeID !== "fietskluizen") return null;
  if (passID) {
    pass = await prisma.accounts_pasids.findFirst({
      where: { ...(await ownedPasses(accountId)), PasID: passID, Pastype: ovchip ? "ovchip" : "sleutelhanger" },
      select: { ID: true, PasID: true, Pastype: true },
    });
    if (!pass) {
      throw new AccountError(ovchip ? `OV-chipkaart met nummer ${newPass} kan niet gevonden worden.` : "Kies een pas om te koppelen");
    }
  } else if (newPass) {
    if (ovchip && newPass.length !== 16) throw new AccountError("Het ingevoerde kaartnummer is onjuist.");
    if (!ovchip && newPass.length < 12) throw new AccountError("Het ingevoerde sleutelhangernummer is onjuist. Probeer het opnieuw.");
    const linked = await linkPass(accountId, {
      pasId: newPass,
      pasType: ovchip ? "ovchip" : "sleutelhanger",
      name: choice.newPassName?.trim() || undefined,
      siteId: form.siteID ?? undefined,
    });
    pass = { ID: linked.id };
  } else {
    throw new AccountError("Kies een pas om te koppelen");
  }
  const existing = await prisma.abonnementen.findMany({
    where: { bikepassID: pass.ID, ...(excludeSubscriptionId ? { NOT: { ID: excludeSubscriptionId } } : {}) },
    select: { subscriptiontypeID: true, ingangsdatum: true, afloopdatum: true, isActief: true, isBetaald: true },
  });
  if (existing.some((row) => sameFormOverlaps(row, form.ID, start, end))) {
    throw new AccountError("De gegeven ID is al gekoppeld aan een abonnement met dezelfde abonnementsvorm.");
  }
  if (choice.newPassName?.trim() && pass.PasID && pass.Pastype) {
    await setPassName({ PasID: pass.PasID, Pastype: pass.Pastype }, choice.newPassName.trim());
  }
  return pass.ID;
}

export async function paySubscription(accountId: string, subscriptionId: number, origin: string, prolongRef?: string) {
  const subscription = await prisma.abonnementen.findFirst({
    where: { ID: subscriptionId, ...(await ownedSubscription(accountId)) },
    select: { ID: true, externalID: true, isBetaald: true, prijsInclBtw: true, siteID: true, subscriptiontypeID: true, abonnementsvormen: true },
  });
  if (!subscription) throw new AccountError("Abonnement niet gevonden");
  if (subscription.isBetaald) throw new AccountError("Dit abonnement is al betaald");
  const openPayment = await prisma.financialtransactions.findFirst({
    where: {
      subscriptionID: subscription.ID,
      code: "betaling abonnement website",
      status: { in: ["open", "pending"] },
    },
    select: { ID: true },
  });
  if (openPayment) throw new AccountError("Er loopt al een betaling voor dit abonnement. Rond die eerst af of wacht tot de betaling is verlopen.");
  const form = subscription.abonnementsvormen;
  const price = Number(subscription.prijsInclBtw ?? form?.prijs ?? 0);
  const fee = await transactionFee();
  const council = subscription.siteID
    ? await prisma.contacts.findUnique({ where: { ID: subscription.siteID }, select: { CompanyName: true } })
    : null;
  const ref = await subscriptionRef(subscription);
  const txId = coldfusionUuid();
  await prisma.financialtransactions.create({
    data: {
      ID: txId,
      amount: price,
      transactiekosten: fee,
      transactionDate: new Date(),
      paymentMethod: "ideal",
      status: "open",
      description: "Betaling abonnement",
      code: "betaling abonnement website",
      accountID: accountId,
      paidToSiteID: "1",
      siteID: subscription.siteID,
      subscriptionID: subscription.ID,
      subscriptiontypeID: subscription.subscriptiontypeID,
    },
  });
  let payment;
  try {
    payment = await createIdealPayment({
      amount: price + fee,
      description: `Opwaardering stallingstegoed ${council?.CompanyName ?? ""} t.b.v. ${form?.naam ?? ""} (transactiekosten: E${fee.toFixed(2)})`,
      redirectUrl: `${origin}/account/abonnement/${ref}?transactionID=${txId}${prolongRef ? `&prolongId=${prolongRef}` : ""}`,
      webhookUrl: `${origin}/api/mollie/webhook`,
      transactionID: txId,
    });
  } catch (error) {
    throw new AccountError(error instanceof Error ? error.message : "Mollie-betaling mislukt");
  }
  await prisma.financialtransactions.update({ where: { ID: txId }, data: { mollieTransactionID: payment.id } });
  return { subscriptionRef: ref, checkoutUrl: payment.checkoutUrl, transactionID: txId };
}

async function refreshFromMollie(transactionId: string) {
  const transaction = await prisma.financialtransactions.findUnique({ where: { ID: transactionId } });
  if (!transaction) return null;
  if ((transaction.status === "open" || transaction.status === "pending") && transaction.mollieTransactionID) {
    const remote = await fetchMolliePayment(transaction.mollieTransactionID).catch(() => null);
    if (remote && remote.transactionID === transaction.ID && ledgerStatus(remote.status) !== transaction.status) {
      await applyMollieResult({ id: transaction.mollieTransactionID, status: remote.status, transactionID: transaction.ID });
      return prisma.financialtransactions.findUnique({ where: { ID: transactionId } });
    }
  }
  return transaction;
}

/** For when the webhook did not arrive and the citizen left the return page early. */
async function refreshOpenPayments(accountId: string) {
  const open = await prisma.financialtransactions.findMany({
    where: { accountID: accountId, status: { in: ["open", "pending"] }, mollieTransactionID: { not: null } },
    select: { ID: true },
  });
  for (const row of open) await refreshFromMollie(row.ID).catch(() => null);
}

export async function topupStatus(accountId: string, transactionId: string) {
  const owned = await prisma.financialtransactions.findFirst({ where: { ID: transactionId, accountID: accountId }, select: { ID: true } });
  if (!owned) return null;
  return (await refreshFromMollie(transactionId))?.status ?? null;
}

export async function subscriptionDocument(accountId: string, subscriptionId: number, transactionId?: string) {
  const where = { ID: subscriptionId, ...(await ownedSubscription(accountId)) };
  let paymentStatus: string | null = null;
  if (transactionId) {
    const owned = await prisma.abonnementen.findFirst({ where, select: { ID: true } });
    if (owned) {
      const transaction = await prisma.financialtransactions.findFirst({
        where: { ID: transactionId, subscriptionID: subscriptionId },
        select: { ID: true },
      });
      paymentStatus = transaction ? (await refreshFromMollie(transaction.ID))?.status ?? null : null;
    }
  }
  const row = await prisma.abonnementen.findFirst({
    where,
    omit: { sectionID: true },
    include: { abonnementsvormen: true, accounts_pasids: true },
  });
  if (!row) throw new AccountError("Abonnement niet gevonden");
  const links = row.subscriptiontypeID
    ? await prisma.abonnementsvorm_fietsenstalling.findMany({
        where: { SubscriptiontypeID: row.subscriptiontypeID },
        select: { fietsenstallingen: { select: { Title: true, Location: true } } },
      })
    : [];
  const council = row.siteID
    ? await prisma.contacts.findUnique({
        where: { ID: row.siteID },
        select: { CompanyName: true, Address1: true, Zip1: true, City1: true, btwNummer: true, kvkNummer: true, ThemeColor2: true },
      })
    : null;
  const price = Number(row.prijsInclBtw ?? 0);
  const vat = Math.round((price * VAT) / (100 + VAT) * 100) / 100;
  const pass = row.accounts_pasids;
  const startDay = row.ingangsdatum ? new Date(row.ingangsdatum.getFullYear(), row.ingangsdatum.getMonth(), row.ingangsdatum.getDate()) : null;
  return {
    name: row.abonnementsvormen?.naam ?? "",
    price,
    vat,
    vatPercentage: VAT,
    start: row.ingangsdatum,
    end: row.afloopdatum,
    dateCreated: row.dateCreated,
    startsToday: !startDay || startDay.getTime() === startOfToday().getTime(),
    invoice: String(row.ID).padStart(8, "0"),
    passType: isOvchipForm(row.abonnementsvormen?.idmiddelen) ? "OV-chipkaart" : "sleutelhanger",
    pass: pass
      ? {
          passId: pass.PasID,
          name: pass.Naam,
          displayName: passDisplayName(pass, true),
          temporary: pass.Pastype === "tijdelijk" || pass.Pastype === "tmp_sleutelhanger",
          tmpOvchip: pass.Pastype === "tijdelijk",
          tmpSleutelhanger: pass.Pastype === "tmp_sleutelhanger",
        }
      : null,
    stallings: links
      .map((link) => link.fietsenstallingen)
      .filter((stalling): stalling is NonNullable<typeof stalling> => Boolean(stalling?.Title))
      .map((stalling) => ({ title: stalling.Title ?? "", location: stalling.Location ?? "" })),
    council: {
      id: row.siteID ?? null,
      name: council?.CompanyName ?? "",
      address: council?.Address1 ?? "",
      zip: council?.Zip1 ?? "",
      city: council?.City1 ?? "",
      btw: council?.btwNummer ?? "",
      kvk: council?.kvkNummer ?? "",
      themeColor2: council?.ThemeColor2 || "96c11f",
    },
    fee: await transactionFee(),
    paid: row.isBetaald,
    active: Boolean(row.isActief),
    paymentStatus,
  };
}

async function ensureTemporaryPass(subscriptionId: number) {
  const row = await prisma.abonnementen.findUnique({
    where: { ID: subscriptionId },
    select: {
      ID: true,
      bikepassID: true,
      AccountID: true,
      siteID: true,
      abonnementsvormen: { select: { idmiddelen: true, bikeparkTypeID: true } },
    },
  });
  if (!row || row.bikepassID || !row.AccountID || !row.siteID) return;
  if (BUURT_TYPES.has(row.abonnementsvormen?.bikeparkTypeID ?? "")) return;
  const ovchip = isOvchipForm(row.abonnementsvormen?.idmiddelen);
  const council = await prisma.contacts.findUnique({ where: { ID: row.siteID }, select: { UrlName: true } });
  const prefix = (council?.UrlName?.[0] ?? "V").toUpperCase();
  const pastype = ovchip ? "tijdelijk" : "tmp_sleutelhanger";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pasId = ovchip ? `#${randomDigits(6)}` : `${prefix}${randomDigits(6)}${randomDigits(5)}`;
    const taken = await prisma.accounts_pasids.findFirst({ where: { SiteID: row.siteID, PasID: pasId, Pastype: pastype }, select: { ID: true } });
    if (taken) continue;
    const id = newId();
    await prisma.accounts_pasids.create({
      data: { ID: id, AccountID: await councilAccountId(row.AccountID, row.siteID), SiteID: row.siteID, PasID: pasId, Pastype: pastype, dateCreated: new Date() },
    });
    const linked = await prisma.abonnementen.updateMany({ where: { ID: row.ID, bikepassID: null }, data: { bikepassID: id } });
    if (linked.count === 0) {
      await prisma.accounts_pasids.delete({ where: { ID: id } }).catch(() => null);
      return;
    }
    return;
  }
}

function randomDigits(length: number): string {
  return String(Math.floor(Math.random() * 10 ** length)).padStart(length, "0");
}

const subscriptionRow = {
  ID: true,
  AccountID: true,
  subscriptiontypeID: true,
  afloopdatum: true,
  ingangsdatum: true,
  abonnementsvormen: { select: { naam: true, siteID: true } },
  accounts: { select: { Email: true, FirstName: true, MiddleName: true, LastName: true, Sex: true } },
} as const;

async function subscriptiontypeContext(subscriptiontypeID: number | null, siteID: string | null | undefined) {
  const [council, links] = await Promise.all([
    siteID ? prisma.contacts.findUnique({ where: { ID: siteID }, select: { CompanyName: true, Email1: true } }) : null,
    subscriptiontypeID
      ? prisma.abonnementsvorm_fietsenstalling.findMany({
          where: { SubscriptiontypeID: subscriptiontypeID },
          select: { fietsenstallingen: { select: { Title: true, Location: true } } },
        })
      : [],
  ]);
  const bikeparks = links
    .map((link) => link.fietsenstallingen)
    .filter((bikepark): bikepark is NonNullable<typeof bikepark> => Boolean(bikepark))
    .map((bikepark) => ({ title: bikepark.Title ?? "", location: bikepark.Location ?? "" }));
  return { councilName: council?.CompanyName ?? "", councilEmail: council?.Email1 ?? null, bikeparks };
}

function mailHost(): string {
  return new URL(mailOrigin()).host;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// LSDateFormat(..., "d-m-yyyy")
function shortDutchDate(value: Date | null | undefined): string {
  return value ? `${value.getDate()}-${value.getMonth() + 1}-${value.getFullYear()}` : "";
}

// LSNumberFormat(..., "__.__") in the Dutch locale.
function euroAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export async function runSubscriptionLifecycle(now = new Date(), accountId?: string) {
  const expired = await prisma.abonnementen.findMany({
    where: {
      type: "abonnement",
      isActief: true,
      isBetaald: true,
      afloopdatum: { lte: now },
      ...(accountId ? { AccountID: accountId } : {}),
      NOT: { abonnementsvormen: { bikeparkTypeID: { in: ["buurtstalling", "fietstrommel"] } } },
    },
    select: subscriptionRow,
  });
  let deactivated = 0;
  for (const row of expired) {
    try {
      const other = row.AccountID
        ? await prisma.abonnementen.count({
            where: {
              AccountID: row.AccountID,
              subscriptiontypeID: row.subscriptiontypeID,
              isActief: true,
              isBetaald: true,
              NOT: { ID: row.ID },
              afloopdatum: { gt: now },
            },
          })
        : 0;
      if (other === 0 && row.accounts) {
        const context = await subscriptiontypeContext(row.subscriptiontypeID, row.abonnementsvormen?.siteID);
        await sendAccountMail({
          account: row.accounts,
          councilId: row.abonnementsvormen?.siteID,
          subject: "Stallingsabonnement is verlopen",
          message: `<p>
Uw ${escapeHtml(row.abonnementsvormen?.naam ?? "")} voor stallingen in ${escapeHtml(context.councilName)} is op ${row.afloopdatum ? formatDutchDate(row.afloopdatum) : ""} verlopen.
</p>`,
        });
      }
      await prisma.abonnementen.update({ where: { ID: row.ID }, data: { isActief: false }, select: { ID: true } });
      deactivated += 1;
    } catch (error) {
      await sendOpsMail(
        `ERROR: ${mailHost()} - error bij cronjob verlopen abonnementen`,
        `error bij verwerken verlopen abonnement ${row.ID}<pre>${escapeHtml(error instanceof Error ? error.stack ?? error.message : String(error))}</pre>`,
      ).catch(() => undefined);
    }
  }
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const soon = await prisma.abonnementen.findMany({
    where: {
      type: "abonnement",
      isActief: true,
      isBetaald: true,
      afloopdatum: { gt: now, lt: horizon },
      OR: [{ emailNadertEinde: false }, { emailNadertEinde: null }],
      ...(accountId ? { AccountID: accountId } : {}),
      NOT: { abonnementsvormen: { bikeparkTypeID: { in: ["buurtstalling", "fietstrommel"] } } },
    },
    select: subscriptionRow,
  });
  let warned = 0;
  for (const row of soon) {
    try {
      const days = row.ingangsdatum && row.afloopdatum ? (row.afloopdatum.getTime() - row.ingangsdatum.getTime()) / 86400000 : 0;
      if (days < 14) {
        await prisma.abonnementen.update({ where: { ID: row.ID }, data: { emailNadertEinde: true }, select: { ID: true } });
        continue;
      }
      const other = row.AccountID
        ? await prisma.abonnementen.count({
            where: {
              AccountID: row.AccountID,
              subscriptiontypeID: row.subscriptiontypeID,
              isActief: true,
              NOT: { ID: row.ID },
              afloopdatum: { gt: row.afloopdatum ?? now },
            },
          })
        : 0;
      if (other === 0 && row.accounts && row.afloopdatum) {
        const context = await subscriptiontypeContext(row.subscriptiontypeID, row.abonnementsvormen?.siteID);
        const daysLeft = Math.floor((row.afloopdatum.getTime() - now.getTime()) / 86400000) + 1;
        const stopDate = new Date(row.afloopdatum.getTime() + 86400000);
        const bikeparks = context.bikeparks.map((bikepark) => `<div>${escapeHtml(bikepark.title)}</div>`).join("\n");
        await sendAccountMail({
          account: row.accounts,
          councilId: row.abonnementsvormen?.siteID,
          subject: "Uw abonnement verloopt binnenkort",
          message: `<p>
U bent momenteel in bezit van het product ${escapeHtml(row.abonnementsvormen?.naam ?? "")}.
Met dit abonnement kunt u bij de volgende stallingen in de ${escapeHtml(context.councilName)} stallen:<br />
</p>
<p>
${bikeparks}
</p>
<p>
Uw abonnement is nog ${daysLeft} dagen geldig.
Zonder verlenging zal het abonnement per ${formatDutchDate(stopDate)} automatisch worden stopgezet.
</p>
<p>
Wilt u verlengen? Dat kan via <a href="${mailOrigin()}/account?showForm=abonnementen">deze link</a>.
</p>`,
        });
        warned += 1;
      }
      await prisma.abonnementen.update({ where: { ID: row.ID }, data: { emailNadertEinde: true }, select: { ID: true } });
    } catch (error) {
      await sendOpsMail(
        `ERROR: ${mailHost()} - error cronjob bijna verlopen abonnementen `,
        `error bij verwerken bijna verlopen abonnement ${row.ID}<pre>${escapeHtml(error instanceof Error ? error.stack ?? error.message : String(error))}</pre>`,
      ).catch(() => undefined);
    }
  }
  await sendOpsMail(
    `LOG: ${mailHost()} - cronjob abonnementen`,
    `E-mail gestuurd naar ${expired.length} abonnementshouders wegens verlopen abonnement<br />
E-mail gestuurd naar ${soon.length} abonnementshouders wegens bijna verlopen abonnement<br />`,
  ).catch(() => undefined);
  const paidRows = await prisma.financialtransactions.findMany({
    where: { status: "ok", subscriptionID: { not: null } },
    select: { transactionDate: true, accountID: true, subscriptionID: true },
  });
  const paidIds = [...new Set(paidRows.map((row) => row.subscriptionID).filter((id): id is number => id !== null))];
  const notActivated = paidIds.length
    ? await prisma.abonnementen.findMany({ where: { isBetaald: false, ID: { in: paidIds } }, select: { ID: true, barcode: true } })
    : [];
  const barcodes = new Map(notActivated.map((row) => [row.ID, row.barcode]));
  const unpaid = paidRows.filter((row) => row.subscriptionID !== null && barcodes.has(row.subscriptionID));
  if (unpaid.length) {
    const rows = unpaid
      .map((row) => `<tr>
<td>${escapeHtml(row.accountID ?? "")}</td>
<td>${row.transactionDate ? `${formatDutchDate(row.transactionDate)} ${row.transactionDate.toTimeString().slice(0, 8)}` : ""}</td>
<td>${escapeHtml(barcodes.get(row.subscriptionID!) ?? "")}</td>
</tr>`)
      .join("\n");
    const accountIds = [...new Set(unpaid.map((row) => row.accountID).filter((id): id is string => Boolean(id)))];
    const history = await Promise.all(accountIds.map(async (id) => {
      const transactions = await prisma.financialtransactions.findMany({
        where: { accountID: id },
        orderBy: { transactionDate: "asc" },
        select: { ID: true, transactionDate: true, amount: true, code: true, status: true, description: true, subscriptionID: true },
      });
      const lines = transactions
        .map((t) => `<tr><td>${escapeHtml(t.ID)}</td><td>${t.transactionDate ? formatDutchDate(t.transactionDate) : ""}</td><td>${t.amount ?? ""}</td><td>${escapeHtml(t.code ?? "")}</td><td>${escapeHtml(t.status ?? "")}</td><td>${escapeHtml(t.description ?? "")}</td><td>${t.subscriptionID ?? ""}</td></tr>`)
        .join("");
      return `<h4>Financial transactions voor account ${escapeHtml(id)}</h4><table><tr><th>ID</th><th>transactionDate</th><th>amount</th><th>code</th><th>status</th><th>description</th><th>subscriptionID</th></tr>${lines}</table>`;
    }));
    await sendOpsMail(
      "ERROR: Betaald abonnement niet geactiveerd",
      `<table style="width: 800px;">
<tr>
<th style="text-align:left;">accountID</th>
<th style="text-align:left;">transactionDate</th>
<th style="text-align:left;">barcode</th>
</tr>
${rows}
</table>
${history.join("\n")}`,
    );
  }
  return { deactivated, warned, unpaid: notActivated.length };
}

export async function searchCitizenAccounts(query: string, siteId: string) {
  const term = query.trim();
  const linked = siteId === "1" ? null : await prisma.gemeenteaccounts.findMany({ where: { SiteID: siteId }, select: { AccountID: true } });
  const ids = linked?.map((row) => row.AccountID) ?? undefined;
  const rows = await prisma.accounts.findMany({
    where: {
      account_type: { not: "DELETED" },
      ...(ids ? { ID: { in: ids } } : {}),
      ...(term
        ? {
            OR: [
              { Email: { contains: term } },
              { LastName: { contains: term } },
              { FirstName: { contains: term } },
            ],
          }
        : {}),
    },
    orderBy: { LastName: "asc" },
    take: 50,
  });
  return rows.map(publicAccount);
}

export async function creditorAccounts(siteId: string) {
  const linked = siteId === "1" ? null : await prisma.gemeenteaccounts.findMany({ where: { SiteID: siteId }, select: { AccountID: true } });
  const rows = await prisma.accounts.findMany({
    where: {
      saldo: { lt: 0 },
      account_type: "USER",
      ...(linked ? { ID: { in: linked.map((row) => row.AccountID) } } : {}),
    },
    orderBy: { saldo: "asc" },
    take: 100,
  });
  return rows.map(publicAccount);
}

export async function operatorUpdateAccount(accountId: string, input: ProfileInput) {
  await updateProfile(accountId, input);
}

export async function operatorCreateAccount(input: { email: string; firstName: string; lastName: string; siteId: string }) {
  const created = await registerAccount({ email: input.email, password: newId().slice(0, 12), nieuwsbrief: false });
  await prisma.accounts.update({
    where: { ID: created.accountId },
    data: { FirstName: input.firstName, LastName: input.lastName },
  });
  await councilAccountId(created.accountId, input.siteId);
  return { accountId: created.accountId };
}

/** Beheer "Wachtwoordlink sturen" and the mail after beheer creates an account. */
export async function operatorMailPasswordLink(accountId: string, siteId: string, origin: string) {
  const account = await requireUser(accountId);
  if (!account.Email) throw new AccountError("Dit account heeft geen e-mailadres");
  await mailPasswordLink({ ...account, Email: account.Email }, origin, siteId === "1" ? undefined : siteId);
}

export async function restituteSaldo(accountId: string, amount: number, exploitantId: string, siteId: string) {
  if (!(amount > 0)) throw new AccountError("Restituties kunnen niet negatief zijn.");
  await prisma.$transaction(async (tx) => {
    const accountRows = await tx.$queryRaw<{ stallingstegoed: unknown }[]>`
      SELECT stallingstegoed FROM vw_stallingstegoeden WHERE accountID = ${accountId} LIMIT 1
    `;
    const accountBalance = accountRows[0] ? Number(accountRows[0].stallingstegoed ?? 0) : 0;
    const operatorRows = await tx.$queryRaw<{ amount: unknown }[]>`
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM financialtransactions
      WHERE accountID = ${accountId}
        AND (
          paidToSiteID = ${exploitantId}
          OR paidBySiteID = ${exploitantId}
          OR sourceSiteID = ${exploitantId}
        )
        AND siteID = ${siteId}
    `;
    const operatorBalance = Number(operatorRows[0]?.amount ?? 0);
    if (!(accountBalance >= amount || operatorBalance >= amount)) {
      throw new AccountError("Deze registrant heeft niet genoeg stallingstegoed om deze restitutie te verwerken.");
    }
    await tx.financialtransactions.create({
      data: {
        ID: coldfusionUuid(),
        amount: -amount,
        transactionDate: new Date(),
        status: "ok",
        description: "Restitutie stallingstegoed",
        code: "restitutie in stalling",
        accountID: accountId,
        paidBySiteID: exploitantId,
        siteID: siteId,
      },
    });
  });
  await recalculateSaldo(accountId);
  await settleOperatorBalances(accountId);
}

export async function saveProduct(input: { id?: number; titel: string; omschrijving: string; prijs: number; credit: number; status: string }) {
  const data = {
    titel: input.titel,
    omschrijving: input.omschrijving,
    prijs: input.prijs,
    credit: input.credit,
    status: input.status,
  };
  if (input.id) return prisma.producten.update({ where: { ID: input.id }, data });
  return prisma.producten.create({ data });
}

export async function listAllProducts() {
  return prisma.producten.findMany({ orderBy: { ID: "asc" } });
}

/** fms/secure/producten/actions.cfm `delete`: deleteProduct removes the row. */
export async function deleteProduct(id: number) {
  const deleted = await prisma.producten.deleteMany({ where: { ID: id } });
  if (deleted.count === 0) throw new AccountError("Product niet gevonden");
}

/** The beheer search in fms/secure/saldo (accounts_Utility.getSearchResults): paying USER accounts of a municipality, by e-mail or pass number. */
export async function searchSaldoAccounts(searchKey: string, siteId: string) {
  const term = searchKey.trim();
  if (!term) return [];
  const numeric = /^\d+$/.test(term);
  const scoped = siteId !== "1";
  const links = scoped ? await prisma.gemeenteaccounts.findMany({ where: { SiteID: siteId }, select: { ID: true, AccountID: true } }) : null;
  let candidateIds: string[];
  if (numeric) {
    const passes = await prisma.accounts_pasids.findMany({
      where: { PasID: { contains: term }, ...(links ? { AccountID: { in: links.map((link) => link.ID) } } : {}) },
      select: { AccountID: true },
      take: 200,
    });
    const owners = await Promise.all(passes.map((pass) => passTopAccountId(pass.AccountID)));
    candidateIds = [...new Set(owners.filter((id): id is string => Boolean(id)))];
  } else {
    const accounts = await prisma.accounts.findMany({
      where: { Email: { contains: term }, ...(links ? { ID: { in: links.map((link) => link.AccountID) } } : {}) },
      select: { ID: true },
      take: 200,
    });
    candidateIds = accounts.map((row) => row.ID);
  }
  if (candidateIds.length === 0) return [];
  const paying = await prisma.financialtransactions.findMany({
    where: { accountID: { in: candidateIds }, ...(scoped ? { siteID: siteId } : {}) },
    select: { accountID: true },
    distinct: ["accountID"],
  });
  const payingIds = paying.map((row) => row.accountID).filter((id): id is string => Boolean(id));
  const rows = await prisma.accounts.findMany({
    where: { ID: { in: payingIds }, account_type: "USER" },
    orderBy: [{ Email: "asc" }, { LastName: "asc" }],
    take: 50,
  });
  return Promise.all(rows.map(async (row) => {
    const passes = await prisma.accounts_pasids.findMany({ where: await ownedPasses(row.ID), select: { PasID: true, Pastype: true } });
    return { ...publicAccount(row), passes: passes.map((pass) => ({ pasId: pass.PasID, type: pass.Pastype })) };
  }));
}

/** Beheer rights on a subscription form: the municipality or operator that owns it, or Fietsberaad. */
async function managedForm(formId: number, siteId: string) {
  const form = await prisma.abonnementsvormen.findUnique({ where: { ID: formId } });
  if (!form || (siteId !== "1" && form.siteID !== siteId && form.exploitantSiteID !== siteId)) {
    throw new AccountError("Abonnementsvorm niet gevonden");
  }
  return form;
}

/** Throws unless the account belongs to the municipality (gemeenteaccounts), Fietsberaad sees all. */
export async function assertManagedAccount(accountId: string, siteId: string) {
  if (siteId === "1") return;
  const link = await prisma.gemeenteaccounts.findFirst({ where: { AccountID: accountId, SiteID: siteId }, select: { ID: true } });
  if (!link) throw new AccountError("Account niet gevonden");
}

/**
 * `fms/secure/abonnementen/abonnementen/list.cfm`: paid subscriptions outside buurtstallingen and fietstrommels,
 * newest first. Search on pass ID, pass name or e-mail. `runningOnly` is "Toon alle resultaten": running ones, no limit.
 */
export async function listManagedSubscriptions(
  siteId: string,
  options: { search?: string; runningOnly?: boolean } = {},
) {
  const search = options.search?.trim();
  const rows = await prisma.abonnementen.findMany({
    where: {
      type: "abonnement",
      isBetaald: true,
      abonnementsvormen: { is: { bikeparkTypeID: { notIn: ["buurtstalling", "fietstrommel"] } } },
      ...(siteId === "1" ? {} : { OR: [{ siteID: siteId }, { exploitantID: siteId }] }),
      ...(options.runningOnly ? { afloopdatum: { gt: new Date() } } : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { accounts_pasids: { is: { PasID: { contains: search } } } },
                  { accounts_pasids: { is: { Naam: { contains: search } } } },
                  { accounts: { is: { Email: { contains: search } } } },
                ],
              },
            ],
          }
        : {}),
    },
    omit: { sectionID: true },
    include: {
      abonnementsvormen: { select: { naam: true } },
      accounts: { select: { Email: true } },
      accounts_pasids: { select: { PasID: true, Pastype: true, Naam: true } },
    },
    orderBy: { dateCreated: "desc" },
    ...(options.runningOnly ? {} : { take: 100 }),
  });

  const payments = rows.length
    ? await prisma.financialtransactions.findMany({
        where: { subscriptionID: { in: rows.map((r) => r.ID) }, status: "ok", mollieTransactionID: { not: null } },
        select: { subscriptionID: true, mollieTransactionID: true, paymentMethod: true },
      })
    : [];
  const paymentBySubscription = new Map(payments.map((p) => [p.subscriptionID, p]));
  return rows.map((row) => ({
    ...row,
    mollieTransactionID: paymentBySubscription.get(row.ID)?.mollieTransactionID ?? null,
    paymentMethod: paymentBySubscription.get(row.ID)?.paymentMethod ?? null,
  }));
}

/** actions.cfm PlusPlus: +1 on a digit string of any length (numbers above 17 digits lose precision as Number). */
function incrementDigits(value: string): string {
  const digits = value.split("");
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== "9") {
      digits[index] = String(Number(digits[index]) + 1);
      return digits.join("");
    }
    digits[index] = "0";
  }
  return `1${digits.join("")}`;
}

function beheerDay(value: string, label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  if (!date || Number.isNaN(date.getTime())) throw new AccountError(`${label} is geen geldige datum`);
  return date;
}

/** service.getBikepassByPassId(createNewBikepassIfNotExistent=true), linked to the account's council account when given. */
async function managedPass(passID: string, councilId: string, pastype: string, accountId: string | null): Promise<string> {
  const existing = await prisma.accounts_pasids.findFirst({ where: { SiteID: councilId, PasID: passID }, select: { ID: true } });
  if (existing) {
    if (accountId) await prisma.accounts_pasids.update({ where: { ID: existing.ID }, data: { AccountID: await councilAccountId(accountId, councilId) } });
    return existing.ID;
  }
  let owner = accountId;
  if (!owner) {
    owner = coldfusionUuid();
    await prisma.accounts.create({ data: { ID: owner, account_type: "SYSTEM", Status: "1", DateRegistration: new Date() } });
  }
  const id = newId();
  await prisma.accounts_pasids.create({
    data: { ID: id, AccountID: await councilAccountId(owner, councilId), SiteID: councilId, PasID: passID, Pastype: pastype, dateCreated: new Date() },
  });
  return id;
}

type LedgerForm = { ID: number; naam: string | null; siteID: string | null; exploitantSiteID: string | null };

/**
 * The two financialtransactions rows beheer books for a subscription (actions.cfm createFinancialTransaction / update):
 * the payment to or refund by the operator, and the matching `abonnement` row, so the account balance nets to zero.
 */
async function bookManagedSubscription(subscription: { ID: number; AccountID: string | null }, form: LedgerForm, amount: number, mode: "create" | "update") {
  if (amount === 0) return;
  const refund = amount < 0;
  const common = {
    transactionDate: new Date(),
    status: "ok",
    btwPercentage: VAT,
    accountID: subscription.AccountID,
    siteID: form.siteID,
    subscriptionID: subscription.ID,
    subscriptiontypeID: form.ID,
  };
  await prisma.financialtransactions.createMany({
    data: [
      {
        ...common,
        ID: coldfusionUuid(),
        amount,
        code: refund ? "restitutie abonnement exploitant" : "betaling abonnement exploitant",
        description: mode === "create" ? "Betaling abonnement" : null,
        ...(refund ? { paidBySiteID: form.exploitantSiteID } : { paidToSiteID: form.exploitantSiteID }),
      },
      {
        ...common,
        ID: coldfusionUuid(),
        amount: -amount,
        code: "abonnement",
        description: refund ? "Restitutie abonnement" : form.naam,
        sourceSiteID: form.exploitantSiteID,
        targetSiteID: form.exploitantSiteID,
      },
    ],
  });
  if (subscription.AccountID) await recalculateSaldo(subscription.AccountID);
}

/** fms/secure/abonnementen/abonnementen/actions.cfm `create`. */
export async function createManagedSubscriptions(input: {
  siteId: string;
  accountId?: string | null;
  formId: number;
  start: string;
  end: string;
  cost?: number | null;
  passNumber?: string;
  bikepassId?: string;
  barcode?: string;
  count?: number;
}) {
  const errors: string[] = [];
  const form = await managedForm(input.formId, input.siteId);
  const councilId = form.siteID ?? input.siteId;
  const count = Number.isFinite(input.count) && (input.count ?? 0) > 0 ? Math.floor(input.count!) : 1;
  let start: Date | null = null;
  let end: Date | null = null;
  try { start = beheerDay(input.start, "Aanvangsdatum"); } catch (error) { errors.push((error as Error).message); }
  try { end = new Date(beheerDay(input.end, "Afloopdatum").getTime() - 1000); } catch (error) { errors.push((error as Error).message); }
  const passNumber = (input.passNumber ?? "").replace(/\s/g, "");
  if (count > 10) errors.push("Ongeldige range sleutelhangers: er kunnen maximaal 10 abonnementen tegelijk worden aangemaakt");
  if (count > 1 && !/^\d+$/.test(passNumber)) errors.push("Pasnummer moet numeriek zijn als je meer dan 1 abonnement wilt aanmaken");
  const barcode = (input.barcode ?? "").trim();
  if (barcode.length > 12) errors.push("Een barcode heeft maximaal 12 tekens");
  if (!passNumber && barcode) {
    const taken = await prisma.abonnementen.findFirst({ where: { barcode }, select: { ID: true } });
    if (taken) errors.push(`Abonnement met barcode ${barcode} bestaat al`);
  }
  const accountId = input.accountId?.trim() || null;
  if (accountId) {
    if (!(await prisma.accounts.findUnique({ where: { ID: accountId }, select: { ID: true } }))) errors.push("Account niet gevonden");
  } else if (!passNumber && !input.bikepassId) {
    errors.push("Kies een account of een pas");
  }
  if (input.bikepassId) {
    const pass = await prisma.accounts_pasids.findUnique({ where: { ID: input.bikepassId }, select: { SiteID: true } });
    if (!pass || (input.siteId !== "1" && pass.SiteID !== councilId)) errors.push("Pas niet gevonden");
  }
  if (errors.length || !start || !end) throw new AccountError(errors.join(" "));

  const cost = input.cost !== null && input.cost !== undefined && Number.isFinite(input.cost) ? input.cost : Number(form.prijs ?? 0);
  let pastype = (form.idmiddelen ?? "").split(",")[0]?.trim() || "sleutelhanger";
  if (pastype === "ovchip" || pastype === "ovchipmetcode") pastype = "tijdelijk";
  const ids: number[] = [];
  const withPass = Boolean(passNumber || input.bikepassId);
  let nextPass = passNumber;
  for (let index = 0; index < (withPass ? count : 1); index += 1) {
    const bikepassID = input.bikepassId ?? (passNumber ? await managedPass(nextPass, councilId, pastype, accountId) : null);
    const owner = accountId ?? (bikepassID
      ? await passTopAccountId((await prisma.accounts_pasids.findUnique({ where: { ID: bikepassID }, select: { AccountID: true } }))?.AccountID ?? null)
      : null);
    const created = await prisma.abonnementen.create({
      data: {
        externalID: coldfusionUuid(),
        AccountID: owner,
        subscriptiontypeID: form.ID,
        ingangsdatum: start,
        afloopdatum: end,
        prijsInclBtw: cost,
        bikepassID,
        barcode: !withPass && barcode ? barcode : null,
        siteID: councilId,
        exploitantID: form.exploitantSiteID,
        isActief: true,
        isBetaald: true,
        emailNadertEinde: false,
        type: "abonnement",
        dateCreated: new Date(),
      },
      select: { ID: true, AccountID: true },
    });
    await bookManagedSubscription(created, form, cost, "create");
    ids.push(created.ID);
    if (count > 1) nextPass = incrementDigits(nextPass);
  }
  return ids;
}

/** fms/secure/abonnementen/abonnementen/actions.cfm `update`. `extraCost` is added to the cost and booked as payment or refund. */
export async function updateManagedSubscription(input: {
  siteId: string;
  id: number;
  start: string;
  end: string;
  extraCost?: number | null;
  bikepass: "" | "new_temp_pass" | string;
}) {
  const subscription = await prisma.abonnementen.findUnique({
    where: { ID: input.id },
    select: { ID: true, AccountID: true, bikepassID: true, siteID: true, exploitantID: true, prijsInclBtw: true, subscriptiontypeID: true },
  });
  if (!subscription?.subscriptiontypeID) throw new AccountError("Abonnement niet gevonden");
  if (input.siteId !== "1" && subscription.siteID !== input.siteId && subscription.exploitantID !== input.siteId) {
    throw new AccountError("Abonnement niet gevonden");
  }
  const form = await prisma.abonnementsvormen.findUnique({ where: { ID: subscription.subscriptiontypeID } });
  if (!form) throw new AccountError("Abonnementsvorm niet gevonden");
  const errors: string[] = [];
  let start: Date | null = null;
  let end: Date | null = null;
  try { start = beheerDay(input.start, "Aanvangsdatum"); } catch (error) { errors.push((error as Error).message); }
  try { end = beheerDay(input.end, "Afloopdatum"); } catch (error) { errors.push((error as Error).message); }

  const data: { ingangsdatum?: Date; afloopdatum?: Date; bikepassID?: string | null; AccountID?: string | null; prijsInclBtw?: number } = {};
  const currentOwner = subscription.bikepassID
    ? await passTopAccountId((await prisma.accounts_pasids.findUnique({ where: { ID: subscription.bikepassID }, select: { AccountID: true } }))?.AccountID ?? null)
    : null;
  if (input.bikepass === "new_temp_pass" || input.bikepass === "") {
    if (subscription.bikepassID) {
      await prisma.accounts_pasids.update({ where: { ID: subscription.bikepassID }, data: { dateLastSubscriptionUpdate: new Date() } });
      data.AccountID = currentOwner ?? subscription.AccountID;
      data.bikepassID = null;
    }
  } else if (input.bikepass !== subscription.bikepassID) {
    const pass = await prisma.accounts_pasids.findUnique({ where: { ID: input.bikepass }, select: { ID: true, SiteID: true } });
    if (!pass || (input.siteId !== "1" && pass.SiteID !== (form.siteID ?? input.siteId))) errors.push("Pas niet gevonden");
    else data.bikepassID = pass.ID;
  }
  if (errors.length || !start || !end) throw new AccountError(errors.join(" "));
  data.ingangsdatum = start;
  data.afloopdatum = end;
  const extra = input.extraCost !== null && input.extraCost !== undefined && Number.isFinite(input.extraCost) ? input.extraCost : 0;
  if (extra !== 0) data.prijsInclBtw = Number(subscription.prijsInclBtw ?? 0) + extra;
  const updated = await prisma.abonnementen.update({ where: { ID: subscription.ID }, data, select: { ID: true, AccountID: true } });
  await bookManagedSubscription(updated, form, extra, "update");
  if (input.bikepass === "new_temp_pass") await ensureTemporaryPass(subscription.ID);
  return updated.ID;
}

async function subscriptionLedgerDebitExists(subscriptionId: number): Promise<boolean> {
  const row = await prisma.financialtransactions.findFirst({
    where: { subscriptionID: subscriptionId, code: "abonnement", status: "ok" },
    select: { ID: true },
  });
  return Boolean(row);
}

async function activatePaidSubscription(subscriptionId: number) {
  const subscription = await prisma.abonnementen.findUnique({
    where: { ID: subscriptionId },
    omit: { sectionID: true },
    include: { abonnementsvormen: true, accounts: true },
  });
  if (!subscription) return;
  const activated = await prisma.abonnementen.updateMany({
    where: { ID: subscriptionId, isBetaald: false },
    data: { isActief: true, isBetaald: true },
  });
  const firstActivation = activated.count > 0;
  if (!firstActivation) {
    const paid = await prisma.abonnementen.findUnique({ where: { ID: subscriptionId }, select: { isBetaald: true } });
    if (!paid?.isBetaald) return;
  }
  await ensureTemporaryPass(subscription.ID);
  if (await subscriptionLedgerDebitExists(subscriptionId)) {
    if (subscription.AccountID) await recalculateSaldo(subscription.AccountID);
    return;
  }
  const price = Number(subscription.prijsInclBtw ?? subscription.abonnementsvormen?.prijs ?? 0);
  await prisma.financialtransactions.create({
    data: {
      ID: coldfusionUuid(),
      amount: -price,
      transactionDate: new Date(),
      status: "ok",
      description: subscription.abonnementsvormen?.naam ?? "Abonnement",
      code: "abonnement",
      accountID: subscription.AccountID,
      sourceSiteID: "1",
      targetSiteID: subscription.exploitantID,
      siteID: subscription.siteID,
      subscriptionID: subscription.ID,
      subscriptiontypeID: subscription.subscriptiontypeID,
    },
  });
  if (subscription.AccountID) await recalculateSaldo(subscription.AccountID);
  if (firstActivation && subscription.accounts) {
    const form = subscription.abonnementsvormen;
    const context = await subscriptiontypeContext(subscription.subscriptiontypeID, form?.siteID);
    const exploitantId = form?.exploitantSiteID ?? subscription.exploitantID;
    const cc = exploitantId
      ? (await prisma.contacts.findUnique({ where: { ID: exploitantId }, select: { Email1: true } }))?.Email1
      : context.councilEmail;
    await sendAccountMail({
      account: subscription.accounts,
      councilId: form?.siteID,
      cc,
      subject: "Uw stallingsabonnement",
      message: await subscriptionConfirmationMessage(subscription.ID, price, context.bikeparks),
    });
  }
}

// remote/customtags/email_abonnement.cfm, stalling branch (no locker place).
async function subscriptionConfirmationMessage(subscriptionId: number, cost: number, bikeparks: { title: string }[]): Promise<string> {
  const row = await prisma.abonnementen.findUnique({
    where: { ID: subscriptionId },
    select: {
      ID: true,
      externalID: true,
      dateCreated: true,
      ingangsdatum: true,
      afloopdatum: true,
      abonnementsvormen: { select: { naam: true, idmiddelen: true } },
      accounts_pasids: { select: { PasID: true, Naam: true, Pastype: true } },
    },
  });
  if (!row) return "";
  const passType = (row.abonnementsvormen?.idmiddelen ?? "").toLowerCase().includes("ovchip") ? "OV-chipkaart" : "sleutelhanger";
  const vat = Math.round((cost * VAT) / (100 + VAT) * 100) / 100;
  const created = row.dateCreated
    ? `${String(row.dateCreated.getDate()).padStart(2, "0")}.${String(row.dateCreated.getMonth() + 1).padStart(2, "0")}.${row.dateCreated.getFullYear()}`
    : "";
  const origin = mailOrigin();
  const ref = await subscriptionRef(row);
  const linkToPdf = `${origin}/api/account/document?abonnement=${encodeURIComponent(ref)}`;
  const linkToMyPage = `${origin}/account?showForm=abonnementen`;
  const head = `<div>
<p>
U heeft zojuist via de website veiligstallen.nl het volgende product aangeschaft:
</p>
<p>
1x ${escapeHtml(row.abonnementsvormen?.naam ?? "")} voor &euro; ${euroAmount(cost)} (BTW ${VAT}% &euro; ${euroAmount(vat)})
</p>
<p>
Kenmerk: ${created} - ${String(row.ID).padStart(8, "0")}
</p>
<p>
Dit abonnement is geldig van ${shortDutchDate(row.ingangsdatum)} tot ${shortDutchDate(row.afloopdatum)}.
</p>
<p>
Met dit abonnement kunt u stallen in:
<ul>
${bikeparks.map((bikepark) => `<li>
<strong>${escapeHtml(bikepark.title)}</strong>
</li>`).join("\n")}
</ul>
</p>
</div>`;
  const pass = row.accounts_pasids;
  if (!pass) return head;
  const temporary = pass.Pastype === "tijdelijk" || pass.Pastype === "tmp_sleutelhanger";
  if (!temporary) {
    return `${head}
<p>
Het abonnement is gekoppeld aan ${passType}: ${escapeHtml(bikepassDisplayName(pass))}
</p>`;
  }
  return `${head}
<div>
<h2>Direct activeren</h2>
<p>
Als u al in het bezit bent van een sleutelhanger met barcode, dan kunt u het abonnement op
de pagina <a href="${linkToMyPage}">Mijn gegevens</a> direct koppelen aan deze sleutelhanger.<br />
<span style="font-size:80%;">(Dit is een automatisch gegenereerde mail. Het kan zijn dat u uw sleutelhanger inmiddels al gekoppeld heeft.)</span>
</p>
<h2>Activeren in de stalling</h2>
<p>
Heeft u nog geen ${passType}, dan kunt u het abonnement activeren in de stalling.
</p>
<p>
Klik <a href="${linkToPdf}">hier</a> om een document te openen met daarin een <strong>streepjescode</strong>. Druk dit document af
en neem de afdruk mee naar de stalling.<br />
Daar zal uw abonnement aan een ${passType} gekoppeld worden waarmee u de stalling binnen kunt komen.
</p>
<p>
Als u geen printer heeft, noteer dan de volgende code: <strong>${escapeHtml(pass.PasID.replace(/#/g, ""))}</strong>, en neem deze mee naar de stalling.
</p>
</div>`;
}

/** FinancialGateway.getStallingstegoedForAccount: the view total, or 0 when the account has no row. */
export async function recalculateSaldo(accountId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ stallingstegoed: unknown }[]>`
    SELECT stallingstegoed FROM vw_stallingstegoeden WHERE accountID = ${accountId} LIMIT 1
  `;
  const total = rows[0] ? Number(rows[0].stallingstegoed ?? 0) : 0;
  await prisma.accounts.update({
    where: { ID: accountId },
    data: { saldo: total, dateLastSaldoUpdate: new Date() },
  });
  return total;
}

function asDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** FinancialGateway.getStallingstegoedFietsberaadForAccount. */
async function fietsberaadCredit(accountId: string): Promise<number> {
  const paidByFietsberaad = await prisma.$queryRaw<{ amount: unknown }[]>`
    SELECT COALESCE(SUM(amount), 0) AS amount
    FROM financialtransactions
    WHERE accountID = ${accountId}
      AND (paidToSiteID = '1' OR sourceSiteID = '1' OR paidBySiteID = '1')
      AND status = 'ok'
  `;
  const paidToFietsberaad = await prisma.$queryRaw<{ amount: unknown }[]>`
    SELECT COALESCE(SUM(amount), 0) AS amount
    FROM financialtransactions
    WHERE accountID = ${accountId}
      AND targetSiteID = '1'
      AND status = 'ok'
  `;
  return Number(paidByFietsberaad[0]?.amount ?? 0) - Number(paidToFietsberaad[0]?.amount ?? 0);
}

/** saveFinancialTransaction for one overboeking row: amount is not zero, then recalculate the account balance. */
async function saveOverboeking(accountId: string, booking: OverboekingBooking) {
  if (booking.amount === 0) return;
  await prisma.financialtransactions.create({
    data: {
      ID: coldfusionUuid(),
      amount: booking.amount,
      btw: booking.btw,
      btwPercentage: booking.btwPercentage,
      transactionDate: new Date(),
      status: booking.status,
      code: booking.code,
      accountID: accountId,
      sourceSiteID: booking.sourceSiteID,
      targetSiteID: booking.targetSiteID,
      siteID: booking.siteID,
    },
  });
  await recalculateSaldo(accountId);
}

/** BikeparkAccount.overboeken(). */
export async function settleOperatorBalances(accountId: string) {
  const rows = await prisma.$queryRaw<{
    siteID: string;
    exploitantID: string;
    stallingstegoed: unknown;
    dateLastTransaction: Date | string | null;
  }[]>`
    SELECT siteID, exploitantID, stallingstegoed, dateLastTransaction
    FROM vw_stallingstegoedenexploitant
    WHERE accountID = ${accountId}
  `;
  const saldos: ExploitantSaldoRow[] = rows.map((row) => ({
    siteID: row.siteID,
    exploitantID: row.exploitantID,
    stallingstegoed: Number(row.stallingstegoed ?? 0),
    dateLastTransaction: asDate(row.dateLastTransaction),
  }));
  for (const booking of positiveOverboekingen(saldos)) {
    await saveOverboeking(accountId, booking);
  }
  const credit = await fietsberaadCredit(accountId);
  for (const booking of deficitOverboekingen(saldos, credit)) {
    await saveOverboeking(accountId, booking);
  }
}

/**
 * fms/remote/cronjobs/overboeken.cfm: at most 10 view rows with a non-zero operator balance,
 * newest dateLastTransaction first, then overboeken() per row. A missing account is skipped.
 * A later error does not drop the rest of the batch.
 */
export async function runOverboekenCatchUp(): Promise<{
  processed: string[];
  skipped: string[];
  errors: { accountId: string; message: string }[];
}> {
  const rows = await prisma.$queryRawUnsafe<{ accountID: string | null }[]>(OVERBOEKEN_CATCH_UP_SQL);
  return runCatchUpRows(
    rows,
    async (accountId) => (await prisma.accounts.findUnique({ where: { ID: accountId }, select: { ID: true } })) !== null,
    (accountId) => settleOperatorBalances(accountId),
  );
}

async function requireUser(accountId: string) {
  const account = await prisma.accounts.findUnique({ where: { ID: accountId } });
  if (!account || account.account_type === "DELETED") throw new AccountError("Account niet gevonden");
  return account;
}

function publicAccount(account: {
  ID: string;
  Email: string | null;
  FirstName: string | null;
  LastName: string | null;
  saldo: unknown;
  City: string | null;
}) {
  return {
    id: account.ID,
    email: account.Email,
    firstName: account.FirstName,
    lastName: account.LastName,
    city: account.City,
    saldo: account.saldo === null ? 0 : Number(account.saldo),
  };
}

function temporaryPassCode(): string {
  return String(Math.floor(10000000 + Math.random() * 89999999));
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function formatDutchDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${value.getFullYear()}`;
}
