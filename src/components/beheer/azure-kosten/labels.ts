const SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const LONG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function parts(month: string): { year: string; index: number } {
  const [year, mm] = month.split("-");
  return { year, index: Number(mm) - 1 };
}

export function euro(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: currency || "EUR" }).format(value || 0);
}

/** One color per kind of cost, shared by the service chart, the category chart, and the pies. */
const SERIES_COLOR: Record<string, string> = {
  app: "#008FFB",
  database: "#FEB019",
  network: "#00E396",
  other: "#FF4560",
};

const SERIES_FALLBACK = ["#775DD0", "#3F51B5", "#546E7A", "#D4526D", "#8D5B4C", "#F86624", "#D4E157"];

export function seriesColor(name: string): string {
  const key = name.toLowerCase();
  if (key.includes("database") || key.includes("mysql") || key.includes("sql")) return SERIES_COLOR.database;
  if (key.includes("app service")) return SERIES_COLOR.app;
  if (
    key.includes("netwerk")
    || key.includes("network")
    || key.includes("bandwidth")
    || key.includes("dns")
  ) return SERIES_COLOR.network;
  if (
    key.includes("overig")
    || key.includes("monitor")
    || key.includes("log analytics")
    || key.includes("logic apps")
    || key.includes("key vault")
    || key === "other"
    || key.includes("onbekend")
    || key.includes("niet ingedeeld")
  ) return SERIES_COLOR.other;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SERIES_FALLBACK[hash % SERIES_FALLBACK.length];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

/** Shared bar tooltip: every category on the hovered column. */
export function categoryTooltip(format: (value: number) => string) {
  return {
    shared: true,
    intersect: false,
    custom: ({
      series,
      dataPointIndex,
      w,
    }: {
      series: number[][];
      dataPointIndex: number;
      w: { globals: { labels: string[]; seriesNames: string[]; colors: string[] } };
    }) => {
      const title = escapeHtml(String(w.globals.labels[dataPointIndex] ?? ""));
      const rows = w.globals.seriesNames.map((name, index) => {
        const value = Number(series[index]?.[dataPointIndex]) || 0;
        const color = w.globals.colors[index] || "#666";
        return `<tr>
          <td style="padding:2px 16px 2px 0;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(color)};margin-right:6px"></span>${escapeHtml(name)}</td>
          <td style="padding:2px 0;text-align:right;white-space:nowrap">${escapeHtml(format(value))}</td>
        </tr>`;
      }).join("");
      const total = series.reduce((sum, values) => sum + (Number(values[dataPointIndex]) || 0), 0);
      return `<div style="padding:8px 10px">
        <div style="font-weight:600;margin-bottom:4px">${title}</div>
        <table>${rows}
          <tr>
            <td style="padding-top:6px;font-weight:600">Totaal</td>
            <td style="padding-top:6px;text-align:right;font-weight:600">${escapeHtml(format(total))}</td>
          </tr>
        </table>
      </div>`;
    },
  };
}

export function monthShort(month: string, partial = false): string {
  const { year, index } = parts(month);
  const name = SHORT[index] || month;
  return `${name} ${year.slice(2)}${partial ? " (deel)" : ""}`;
}

export function monthLong(month: string): string {
  const { year, index } = parts(month);
  return `${LONG[index] || month} ${year}`;
}

export function monthSpan(months: string[]): string {
  if (!months.length) return "";
  if (months.length === 1) return monthLong(months[0]);
  const first = months[0];
  const last = months[months.length - 1];
  if (first.slice(0, 4) === last.slice(0, 4)) {
    const start = LONG[parts(first).index] || first;
    return `${start}–${monthLong(last)}`;
  }
  return `${monthLong(first)}–${monthLong(last)}`;
}
