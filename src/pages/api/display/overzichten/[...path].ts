import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { resolveCouncilByUrlOrName, getBikeparkByExternalId } from "~/server/display/council";
import { displayNoStoreHeaders, escapeHtml } from "~/server/display/render";
import { overzichtenThemeCss } from "~/server/display/theme";
import {
  getLangstallersCounts,
  getPasOverzichtHtml,
  getSaldotekortCounts,
  resolveLangstallersLabels,
} from "~/server/display/overzichten-queries";
import { prisma } from "~/server/db";

const PAGES = ["Gemeenten", "Stallingen", "VrijePlekken", "BezettePlekken", "Langstallers", "Saldotekort", "Pas"] as const;

function navLink(gemeente: string, page: string, stallingsId?: string) {
  const base = `/${gemeente}/${page}`;
  return stallingsId ? `${base}/${stallingsId}` : base;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const validation = await validateUserSession(session, "any");
  if ("error" in validation) {
    const returnUrl = encodeURIComponent(req.url ?? "/");
    res.writeHead(302, { Location: `/login?callbackUrl=${returnUrl}` });
    return res.end();
  }

  const segments = (req.query.path as string[] | undefined) ?? [];
  const slug = segments[0];
  const pageRaw = segments[1] ?? "Gemeenten";
  const stallingsId = segments[2];
  const page = PAGES.find((p) => p.toLowerCase() === pageRaw.toLowerCase()) ?? "Gemeenten";

  if (!slug) {
    const councils = await prisma.contacts.findMany({
      where: {
        Status: "1",
        ...(validation.sites.length > 0 ? { ID: { in: validation.sites } } : {}),
      },
      select: { CompanyName: true, UrlName: true },
      orderBy: { CompanyName: "asc" },
    });
    const body = `<div id="wrapper"><h1>Gemeenten</h1><ul>${councils
      .map((c) => `<li><a href="/${c.UrlName}/Stallingen">${escapeHtml(c.CompanyName ?? "")}</a></li>`)
      .join("")}</ul></div>`;
    return sendHtml(res, "Overzichten", body, "1f99d2", "2ea7e0");
  }

  const council = await resolveCouncilByUrlOrName(slug);
  if (!council || (validation.sites.length > 0 && !validation.sites.includes(council.id))) {
    return res.status(403).send("Geen toegang");
  }

  const bikepark = stallingsId ? await getBikeparkByExternalId(council.id, stallingsId) : null;
  const theme1 = council.themeColor1;
  const theme2 = council.themeColor2;

  let content = "";
  const pollFilter = page === "BezettePlekken" ? "bezette" : "vrije";

  if (page === "VrijePlekken" || page === "BezettePlekken") {
    const siteParam = bikepark ? "" : `siteId=${council.id}&filter=overzichten`;
    const bpParam = bikepark ? `bikeparkId=${bikepark.ID}` : siteParam;
    content = `
<div style="position:absolute;right:0;font-size:80%;" id="status">Last update: <span id="lastUpdateTime"></span> <button type="button" onclick="update()">Update</button></div>
<h2>${page === "VrijePlekken" ? "Aantal vrije plaatsen" : "Aantal bezette plaatsen"}${bikepark ? " in deze stalling" : " in fietsenstallingen"}</h2>
<script>
var updateFrequencyInSeconds=30;
function now(){var d=new Date();return d.getHours()+":"+String(d.getMinutes()).padStart(2,"0")+":"+String(d.getSeconds()).padStart(2,"0");}
function update(){
  var xhr=new XMLHttpRequest();
  xhr.open("GET","/api/display/verwijssysteem/data?${bpParam}&_="+Math.random());
  xhr.onload=function(){
    if(xhr.status!==200)return;
    var data=JSON.parse(xhr.responseText);
    document.getElementById("lastUpdateTime").textContent=now();
    for(var i=0;i<data.length;i++){
      var row=data[i];
      var prefix=row.sectionId!=null?"section_":"bikepark_";
      var id=row.sectionId!=null?row.sectionId:row.bikeparkID;
      var el=document.getElementById(prefix+id);
      if(!el) continue;
      var freeSpan=el.querySelector(".free");
      if(!freeSpan) continue;
      if(!row.open){ freeSpan.innerHTML='<span class="red">X</span>'; continue; }
      ${
        pollFilter === "vrije"
          ? `if(row.capacity!==0 && row.occupation/row.capacity>0.9){ el.classList.add("full"); freeSpan.innerHTML='<span class="red">VOL</span>'; } else { el.classList.remove("full"); freeSpan.innerHTML=String(row.capacity-row.occupation-row.bulkbezetting); }`
          : `freeSpan.innerHTML=String(row.occupation);`
      }
    }
  };
  xhr.send();
}
update(); setInterval(update, updateFrequencyInSeconds*1000);
</script>
<div class="item_wrapper big">PLACEHOLDER</div>`;

    if (bikepark) {
      const sections = bikepark.fietsenstalling_secties;
      const rows = sections
        .map(
          (s, idx) =>
            `<div id="section_${s.sectieId}" class="item ${idx % 2 === 1 ? "last" : ""}"><div class="col_color tbl_cell" style="background-color:#${s.kleur.replace(/^#/, "")}"></div><div class="col_text tbl_cell"><h2>${escapeHtml(s.titel)}</h2>${s.NotaVerwijssysteem ? `<p>${escapeHtml(s.NotaVerwijssysteem)}</p>` : ""}</div><div class="col_plaatsen tbl_cell"><span class="free"></span></div></div>`
        )
        .join("");
      content = content.replace("PLACEHOLDER", rows);
    } else {
      const parks = await prisma.fietsenstallingen.findMany({
        where: { SiteID: council.id, FMS: true, VerwijssysteemOverzichten: true },
        select: { ID: true, Title: true, NotaVerwijssysteem: true },
      });
      const rows = parks
        .map(
          (p, idx) =>
            `<div id="bikepark_${p.ID}" class="item ${idx % 2 === 1 ? "last" : ""}"><div class="col_text tbl_cell"><h2>${escapeHtml(p.Title ?? "")}</h2>${p.NotaVerwijssysteem ? `<p>${escapeHtml(p.NotaVerwijssysteem)}</p>` : ""}</div><div class="col_plaatsen tbl_cell"><span class="free"></span></div></div>`
        )
        .join("");
      content = content.replace("PLACEHOLDER", rows);
    }
  } else if (page === "Langstallers") {
    const uren = parseInt(String(req.query.uren ?? "24"), 10) || 24;
    const counts = await getLangstallersCounts({
      councilSiteId: council.id,
      bikeparkExternalId: stallingsId,
      hours: uren,
    });
    const labeled = await resolveLangstallersLabels({
      councilSiteId: council.id,
      bikeparkExternalId: stallingsId,
      counts,
    });
    content = `<h2>Aantal langstallers</h2><form method="get"><label>Toon fietsen langer gestald dan <input name="uren" value="${uren}" style="width:32px"/> uur</label> <button class="buttonBorder" type="submit">Zoek</button></form><div class="item_wrapper big">${labeled
      .map((c) => `<div class="item"><div class="col_text tbl_cell"><h2>${escapeHtml(c.title)}</h2></div><div class="col_plaatsen tbl_cell"><span class="aantal">${c.n}</span></div></div>`)
      .join("")}</div>`;
  } else if (page === "Saldotekort") {
    const max = parseFloat(String(req.query.maxStallingstegoed ?? "0").replace(",", ".")) || 0;
    const counts = await getSaldotekortCounts({
      councilSiteId: council.id,
      bikeparkExternalId: stallingsId,
      maxSaldo: max,
    });
    content = `<h2>Aantal fietsen met saldotekort</h2><form method="get"><label>Saldo lager dan € <input name="maxStallingstegoed" value="${max.toFixed(2)}" style="width:48px"/></label> <button class="buttonBorder" type="submit">Zoek</button></form><div class="item_wrapper big">${counts
      .map((c) => `<div class="item"><div class="col_text tbl_cell"><h2>${escapeHtml(c.key)}</h2></div><div class="col_plaatsen tbl_cell"><span class="aantal">${c.n}</span></div></div>`)
      .join("")}</div>`;
  } else if (page === "Pas") {
    const pasQ = String(req.query.pas ?? "").trim();
    const pasResult = pasQ ? await getPasOverzichtHtml({ councilSiteId: council.id, pasId: pasQ }) : "";
    content = `<h2>Zoek pas</h2><form method="get"><input name="pas" placeholder="Pasnummer" value="${escapeHtml(pasQ)}" /> <button class="buttonBorder" type="submit">Zoek</button></form>${pasResult}`;
  } else if (page === "Stallingen") {
    const parks = await prisma.fietsenstallingen.findMany({
      where: { SiteID: council.id, Status: "1" },
      select: { Title: true, StallingsID: true },
      orderBy: { Title: "asc" },
    });
    content = `<h2>Kies een stalling</h2><ul>${parks
      .map((p) => `<li><a href="${navLink(slug, "Pas", p.StallingsID ?? undefined)}">${escapeHtml(p.Title ?? "")}</a></li>`)
      .join("")}</ul>`;
  } else {
    content = `<p>Onbekende pagina</p>`;
  }

  const nav = PAGES.filter((p) => p !== "Gemeenten" && p !== "Fietskluizen")
    .map(
      (p) =>
        `<li><a href="${navLink(slug, p, stallingsId)}" ${p === page ? 'class="selected"' : ""}><span>${p === "VrijePlekken" ? "Vrije plekken" : p === "BezettePlekken" ? "Bezette plekken" : p}</span></a></li>`
    )
    .join("");

  const body = `
<div id="wrapper">
<div id="header"><div id="header_logo"></div><div id="header_text"><h1>Overzichten ${escapeHtml(council.companyName)}</h1>${bikepark ? `<h2 style="color:black">${escapeHtml(bikepark.Title ?? "")}</h2>` : `<h2 style="color:black">Fietsenstallingen</h2>`}</div></div>
<div id="nav"><div id="main_nav_container"><ul>${nav}</ul></div></div>
<div id="content">${content}<div class="height_1em"></div></div>
</div>`;

  return sendHtml(res, "Overzichten Veiligstallen.nl", body, theme1, theme2);
}

function sendHtml(res: NextApiResponse, title: string, body: string, theme1: string, theme2: string) {
  const head = `
<link rel="stylesheet" href="/display/overzichten/normalize.css" />
<link rel="stylesheet" href="/display/overzichten/main.css" />
<link rel="stylesheet" href="/display/overzichten/struct.css" />
<link rel="stylesheet" href="/display/overzichten/common.css" />
<link rel="stylesheet" href="/display/overzichten/verwijssysteem.css" />
<link rel="stylesheet" href="/display/overzichten/responsive.css" />
${overzichtenThemeCss(theme1, theme2)}
`;
  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>${head}</head><body>${body}</body></html>`;
  Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
