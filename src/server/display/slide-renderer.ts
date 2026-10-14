import { prisma } from "~/server/db";
import {
  getActivePresentations,
  getParkedBikesCountForCouncilYear,
  resolvePresentationBikeparkId,
} from "./presentation";
import { getBikeparkInfo, getBikeparkInfoFlat } from "./occupancy";
import { renderOpeningstijdenTableHtml } from "./openingstijden-table";
import { fetchRssFeed } from "./rss";
import { trustedHtml } from "./render";
import { displayCellHtml, formatPublicFreePlaces } from "./display-rules";
import { getCouncilById } from "./council";

function formatDigitsBlocks(n: number): string {
  const formatted = n.toLocaleString("nl-NL").replace(/,/g, ".");
  let blocks = "";
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i]!;
    if (ch === ".") blocks += "<span class='dot'>.</span>";
    else blocks += `<span class='digit'>${ch}</span>`;
  }
  return blocks;
}

async function expandArticle(html: string, zipId: string | null): Promise<string> {
  let out = html;
  if (out.includes("{aantal_gestalde_fietsen_lopend_jaar}") || out.includes("{blokken_aantal_gestalde_fietsen_lopend_jaar}")) {
    const count = await getParkedBikesCountForCouncilYear(zipId, new Date().getFullYear());
    const formatted = count.toLocaleString("nl-NL").replace(/,/g, ".");
    out = out.replace(/\{aantal_gestalde_fietsen_lopend_jaar\}/g, `<span class='aantalFietsen'>${formatted}</span>`);
    out = out.replace(/\{blokken_aantal_gestalde_fietsen_lopend_jaar\}/g, `<div id='digits'>${formatDigitsBlocks(count)}</div>`);
  }
  return out;
}

export async function renderSlide2Html(siteId: string, bikeparkId?: string): Promise<{ html: string; totalDuration: number }> {
  const slides = await getActivePresentations(siteId, bikeparkId);
  const council = await getCouncilById(siteId);
  const fallbackBikeparkId = await resolvePresentationBikeparkId(siteId, bikeparkId);
  const rounds = slides.length > 6 ? 1 : 2;
  let totalDuration = 0;
  const parts: string[] = [];

  for (let round = 1; round <= rounds; round++) {
    for (const slide of slides) {
      const id = slide.ID;
      const duration = slide.Duration ?? 10;
      let inner = "";
      let valid = true;
      const slideBikeparkId = bikeparkId ?? fallbackBikeparkId;

      switch (slide.ContentType) {
        case "Article": {
          const article = await expandArticle(slide.Article ?? "", council?.zipId ?? null);
          inner = `<h1>${slide.Title ?? ""}</h1>${trustedHtml(article)}`;
          break;
        }
        case "Bikepark": {
          if (!slideBikeparkId) {
            valid = false;
            break;
          }
          const bp = await prisma.fietsenstallingen.findUnique({
            where: { ID: slideBikeparkId },
            select: { dia: true },
          });
          inner = `<h1>${slide.Title ?? ""}</h1>${trustedHtml(bp?.dia ?? "")}`;
          break;
        }
        case "Openingstijden": {
          if (!slideBikeparkId) {
            valid = false;
            break;
          }
          const bp = await prisma.fietsenstallingen.findUnique({ where: { ID: slideBikeparkId } });
          if (!bp) {
            valid = false;
            break;
          }
          inner = `<h1>Openingstijden deze week</h1><p>${renderOpeningstijdenTableHtml(bp)}</p>`;
          if (bp.Openingstijden) inner += `<p class="note">${bp.Openingstijden}</p>`;
          break;
        }
        case "RSS": {
          const feed = slide.RSS ? await fetchRssFeed(slide.RSS) : null;
          if (!feed) {
            valid = false;
            break;
          }
          inner = `<h1>${slide.Title ?? ""}</h1><div style="height:1em;"></div><h2>${feed.title}</h2><br />${trustedHtml(feed.content)}`;
          break;
        }
        case "Verwijssysteem": {
          if (!slideBikeparkId) {
            valid = false;
            break;
          }
          const bp = await prisma.fietsenstallingen.findUnique({
            where: { ID: slideBikeparkId },
            include: { fietsenstalling_secties: { where: { isactief: true } } },
          });
          if (!bp?.Verwijssysteem || !bp.fietsenstalling_secties.length) {
            valid = false;
            break;
          }
          const info = await getBikeparkInfo(slideBikeparkId);
          const n = info.length;
          const heightRule = n >= 3 ? `.big .item { height: calc(100% / ${n} - ${n} * 2px); }` : "";
          inner = `<h1>Aantal vrije plaatsen: </h1><div class="table"><div class="item_wrapper big tbl_cell"><style>${heightRule}</style>`;
          for (const row of info) {
            const sect = bp.fietsenstalling_secties.find((s) => s.sectieId === row.sectionId);
            const cell = formatPublicFreePlaces(row);
            let freeHtml = displayCellHtml(cell);
            if (row.open && Number.isFinite(row.capacity)) {
              /* slide uses isNumeric capacity check */
            }
            inner += `<div class="item"><div class="col_color tbl_cell" style="background-color:#${(sect?.kleur ?? "23B0D9").replace(/^#/, "")};"></div>`;
            inner += `<div class="col_text tbl_cell"><h2>${sect?.titel ?? ""}</h2>${sect?.NotaVerwijssysteem ? `<p>${sect.NotaVerwijssysteem}</p>` : ""}</div>`;
            inner += `<div class="col_plaatsen tbl_cell"><span class="free">${freeHtml}</span></div></div>`;
          }
          inner += "</div></div>";
          break;
        }
        case "Verwijssysteem_stallingen": {
          const parks = await prisma.fietsenstallingen.findMany({
            where: { SiteID: siteId, Status: "1", Verwijssysteem: true },
            orderBy: { Title: "asc" },
          });
          const rows = parks.filter((p) => !slideBikeparkId || p.ID !== slideBikeparkId);
          if (rows.length === 0) {
            valid = false;
            break;
          }
          inner = `<h1>${slide.Title ?? ""}</h1><div class="table"><div class="item_wrapper big tbl_cell">`;
          let counter = 0;
          for (const p of rows) {
            counter++;
            const flat = await getBikeparkInfoFlat(p.ID);
            const cell = flat ? formatPublicFreePlaces({ ...flat, occupied: flat.occupation + flat.bulkbezetting }) : { kind: "x" as const };
            inner += `<div class="item"><div class="col_text tbl_cell"><h2>${p.Title ?? ""}</h2>${p.NotaVerwijssysteem ? `<p>${p.NotaVerwijssysteem}</p>` : ""}</div>`;
            inner += `<div class="col_plaatsen tbl_cell"><span class="free">${displayCellHtml(cell)}</span></div></div>`;
          }
          if (counter >= 3) inner = `<style>.big .item { height: calc(100% / ${counter} - ${counter} * 2px); }</style>` + inner;
          inner += "</div></div>";
          break;
        }
        default:
          valid = false;
      }

      if (!valid) continue;
      parts.push(`<div id="slide_${id}_${round}" class="wrapper_slide" style="display:none;">${inner}</div>`);
      parts.push(`<script>document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){showSlide(document.getElementById("slide_${id}_${round}"));},${totalDuration * 1000});});</script>`);
      totalDuration += duration;
    }
  }

  const script = `
<script>
function showSlide(element){
  if(!element) return;
  var cur=document.querySelector(".currentSlide");
  if(!cur){
    element.classList.add("currentSlide");
    element.style.display="block";
    element.style.opacity="1";
  } else {
    cur.style.opacity="0";
    setTimeout(function(){
      cur.style.display="none";
      cur.classList.remove("currentSlide");
      element.classList.add("currentSlide");
      element.style.display="block";
      element.style.opacity="1";
    },600);
  }
}
</script>`;

  return { html: script + parts.join(""), totalDuration };
}
