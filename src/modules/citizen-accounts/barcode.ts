// Bar/space widths per Code 128 symbol value (0–105), followed by the stop pattern.
const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const START_B = 104;
const STOP = "2331112";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Code 128 (subset B) barcode as inline SVG; characters outside ASCII 32–126 are skipped. */
export function code128bSvg(value: string, height = 100, module = 2): string {
  const text = value.split("").filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126).join("");
  const values = text.split("").map((char) => char.charCodeAt(0) - 32);
  const checksum = values.reduce((sum, symbol, index) => sum + symbol * (index + 1), START_B) % 103;
  const patterns = [START_B, ...values, checksum].map((symbol) => CODE128[symbol]!).concat(STOP);
  const quiet = 10 * module;
  let x = quiet;
  const bars: string[] = [];
  for (const pattern of patterns) {
    pattern.split("").forEach((digit, index) => {
      const width = Number(digit) * module;
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x += width;
    });
  }
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height + 20}" viewBox="0 0 ${total} ${height + 20}"><g fill="#000">${bars.join("")}</g><text x="${total / 2}" y="${height + 16}" font-family="monospace" font-size="14" text-anchor="middle">${escapeXml(text)}</text></svg>`;
}
