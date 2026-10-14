import React from "react";
import { escapeHtml, trustedHtml } from "./render";
import { normalizeThemeColor, LIBRARY_LOGO2_BASE, LIBRARY_LOGO_BASE } from "./theme";
import type { CouncilDisplay } from "./council";

const CSS = `
<link rel="stylesheet" href="/display/verwijssysteem/normalize.css" />
<link rel="stylesheet" href="/display/verwijssysteem/main.css" />
<link rel="stylesheet" href="/display/verwijssysteem/styles.css" />
`;

export function VerwijssysteemGemeentenPage(props: {
  councils: { council: CouncilDisplay; bikeparks: { title: string; stallingsId: string | null; urlName: string | null }[] }[];
}) {
  return (
    <div id="wrapper">
      <div id="header" className="tbl_row">
        <div className="tbl_cell headerCell floatLeft alignLeft" style={{ width: "80%" }}>
          Veiligstallen.nl :: Verwijssysteem
        </div>
        <div id="time" className="tbl_cell headerCell floatRight alignRight" style={{ width: "20%" }} />
      </div>
      <div id="content" className="tbl_row">
        <div className="item_wrapper tbl_cell" style={{ verticalAlign: "top", padding: 0, paddingLeft: 100 }}>
          <p>Selecteer gemeente of fietsenstalling:</p>
          {props.councils.map(({ council, bikeparks }) => (
            <div key={council.id}>
              <h2>
                <a href={`/${council.urlName ?? council.id}`}>{council.companyName}</a>
              </h2>
              <ul>
                {bikeparks.map((b) => (
                  <li key={b.stallingsId ?? b.title}>
                    <a href={`/${council.urlName ?? council.id}/${b.stallingsId}`}>{b.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <VerwijssysteemFooter council={null} />
      <ClockScript />
    </div>
  );
}

export function VerwijssysteemStallingenPage(props: {
  council: CouncilDisplay;
  title: string;
  itemClass: "big" | "small";
  itemHeightCss: string;
  rows: { id: string; title: string; note: string }[];
  siteId: string;
}) {
  return (
    <div id="wrapper">
      <div id="header" className="tbl_row">
        <div className="tbl_cell headerCell floatLeft alignLeft" style={{ width: "80%" }}>
          {props.title}
        </div>
        <div id="time" className="tbl_cell headerCell floatRight alignRight" style={{ width: "20%" }} />
      </div>
      <div id="content" className="tbl_row">
        <PollScript mode="stallingen" siteId={props.siteId} />
        <style dangerouslySetInnerHTML={{ __html: `.${props.itemClass} .item { height: ${props.itemHeightCss}; }` }} />
        <div className={`item_wrapper ${props.itemClass} tbl_cell`}>
          {props.rows.map((row, idx) => (
            <div
              key={row.id}
              id={`bikepark_${row.id}`}
              className={`item ${idx % 2 === 1 ? "last" : ""}`}
            >
              <div className="col_text tbl_cell">
                <h2>{row.title}</h2>
                {row.note ? <p>{row.note}</p> : null}
              </div>
              <div className="col_plaatsen tbl_cell">
                <span className="free" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <VerwijssysteemFooter council={props.council} />
      <ClockScript />
    </div>
  );
}

export function VerwijssysteemSectiesPage(props: {
  council: CouncilDisplay;
  itemClass: "big" | "small";
  itemHeightCss: string;
  sections: { id: number; color: string; name: string; note: string }[];
  bikeparkId: string;
}) {
  return (
    <div id="wrapper">
      <div id="header" className="tbl_row">
        <div className="tbl_cell headerCell floatLeft alignLeft" style={{ width: "80%" }}>
          Aantal vrije plaatsen
        </div>
        <div id="time" className="tbl_cell headerCell floatRight alignRight" style={{ width: "20%" }} />
      </div>
      <div id="content" className="tbl_row">
        <PollScript mode="secties" bikeparkId={props.bikeparkId} />
        <style dangerouslySetInnerHTML={{ __html: `.${props.itemClass} .item { height: ${props.itemHeightCss}; }` }} />
        <div className={`item_wrapper ${props.itemClass} tbl_cell`}>
          {props.sections.map((s, idx) => (
            <div key={s.id} id={`section_${s.id}`} className={`item ${idx % 2 === 1 ? "last" : ""}`}>
              <div className="col_color tbl_cell" style={{ backgroundColor: `#${s.color.replace(/^#/, "")}` }} />
              <div className="col_text tbl_cell">
                <h2>{s.name}</h2>
                {s.note ? <p>{s.note}</p> : null}
              </div>
              <div className="col_plaatsen tbl_cell">
                <span className="free" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <VerwijssysteemFooter council={props.council} />
      <ClockScript />
    </div>
  );
}

function VerwijssysteemFooter({ council }: { council: CouncilDisplay | null }) {
  return (
    <div id="footer" className="tbl_row">
      <div className="tbl_cell footerCell floatLeft alignLeft" style={{ width: "45%" }}>
        {council?.companyLogo2 ? (
          <img src={`${LIBRARY_LOGO2_BASE}${council.companyLogo2}`} height={45} alt="" />
        ) : (
          <a href="/">
            <img src="/display/verwijssysteem/logo.png" height={45} alt="" />
          </a>
        )}
      </div>
      <div className="tbl_cell footerCell floatRight alignRight" style={{ width: "45%" }}>
        {council?.companyLogo ? (
          <img src={`${LIBRARY_LOGO_BASE}${council.companyLogo}`} height={45} alt="" />
        ) : null}
      </div>
    </div>
  );
}

function ClockScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
function checkTime(i){if(i<10){i="0"+i;}return i;}
function showTime(){
  var today=new Date();
  var h=checkTime(today.getHours());
  var m=checkTime(today.getMinutes());
  var el=document.getElementById("time");
  if(el) el.textContent=h+":"+m;
  setTimeout(showTime,1000);
}
showTime();
`,
      }}
    />
  );
}

function PollScript(props: { mode: "stallingen" | "secties"; siteId?: string; bikeparkId?: string }) {
  const params =
    props.mode === "stallingen"
      ? `siteId=${escapeHtml(props.siteId ?? "")}&filter=verwijssysteem`
      : `bikeparkId=${escapeHtml(props.bikeparkId ?? "")}`;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
var updateFrequencyInSeconds=30;
function applyRow(open,cap,occ,occupied,prefix,id){
  var el=document.getElementById(prefix+id);
  if(!el) return;
  var freeSpan=el.querySelector(".free");
  if(!freeSpan) return;
  if(!open){ freeSpan.innerHTML='<span class="red">X</span>'; return; }
  if(cap!==0 && occupied/cap>0.95){
    el.classList.add("full");
    freeSpan.innerHTML='<span class="red">VOL</span>';
  } else {
    el.classList.remove("full");
    freeSpan.innerHTML=String(cap-occupied);
  }
}
function update(){
  var xhr=new XMLHttpRequest();
  xhr.open("GET","/api/display/verwijssysteem/data?${params}&_="+Math.random());
  xhr.onload=function(){
    if(xhr.status!==200) return;
    var data=JSON.parse(xhr.responseText);
    for(var i=0;i<data.length;i++){
      var row=data[i];
      if(row.sectionId!=null){
        applyRow(row.open,row.capacity,row.occupation,row.occupied,"section_",row.sectionId);
      } else {
        applyRow(row.open,row.capacity,row.occupation,row.occupied,"bikepark_",row.bikeparkID);
      }
    }
  };
  xhr.send();
}
update();
setInterval(update, updateFrequencyInSeconds*1000);
`,
      }}
    />
  );
}

export function verwijssysteemHead(council: CouncilDisplay | null, title: string): string {
  const bg = council ? normalizeThemeColor(council.themeColor1, "1d99d7") : "1d99d7";
  return `${CSS}
<style type="text/css">html, body { background-color: #${bg}; }</style>`;
}
