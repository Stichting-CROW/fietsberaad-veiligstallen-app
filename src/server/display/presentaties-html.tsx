import React from "react";
import { presentatiesThemeCss } from "./theme";
import { LIBRARY_LOGO2_BASE } from "./theme";

/** Injected via renderDocument head — not as JSX text (strings in body are escaped). */
export function slide2HeadExtra(themeColor1: string): string {
  return `<link rel="stylesheet" href="/display/presentaties/slides.css" />
<link rel="stylesheet" href="/display/presentaties/verwijssysteem.css" />
<link rel="stylesheet" href="/display/presentaties/fade-plugin.css" />
${presentatiesThemeCss(themeColor1)}`;
}

export function presentatieFrameHeadExtra(themeColor1: string): string {
  return `<link rel="stylesheet" href="/display/presentaties/styles.css" />
<link rel="stylesheet" href="/display/presentaties/ticker.css" />
${presentatiesThemeCss(themeColor1)}`;
}

export function PresentatiesIndexPage(props: {
  rows: { siteId: string; companyName: string; stallings: { id: string; title: string }[] }[];
}) {
  return (
    <div style={{ position: "relative", width: 800, margin: "0 auto", textAlign: "center" }}>
      <div style={{ height: "1em" }} />
      <img src="/display/presentaties/logo.png" alt="Veiligstallen" />
      <h1>Selecteer gemeente of een stalling:</h1>
      <ul style={{ listStyle: "none", fontSize: "1.6em" }} id="gemeenten">
        {props.rows.map((row) => (
          <li key={row.siteId}>
            <a href={`/presentatie.cfm?siteID=${encodeURIComponent(row.siteId)}`}>{row.companyName}</a>
            <ul>
              {row.stallings.map((s) => (
                <li key={s.id}>
                  <a
                    href={`/presentatie.cfm?siteID=${encodeURIComponent(row.siteId)}&bikeparkID=${encodeURIComponent(s.id)}`}
                    style={{ fontSize: "80%" }}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PresentatieFramePage(props: {
  siteId: string;
  bikeparkId?: string;
  iframeSrc: string;
  logo2?: string | null;
  tickerItems: string[];
}) {
  const iframeSrc = props.iframeSrc;
  return (
    <>
      <div id="wrapper">
        <div id="buienradar" style={{ width: 550 }}>
          <img
            id="buienradarIMG"
            src="https://api.buienradar.nl/image/1.0/RadarMapNL?w=550&h=512"
            alt=""
          />
        </div>
        <div id="content">
          <div id="logo">
            {props.logo2 && props.siteId !== "1" ? (
              <img src={`${LIBRARY_LOGO2_BASE}${props.logo2}`} alt="Logo" />
            ) : (
              <img src="/display/presentaties/logo.png" alt="Veiligstallen" />
            )}
          </div>
          <iframe
            src={iframeSrc}
            width={600}
            height={650}
            frameBorder={0}
            scrolling="no"
            title="slides"
          />
        </div>
      </div>
      <div id="footer">
        <div id="ticker_container">
          <div className="ticker_content" id="intro" />
          {props.tickerItems.map((item, i) => (
            <div key={i} className={`ticker_content r${i + 1}`}>
              {item}
            </div>
          ))}
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
setInterval(function(){
  var img=document.getElementById("buienradarIMG");
  if(img) img.src="https://api.buienradar.nl/image/1.0/RadarMapNL?w=550&h=512&_="+Date.now();
},600000);
(function(){
  var items=document.querySelectorAll("#ticker_container .ticker_content:not(#intro)");
  var idx=0;
  function show(i){
    for(var j=0;j<items.length;j++) items[j].style.display="none";
    if(items.length===0) return;
    items[i].style.display="block";
  }
  show(0);
  setInterval(function(){
    if(items.length<2) return;
    idx=(idx+1)%items.length;
    show(idx);
  },4000);
})();
`,
        }}
      />
    </>
  );
}

export function Slide2Shell(props: { innerHtml: string; totalDurationSec: number }) {
  return (
    <>
      <script src="/display/presentaties/jquery-lite.js" defer />
      <div dangerouslySetInnerHTML={{ __html: props.innerHtml }} />
      {props.totalDurationSec > 0 ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){ location.reload(); }, ${props.totalDurationSec * 1000});`,
          }}
        />
      ) : (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){ location.reload(); }, 30000);`,
          }}
        />
      )}
    </>
  );
}
