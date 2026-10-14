export function normalizeThemeColor(color: string | null | undefined, fallback = "1f99d2"): string {
  if (!color) return fallback;
  return color.replace(/^#/, "").trim();
}

/** presentaties/resources/styles/theme.css.cfm */
export function presentatiesThemeCss(themeColor1: string): string {
  const c1 = normalizeThemeColor(themeColor1);
  return `<style type="text/css">
h1, h2, h3, h4, h5, h6 { color: #${c1}; }
.big .item .col_text { background-color: #${c1}; }
#ticker_container { background-color: #${c1}; }
.ticker_content { border-left: 2px solid #${c1}; }
#ticker_content li { border-left: 2px solid #${c1}; }
</style>`;
}

/** overzichten/resources/styles/theme.css.cfm (subset used on boards) */
export function overzichtenThemeCss(themeColor1: string, themeColor2: string): string {
  const c1 = normalizeThemeColor(themeColor1);
  const c2 = normalizeThemeColor(themeColor2, "2ea7e0");
  return `<style type="text/css">
.item, #smallNav_title, #mobnav, #main_nav_container, #main_nav_container a, #nav { background-color: #${c1}; }
#main_nav_container li { border-top: 1px solid #${c2}; }
#main_nav_container li:last-child { border-bottom: 1px solid #${c2}; }
#main_nav_container a:hover, #main_nav_container a.selected { background-color: #${c2}; }
#login { background-color: #${c1}; }
h1 { color: #${c1}; }
a:link, a:visited { color: #${c1}; }
</style>`;
}

export const LIBRARY_LOGO_BASE = "https://static.veiligstallen.nl/library/logo/";
export const LIBRARY_LOGO2_BASE = "https://static.veiligstallen.nl/library/logo2/";
