import { prisma } from "~/server/db";
import { type UserStatusParams, type UserStatusStatus } from "~/backend/services/database-service";

export const getUserStatusTableStatus = async (params: UserStatusParams) => {
  const sqldetecttable = `SELECT COUNT(*) As count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name= 'user_status'`;

  let tableExists = false;
  const status: UserStatusStatus | false = {
    status: 'missing',
    size: undefined,
  };

  try {
    const result = await prisma.$queryRawUnsafe<{ count: number }[]>(sqldetecttable);
    tableExists = result && result.length > 0 && result[0] ? result[0].count > 0 : false;
    if (tableExists) {
      status.status = 'available';

      const sqlGetStatistics = `SELECT COUNT(*) As count FROM user_status`;
      const resultStatistics = await prisma.$queryRawUnsafe<{ count: number }[]>(sqlGetStatistics);
      if (resultStatistics && resultStatistics.length > 0 && resultStatistics[0] !== undefined) {
        status.size = parseInt(resultStatistics[0].count.toString());
      }
    }
    return status;
  } catch (error) {
    console.error(">>> userStatusTable ERROR Unable to get user-status table status", error);
    return false;
  }
}

export const updateUserStatusTable = async (params: UserStatusParams): Promise<UserStatusStatus | false> => {

  const status = await getUserStatusTableStatus(params);
  if(status === false) {
    return false;
  }

  const knownBadEmails = [
    '_k.ho@u-stal.nl',
    'Zwolle_stationsplein_lots_sept_nov_2024',
    'd.vanharen@u-stal.nl',
    'p.mosterd.hilversum@u-stal.nl',
    '_t.weultjes@u-stal.nl',
    'f.a.a.noordman@capelleaandenijssel.nl',
    'fhj.gerts@papendrecht.nl',
    'folkert.piersma@prorail.nl',
    'freek.vanduuren@denhaag.nl',
    'g.vanden.aker@gembest.nl',
    'Hans.van.Dijk@minienw.nl',
    'hapr.ribbers@breda.nl',
    'hosmedes@almere.nl',
    'j.donker@zeist.nl',
    'j.van.drunen@leiden.nl',
    'j.van.straaten@zandvoort.nl',
    'javis@centrum.amsterdam.nl',
    'jkant@alkmaar.nl',
    'jpunt@delft.nl',
    'lvenema@leeuwarden.nl',
    'm.van.den.elzen@helmond.nl',
    'msprang@alkmaar.nl',
    'n.vanhunen@apeldoorn.nl',
    'nensing@haarlem.nl',
    'pwc.van.oers@breda.nl',
    'r.kosters@middelburg.nl',
    'r.schuurmans@zwijndrecht.nl',
    's.brouwers@gembest.nl',
    's.sleking@zwolle.nl',
    'sjoerd.gallmann@nsstations.nl',
    't.velders@nieuwegein.nl',
    'ton.dekorte@sittard-geleen.nl',
    'w.h.mooij@zoetermeer.nl',
    'zwolle@exploitant.nl']

    for(const email of knownBadEmails) {
      const users = await prisma.security_users.findMany({
        where: {UserName: email},
        select: {UserID: true, DisplayName: true }
      });

      if(!users || users.length === 0) {
        console.log(`*** updateUserStatusTable USER ${email} does not exist`);
        continue;
      }

      for(const user of users) {
        console.log(`*** updateUserStatusTable archive USER ${user.DisplayName} (${email}${users.length>1? " - multiple accounts":""})`);
        await prisma.user_status.upsert({
          where: {UserID: user.UserID},
          update: {
            Archived: true,
          },
          create: {
            UserID: user.UserID,
            Archived: true,
          }
        });
      }
    }
  
  return getUserStatusTableStatus(params);
}

export const clearUserStatusTable = async (params: UserStatusParams) => {
  const sql = `DELETE FROM user_status;`;
  await prisma.$executeRawUnsafe(sql);

  return getUserStatusTableStatus(params);
}

export const createUserStatusTable = async (params: UserStatusParams) => {
  const sqlCreateTable = `CREATE TABLE IF NOT EXISTS user_status (
    UserID VARCHAR(36) NOT NULL,
    Archived bool DEFAULT false,
    PRIMARY KEY (UserID),
    UNIQUE KEY UserID (UserID)
  );`;

  const result = await prisma.$queryRawUnsafe(sqlCreateTable);
  if (!result) {
    console.error("Unable to create user_status table", result);
    return false;
  }

  return getUserStatusTableStatus(params);
}

export const dropUserStatusTable = async (params: UserStatusParams) => {
  const sql = "DROP TABLE IF EXISTS user_status";

  const result = await prisma.$queryRawUnsafe(sql);
  if (!result) {
    console.error("Unable to drop user_status table", result);
    return false;
  }

  return getUserStatusTableStatus(params);
} 