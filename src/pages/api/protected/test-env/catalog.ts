import type { NextApiRequest, NextApiResponse } from "next";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase, prodDatabaseConfigured } from "~/server/test-env/guard";

function cleanIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",") : [];
  return raw.map((item) => String(item).trim()).filter((item) => /^[A-Za-z0-9_-]{1,40}$/.test(item));
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!await assertTestEnvUser(req, res)) return;

  try {
    assertTargetDatabase();
    if (!prodDatabaseConfigured()) {
      res.status(200).json({ prodAvailable: false, owners: [], exploitants: [], stallingen: [] });
      return;
    }
    const url = new URL(process.env.PROD_DATABASE_URL ?? "");
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    });
    try {
      await connection.query("SET SESSION TRANSACTION READ ONLY");
      const ownerIds = cleanIds(req.query.ownerIds);
      const exploitantIds = cleanIds(req.query.exploitantIds);
      const [owners] = await connection.query<RowDataPacket[]>(
        `SELECT ID AS id, CompanyName AS name, Gemeentecode AS gemeenteCode, ZipID AS zipId
         FROM contacts WHERE ItemType = 'organizations' ORDER BY CompanyName`,
      );
      let exploitants: RowDataPacket[] = [];
      let stallingen: RowDataPacket[] = [];
      if (ownerIds.length > 0) {
        const ownerPlaceholders = ownerIds.map(() => "?").join(", ");
        const [exploitantRows] = await connection.query<RowDataPacket[]>(
          `SELECT DISTINCT c.ID AS id, c.CompanyName AS name
           FROM contacts c
           INNER JOIN contact_contact cc ON cc.parentSiteID = c.ID
           WHERE cc.childSiteID IN (${ownerPlaceholders})
           ORDER BY c.CompanyName`,
          ownerIds,
        );
        exploitants = exploitantRows;
        const params = [...ownerIds];
        let sql = `SELECT f.ID AS id, f.StallingsID AS stallingsId, f.Title AS title, f.SiteID AS siteId,
                          f.ExploitantID AS exploitantId, f.Type AS typeId, typ.name AS typeName
                   FROM fietsenstallingen f
                   LEFT JOIN fietsenstallingtypen typ ON typ.id = f.Type
                   WHERE f.SiteID IN (${ownerPlaceholders})`;
        if (exploitantIds.length > 0) {
          sql += ` AND ExploitantID IN (${exploitantIds.map(() => "?").join(", ")})`;
          params.push(...exploitantIds);
        }
        sql += " ORDER BY f.Title";
        const [stallingRows] = await connection.query<RowDataPacket[]>(sql, params);
        stallingen = stallingRows;
      }
      res.status(200).json({ prodAvailable: true, owners, exploitants, stallingen });
    } finally {
      await connection.end();
    }
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
