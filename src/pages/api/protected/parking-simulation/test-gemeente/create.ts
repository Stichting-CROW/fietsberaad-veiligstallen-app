import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { formatPrismaErrorCompact, logPrismaError } from "~/utils/formatPrismaError";
import { generateID } from "~/utils/server/database-tools";
import { createSecurityUsersSiteRecord } from "~/utils/server/user-sync-tools";
import { VSContactItemType } from "~/types/contacts";
import { VSUserRoleValuesNew } from "~/types/users";
import { env } from "~/env.mjs";
import {
  TESTGEMEENTE_NAME,
  CONTACT,
  COORDINATES,
  MODULES,
  FMS_PERMIT,
  STALLINGS,
  STALLING_BASE,
  SECTIES,
  STALLING_DATA_BY_TARGET,
} from "~/data/testgemeente-data";

const UTRECHT_ID = "E1991A95-08EF-F11D-FF946CE1AA0578FB";

function stallingCoords(index: number): string {
  const { centerLat, centerLon, radiusMeters, stallingsCount } = COORDINATES;
  const angleDeg = index * (360 / stallingsCount);
  const angleRad = (angleDeg * Math.PI) / 180;
  const lat = centerLat + (radiusMeters / 111320) * Math.cos(angleRad);
  const lon =
    centerLon +
    (radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180))) *
      Math.sin(angleRad);
  return `${lat}, ${lon}`;
}

function isoTimeToDate(s: string): Date {
  return new Date(s);
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Geen rechten voor deze actie" });
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const existing = await prisma.contacts.findFirst({
      where: {
        CompanyName: TESTGEMEENTE_NAME,
        ItemType: VSContactItemType.Organizations,
      },
    });
    if (existing) {
      return res.status(400).json({
        error: "Test gemeente bestaat al",
        id: existing.ID,
      });
    }

    const contactId = generateID();

    await prisma.$transaction(
      async (tx) => {
        const contactPassword = env.FMS_TEST_PASS ?? undefined;
        await tx.contacts.create({
          data: {
            ID: contactId,
            ...CONTACT,
            Coordinaten: `${COORDINATES.centerLat}, ${COORDINATES.centerLon}`,
            ...(contactPassword && { Password: contactPassword }),
          },
        });

        const fietsberaadUsers = await tx.user_contact_role.findMany({
        where: {
          ContactID: "1",
          NewRoleID: VSUserRoleValuesNew.RootAdmin,
        },
        select: { UserID: true, NewRoleID: true },
      });

      const userIdsToAdd = new Set(fietsberaadUsers.map((u) => u.UserID));
      // Ensure the creating user gets access even if not in fietsberaadUsers (e.g. different role structure)
      if (session.user.id) {
        userIdsToAdd.add(session.user.id);
      }

      for (const userId of userIdsToAdd) {
        const fbuser = fietsberaadUsers.find((u) => u.UserID === userId);
        await tx.user_contact_role.create({
          data: {
            ID: generateID(),
            UserID: userId,
            ContactID: contactId,
            NewRoleID: fbuser?.NewRoleID ?? VSUserRoleValuesNew.RootAdmin,
            isOwnOrganization: false,
          },
        });
      }

      const utrechtModules = await tx.modules_contacts.findMany({
        where: { SiteID: UTRECHT_ID },
        select: { ModuleID: true },
      });
      const modules =
        utrechtModules.length > 0
          ? utrechtModules.map((m) => m.ModuleID)
          : MODULES.default;
      for (const moduleId of modules) {
        await tx.modules_contacts.create({
          data: { ModuleID: moduleId, SiteID: contactId },
        });
      }

      await tx.fmsservice_permit.create({
        data: {
          Permit: FMS_PERMIT.Permit,
          OperatorID: contactId,
          SiteID: contactId,
          BikeparkID: FMS_PERMIT.BikeparkID,
        },
      });

      const utrechtDocumentTemplates = await tx.documenttemplates.findMany({
        where: { siteID: UTRECHT_ID },
      });
      for (const dt of utrechtDocumentTemplates) {
        const html = dt.html?.replace(/Gemeente Utrecht/gi, TESTGEMEENTE_NAME) ?? dt.html;
        await tx.documenttemplates.create({
          data: {
            ID: generateID(),
            name: dt.name,
            html,
            EditorModified: dt.EditorModified,
            dateCreated: dt.dateCreated,
            siteID: contactId,
            dateModified: dt.dateModified,
          },
        });
      }

      const utrechtReportSettings = await tx.contact_report_settings.findMany({
        where: { siteID: UTRECHT_ID },
      });
      for (const rs of utrechtReportSettings) {
        await tx.contact_report_settings.create({
          data: {
            siteID: contactId,
            contactID: contactId,
            report: rs.report,
            querystring: rs.querystring,
            dateCreated: rs.dateCreated,
          },
        });
      }

      for (let i = 0; i < STALLINGS.length; i++) {
        const stalling = STALLINGS[i]!;
        const stallingId = generateID();
        const coords = stallingCoords(stalling.coordsIndex);

        const templateData = STALLING_DATA_BY_TARGET[stalling.stallingsId];
        if (templateData) {
          const u = templateData;
          const f = u.fietsenstallingen;
          await tx.fietsenstallingen.create({
            data: {
              ID: stallingId,
              StallingsID: stalling.stallingsId,
              StallingsIDExtern: stalling.stallingsId,
              SiteID: contactId,
              ExploitantID: contactId,
              Title: stalling.title,
              Postcode: STALLING_BASE.Postcode,
              Plaats: STALLING_BASE.Plaats,
              Coordinaten: coords,
              Location: f.Location,
              Description: f.Description,
              Image: f.Image ?? "",
              Capacity: f.Capacity,
              Openingstijden: f.Openingstijden,
              Status: f.Status,
              Ip: f.Ip,
              Type: f.Type,
              Verwijssysteem: f.Verwijssysteem,
              VerwijssysteemOverzichten: f.VerwijssysteemOverzichten,
              FMS: f.FMS,
              Open_ma: isoTimeToDate(f.Open_ma),
              Dicht_ma: isoTimeToDate(f.Dicht_ma),
              Open_di: isoTimeToDate(f.Open_di),
              Dicht_di: isoTimeToDate(f.Dicht_di),
              Open_wo: isoTimeToDate(f.Open_wo),
              Dicht_wo: isoTimeToDate(f.Dicht_wo),
              Open_do: isoTimeToDate(f.Open_do),
              Dicht_do: isoTimeToDate(f.Dicht_do),
              Open_vr: isoTimeToDate(f.Open_vr),
              Dicht_vr: isoTimeToDate(f.Dicht_vr),
              Open_za: isoTimeToDate(f.Open_za),
              Dicht_za: isoTimeToDate(f.Dicht_za),
              Open_zo: isoTimeToDate(f.Open_zo),
              Dicht_zo: isoTimeToDate(f.Dicht_zo),
              OmschrijvingTarieven: f.OmschrijvingTarieven,
              IsStationsstalling: f.IsStationsstalling,
              IsPopup: f.IsPopup,
              NotaVerwijssysteem: f.NotaVerwijssysteem,
              Tariefcode: f.Tariefcode,
              Toegangscontrole: f.Toegangscontrole,
              Beheerder: f.Beheerder,
              BeheerderContact: f.BeheerderContact,
              HelpdeskHandmatigIngesteld: f.HelpdeskHandmatigIngesteld,
              Url: f.Url,
              ExtraServices: f.ExtraServices,
              dia: f.dia,
              BerekentStallingskosten: false, // API demo stallings: always off (client provides price)
              AantalReserveerbareKluizen: f.AantalReserveerbareKluizen,
              MaxStallingsduur: f.MaxStallingsduur,
              HeeftExterneBezettingsdata: f.HeeftExterneBezettingsdata,
              hasUniSectionPrices: f.hasUniSectionPrices,
              hasUniBikeTypePrices: f.hasUniBikeTypePrices,
              shadowBikeparkID: f.shadowBikeparkID,
              BronBezettingsdata: f.BronBezettingsdata,
              reservationCostPerDay: f.reservationCostPerDay ? parseFloat(f.reservationCostPerDay) : null,
              thirdPartyReservationsUrl: f.thirdPartyReservationsUrl,
            },
          });

          const sectieBikeTypeMap = new Map<number, Map<number, number>>(); // sectieIndex -> BikeTypeID -> SectionBiketypeID
          const sectieIdsByIndex: number[] = [];
          for (let si = 0; si < u.sectiesTree.length; si++) {
            const sec = u.sectiesTree[si]!;
            const sectieCreated = await tx.fietsenstalling_sectie.create({
              data: {
                externalId: `${stalling.stallingsId}_${si + 1}`,
                titel: sec.titel,
                omschrijving: sec.omschrijving ?? "",
                capaciteit: sec.capaciteit,
                CapaciteitBromfiets: sec.CapaciteitBromfiets,
                kleur: sec.kleur,
                fietsenstallingsId: stallingId,
                isKluis: sec.isKluis,
                reserveringskostenPerDag: sec.reserveringskostenPerDag,
                urlwebservice: sec.urlwebservice ?? "",
                Reservable: sec.Reservable,
                NotaVerwijssysteem: sec.NotaVerwijssysteem ?? "",
                Bezetting: sec.Bezetting,
                isactief: sec.isactief,
                qualificatie: sec.qualificatie ?? "NONE",
              },
            });

            const bikeTypeToSectionBikeType = new Map<number, number>();
            for (const sft of sec.sectieFietstypes) {
              const sftCreated = await tx.sectie_fietstype.create({
                data: {
                  sectieID: sectieCreated.sectieId,
                  StallingsID: stallingId,
                  BikeTypeID: sft.BikeTypeID,
                  Toegestaan: true,
                },
              });
              bikeTypeToSectionBikeType.set(sft.BikeTypeID, sftCreated.SectionBiketypeID);
            }
            sectieBikeTypeMap.set(si, bikeTypeToSectionBikeType);
            sectieIdsByIndex.push(sectieCreated.sectieId);

            for (const kp of sec.kostenperioden) {
              await tx.fietsenstalling_sectie_kostenperioden.create({
                data: {
                  sectieId: sectieCreated.sectieId,
                  index: kp.index,
                  tijdsspanne: kp.tijdsspanne || null,
                  kosten: kp.kosten || null,
                },
              });
            }
          }

          for (const tr of u.tarievenTree.stalling) {
            await tx.tariefregels.create({
              data: {
                index: tr.index ?? 1,
                tijdsspanne: tr.tijdsspanne,
                kosten: tr.kosten ? parseFloat(String(tr.kosten)) : null,
                stallingsID: stallingId,
                truncatedStallingsID: stalling.stallingsId,
                truncatedSectieID: null,
              },
            });
          }
          for (let ti = 0; ti < u.tarievenTree.sections.length; ti++) {
            const tSec = u.tarievenTree.sections[ti]!;
            const sectieId = sectieIdsByIndex[ti] ?? null;
            if (sectieId != null) {
              for (const tr of tSec.tariefregels) {
                await tx.tariefregels.create({
                  data: {
                    index: tr.index ?? 1,
                    tijdsspanne: tr.tijdsspanne,
                    kosten: tr.kosten ? parseFloat(String(tr.kosten)) : null,
                    stallingsID: stallingId,
                    sectieID: sectieId,
                    truncatedStallingsID: stalling.stallingsId,
                    truncatedSectieID: `${stalling.stallingsId}_${ti + 1}`,
                  },
                });
              }
              const btMap = sectieBikeTypeMap.get(ti);
              for (const bt of tSec.bikeTypes) {
                const sectionBikeTypeID = btMap?.get(bt.BikeTypeID);
                if (sectionBikeTypeID != null) {
                  for (const tr of bt.tariefregels) {
                    await tx.tariefregels.create({
                      data: {
                        index: tr.index ?? 1,
                        tijdsspanne: tr.tijdsspanne,
                        kosten: tr.kosten ? parseFloat(String(tr.kosten)) : null,
                        stallingsID: stallingId,
                        sectieID: sectieId,
                        sectionBikeTypeID,
                        truncatedStallingsID: stalling.stallingsId,
                        truncatedSectieID: `${stalling.stallingsId}_${ti + 1}`,
                      },
                    });
                  }
                }
              }
            }
          }

          for (const svc of u.services) {
            await tx.fietsenstallingen_services.create({
              data: {
                FietsenstallingID: stallingId,
                ServiceID: svc.ServiceID,
              },
            });
          }

          for (const wk of u.winkansen as Array<{ DagNr: number | null; Winkans: number | null }>) {
            if (wk.DagNr != null || wk.Winkans != null) {
              await tx.fietsenstallingen_winkansen.create({
                data: {
                  FietsenstallingID: stallingId,
                  DagNr: wk.DagNr,
                  Winkans: wk.Winkans,
                },
              });
            }
          }

          const subTypeIds = await tx.abonnementsvormen.findMany({
            where: { ID: { in: u.abonnementsvormenTree.map((a) => a.SubscriptiontypeID) } },
            select: { ID: true },
          });
          const existingSubIds = new Set(subTypeIds.map((s) => s.ID));
          for (const av of u.abonnementsvormenTree) {
            if (existingSubIds.has(av.SubscriptiontypeID)) {
              await tx.abonnementsvorm_fietsenstalling.create({
                data: {
                  SubscriptiontypeID: av.SubscriptiontypeID,
                  BikeparkID: stallingId,
                },
              });
              if (av.BikeTypeIDs.length > 0) {
                await tx.abonnementsvorm_fietstype.createMany({
                  data: av.BikeTypeIDs.map((bikeTypeID) => ({
                    SubscriptiontypeID: av.SubscriptiontypeID,
                    BikeTypeID: bikeTypeID,
                  })),
                  skipDuplicates: true,
                });
              }
            }
          }

          for (const uitz of u.uitzonderingenopeningstijden) {
            await tx.uitzonderingenopeningstijden.create({
              data: {
                fietsenstallingsID: stallingId,
                openingDateTime: new Date(uitz.openingDateTime),
                closingDateTime: new Date(uitz.closingDateTime),
              },
            });
          }
        } else {
          await tx.fietsenstallingen.create({
            data: {
              ID: stallingId,
              StallingsID: stalling.stallingsId,
              StallingsIDExtern: stalling.stallingsId,
              SiteID: contactId,
              ExploitantID: contactId,
              Title: stalling.title,
              Postcode: STALLING_BASE.Postcode,
              Plaats: STALLING_BASE.Plaats,
              Coordinaten: coords,
              Type: STALLING_BASE.Type,
              FMS: STALLING_BASE.FMS,
              Status: STALLING_BASE.Status,
            },
          });

          const sectie = SECTIES[i]!;
          await tx.fietsenstalling_sectie.create({
            data: {
              externalId: sectie.externalId,
              titel: sectie.titel,
              fietsenstallingsId: stallingId,
              kleur: sectie.kleur,
              Bezetting: sectie.Bezetting,
            },
          });
        }
      }
    },
      {
        timeout: 60000, // 60 seconds - creating many stallings exceeds default 5s
        maxWait: 10000,
      }
    );

    const usersWithAccess = await prisma.user_contact_role.findMany({
      where: { ContactID: contactId },
      select: { UserID: true },
    });
    for (const u of usersWithAccess) {
      await createSecurityUsersSiteRecord(u.UserID, contactId, false);
    }

    return res.status(201).json({
      success: true,
      message: "Test gemeente aangemaakt",
      id: contactId,
    });
  } catch (error) {
    logPrismaError("test-gemeente create", error);
    return res.status(500).json({
      error: formatPrismaErrorCompact(error),
    });
  }
}
