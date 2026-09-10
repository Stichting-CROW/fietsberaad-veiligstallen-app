/**
 * Generate Markdown (and PDF when pandoc is available) from the OpenAPI JSON
 * specs that Swagger UI serves.
 *
 * Usage:
 *   npm run docs:api          Markdown + PDF (pandoc when available)
 *   npm run dev              same, then starts Next.js
 *
 * Not hooked into `npm run build`, so ACC/PROD need no extra tools.
 * Skip entirely with SKIP_OPENAPI_DOCS=1. Skip PDF with SKIP_OPENAPI_PDF=1
 * (stale PDFs are removed so Swagger does not keep linking to an old file).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

const SPECS = [
  {
    json: "src/lib/openapi/fms-api-v4.json",
    slug: "fms-api-v4",
    swaggerUrl: "/docs/api/v4",
  },
  {
    json: "src/lib/openapi/fms-api-migrate-v2.json",
    slug: "fms-api-migrate-v2",
    swaggerUrl: "/test/fms-api-docs-migrate-v2",
  },
  {
    json: "src/lib/openapi/fms-api-migrate-v3.json",
    slug: "fms-api-migrate-v3",
    swaggerUrl: "/test/fms-api-docs-migrate-v3",
  },
  {
    json: "src/lib/openapi/fms-api.json",
    slug: "fms-api-v2-v3",
    swaggerUrl: "/test/fms-api-docs",
  },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDirs = [
  path.join(root, "public", "api-docs"),
  path.join(root, "docs", "api"),
];

const generatedAtDate = new Date();
const generatedAt = generatedAtDate.toISOString();
const generatedAtLocal = formatGeneratedAtLocal(generatedAtDate);

function formatGeneratedAtLocal(date) {
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("timeZoneName")}`;
}

function main() {
  if (process.env.SKIP_OPENAPI_DOCS === "1") {
    console.log("Skipping OpenAPI docs (SKIP_OPENAPI_DOCS=1)");
    return;
  }

  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const written = [];
  for (const spec of SPECS) {
    const jsonPath = path.join(root, spec.json);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`OpenAPI spec not found: ${spec.json}`);
    }
    const document = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const markdown = renderSpec(document, spec);
    for (const dir of outDirs) {
      const mdPath = path.join(dir, `${spec.slug}.md`);
      fs.writeFileSync(mdPath, markdown, "utf8");
    }
    const pdfOk = tryPdf(spec.slug);
    if (!pdfOk) {
      removePdf(spec.slug);
    }
    written.push({ ...spec, pdf: pdfOk, title: document.info?.title ?? spec.slug });
    console.log(`Wrote ${spec.slug}.md${pdfOk ? " + pdf" : ""}`);
  }

  const index = renderIndex(written);
  const manifest = {
    generatedAt,
    generatedAtLocal,
    files: Object.fromEntries(
      written.map((item) => [item.slug, { md: true, pdf: Boolean(item.pdf) }]),
    ),
  };
  for (const dir of outDirs) {
    fs.writeFileSync(path.join(dir, "index.md"), index, "utf8");
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }
}

function tryPdf(slug) {
  if (process.env.SKIP_OPENAPI_PDF === "1") return false;
  const pandoc = spawnSync("pandoc", ["--version"], { encoding: "utf8" });
  if (pandoc.status !== 0) {
    return false;
  }

  const mdPath = path.join(outDirs[0], `${slug}.md`);
  const pdfPath = path.join(outDirs[0], `${slug}.pdf`);
  const tmpPdfPath = path.join(outDirs[0], `.${slug}.generating.pdf`);
  if (fs.existsSync(pdfPath)) {
    fs.unlinkSync(pdfPath);
  }
  const engines = ["xelatex", "pdflatex", "lualatex"];
  for (const engine of engines) {
    const result = spawnSync(
      "pandoc",
      [
        mdPath,
        "-o",
        tmpPdfPath,
        "-t",
        "pdf",
        `--pdf-engine=${engine}`,
        "-V",
        "geometry:margin=2.2cm",
        "-V",
        "fontsize=11pt",
        "--highlight-style=tango",
        "-f",
        "markdown",
        "-s",
      ],
      { encoding: "utf8" },
    );
    if (result.status === 0 && fs.existsSync(tmpPdfPath)) {
      fs.renameSync(tmpPdfPath, pdfPath);
      for (const dir of outDirs.slice(1)) {
        const dest = path.join(dir, `${slug}.pdf`);
        const tmpDest = path.join(dir, `.${slug}.generating.pdf`);
        fs.copyFileSync(pdfPath, tmpDest);
        fs.renameSync(tmpDest, dest);
      }
      return true;
    }
  }
  return false;
}

function removePdf(slug) {
  for (const dir of outDirs) {
    const pdfPath = path.join(dir, `${slug}.pdf`);
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
}

function renderIndex(written) {
  const lines = [
    "# FMS API-documentatie",
    "",
    `Gegenereerd op ${generatedAtLocal} uit de OpenAPI-specs in \`src/lib/openapi/\`.`,
    "",
    "Interactieve Swagger-UI: `/docs/api/v4`.",
    "",
    "| Document | Markdown | PDF | Swagger |",
    "| --- | --- | --- | --- |",
  ];
  for (const item of written) {
    const pdf = item.pdf ? `[PDF](${item.slug}.pdf)` : "—";
    lines.push(
      `| ${item.title} | [${item.slug}.md](${item.slug}.md) | ${pdf} | [${item.swaggerUrl}](${item.swaggerUrl}) |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderSpec(spec, meta) {
  const title = spec.info?.title ?? meta.slug;
  const version = spec.info?.version ?? "";
  const lines = [];

  lines.push(`# ${title}`);
  if (version) lines.push("", `**Versie:** ${version}`);
  lines.push(
    "",
    `Gegenereerd op ${generatedAtLocal} uit \`${meta.json}\`.`,
    `Interactieve referentie: ${meta.swaggerUrl}`,
    "",
  );

  if (spec.info?.description) {
    lines.push(spec.info.description.trim(), "");
  }

  if (Array.isArray(spec.servers) && spec.servers.length > 0) {
    lines.push("## Servers", "");
    lines.push("| URL | Beschrijving |");
    lines.push("| --- | --- |");
    for (const server of spec.servers) {
      lines.push(
        `| \`${mdCell(server.url ?? "")}\` | ${mdCell(server.description ?? "")} |`,
      );
    }
    lines.push("");
  }

  const schemes = spec.components?.securitySchemes ?? {};
  if (Object.keys(schemes).length > 0) {
    lines.push("## Authenticatie", "");
    for (const [name, scheme] of Object.entries(schemes)) {
      const kind = [scheme.type, scheme.scheme].filter(Boolean).join(" / ");
      lines.push(`- **${name}** (${kind})${scheme.description ? ` — ${scheme.description}` : ""}`);
    }
    if (Array.isArray(spec.security) && spec.security.length > 0) {
      lines.push("", "Standaard (tenzij een endpoint `security: []` heeft): HTTP Basic Auth.");
    }
    lines.push("");
  }

  const operations = collectOperations(spec);
  lines.push("## Endpoints", "");
  for (const op of operations) {
    const heading = `${op.method.toUpperCase()} ${op.path}`;
    lines.push(`- [${escapeMdLinkText(heading)}](#${slugify(heading)})`);
  }
  lines.push("");

  for (const op of operations) {
    lines.push(`## ${op.method.toUpperCase()} \`${op.path}\``, "");
    if (op.summary) lines.push(`**${op.summary}**`, "");
    if (op.deprecated) lines.push("_Deprecated._", "");
    if (op.description) lines.push(op.description.trim(), "");
    if (op.tags?.length) lines.push(`Tags: ${op.tags.join(", ")}`, "");
    lines.push(`Auth: ${authLabel(op.operation, spec)}`, "");

    const parameters = resolveParameters(op.pathItem, op.operation, spec);
    if (parameters.length > 0) {
      lines.push("### Parameters", "");
      lines.push("| Naam | In | Verplicht | Type | Beschrijving |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const param of parameters) {
        const schema = param.schema ?? {};
        lines.push(
          `| \`${mdCell(param.name)}\` | ${mdCell(param.in ?? "")} | ${param.required ? "ja" : "nee"} | ${mdCell(typeLabel(schema, spec))} | ${mdCell(param.description ?? schema.description ?? "")} |`,
        );
      }
      lines.push("");
    }

    const body = op.operation.requestBody;
    if (body) {
      lines.push("### Request body", "");
      if (body.description) lines.push(body.description.trim(), "");
      if (body.required) lines.push("Verplicht.", "");
      const content = body.content ?? {};
      for (const [contentType, media] of Object.entries(content)) {
        lines.push(`\`${contentType}\``, "");
        if (media.schema) {
          lines.push(...renderSchema(media.schema, spec, 0));
          lines.push("");
        }
        if (media.example !== undefined) {
          lines.push("Voorbeeld:", "", "```json", JSON.stringify(media.example, null, 2), "```", "");
        }
      }
    }

    const responses = op.operation.responses ?? {};
    if (Object.keys(responses).length > 0) {
      lines.push("### Responses", "");
      for (const [code, raw] of Object.entries(responses)) {
        const response = deref(raw, spec);
        lines.push(`**${code}**${response.description ? ` — ${response.description}` : ""}`, "");
        const content = response.content ?? {};
        for (const [contentType, media] of Object.entries(content)) {
          lines.push(`\`${contentType}\``, "");
          if (media.schema) {
            lines.push(...renderSchema(media.schema, spec, 0));
            lines.push("");
          }
        }
      }
    }
  }

  const schemas = spec.components?.schemas ?? {};
  if (Object.keys(schemas).length > 0) {
    lines.push("## Schemas", "");
    for (const [name, schema] of Object.entries(schemas)) {
      lines.push(`### ${name}`, "");
      if (schema.description) lines.push(schema.description.trim(), "");
      lines.push(...renderSchema(schema, spec, 0, { skipRefName: name }));
      lines.push("");
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function collectOperations(spec) {
  const operations = [];
  for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operations.push({
        path: pathKey,
        method,
        pathItem,
        operation,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        deprecated: Boolean(operation.deprecated),
      });
    }
  }
  return operations;
}

function resolveParameters(pathItem, operation, spec) {
  const merged = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const resolved = merged.map((param) => deref(param, spec));
  const seen = new Set();
  const unique = [];
  for (const param of resolved) {
    const key = `${param.in}:${param.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(param);
  }
  return unique;
}

function authLabel(operation, spec) {
  const security = operation.security ?? spec.security;
  if (Array.isArray(security) && security.length === 0) return "openbaar (geen auth)";
  if (!security || security.length === 0) return "openbaar (geen auth)";
  const names = security.flatMap((entry) => Object.keys(entry));
  return names.length ? names.join(", ") : "HTTP Basic";
}

function renderSchema(schema, spec, depth, options = {}) {
  if (depth > 6) return ["_(schema te diep genest)_"];
  const resolved = deref(schema, spec);
  const refName = schema?.$ref ? refNameFromRef(schema.$ref) : null;
  if (refName && options.skipRefName !== refName) {
    const extra = schemaNote(resolved);
    return [`\`${refName}\`${extra ? ` — ${extra}` : ""} (zie [Schemas](#schemas))`];
  }

  if (resolved.oneOf) {
    const lines = ["Een van:"];
    for (const [index, item] of resolved.oneOf.entries()) {
      lines.push(`- Optie ${index + 1}:`);
      lines.push(...indentLines(renderSchema(item, spec, depth + 1), "  "));
    }
    return lines;
  }
  if (resolved.anyOf) {
    const lines = ["Een of meer van:"];
    for (const [index, item] of resolved.anyOf.entries()) {
      lines.push(`- Optie ${index + 1}:`);
      lines.push(...indentLines(renderSchema(item, spec, depth + 1), "  "));
    }
    return lines;
  }
  if (resolved.allOf) {
    const lines = ["Combinatie van:"];
    for (const [index, item] of resolved.allOf.entries()) {
      lines.push(`- Deel ${index + 1}:`);
      lines.push(...indentLines(renderSchema(item, spec, depth + 1), "  "));
    }
    return lines;
  }

  if (resolved.type === "array" || resolved.items) {
    const extra = schemaNote(resolved);
    const header = `array${extra ? ` (${extra})` : ""} van:`;
    return [header, ...indentLines(renderSchema(resolved.items ?? {}, spec, depth + 1), "  ")];
  }

  if (resolved.properties) {
    const required = new Set(resolved.required ?? []);
    const lines = [
      `object${schemaNote(resolved) ? ` (${schemaNote(resolved)})` : ""}`,
      "",
      "| Veld | Type | Verplicht | Beschrijving |",
      "| --- | --- | --- | --- |",
    ];
    for (const [name, prop] of Object.entries(resolved.properties)) {
      const propResolved = deref(prop, spec);
      lines.push(
        `| \`${mdCell(name)}\` | ${mdCell(typeLabel(prop, spec))} | ${required.has(name) ? "ja" : "nee"} | ${mdCell(propResolved.description ?? "")} |`,
      );
    }
    return lines;
  }

  const extra = schemaNote(resolved);
  return [`\`${typeLabel(resolved, spec)}\`${extra ? ` — ${extra}` : ""}`];
}

function schemaNote(schema) {
  const bits = [];
  if (schema.enum) bits.push(`enum: ${schema.enum.join(", ")}`);
  if (schema.format) bits.push(schema.format);
  if (schema.maxItems != null) bits.push(`max ${schema.maxItems}`);
  if (schema.maxLength != null) bits.push(`maxLength ${schema.maxLength}`);
  if (schema.example !== undefined) bits.push(`voorbeeld: ${JSON.stringify(schema.example)}`);
  return bits.join("; ");
}

function typeLabel(schema, spec) {
  if (!schema) return "";
  if (schema.$ref) return refNameFromRef(schema.$ref);
  const resolved = deref(schema, spec);
  if (resolved.oneOf) return resolved.oneOf.map((item) => typeLabel(item, spec)).join(" \\| ");
  if (resolved.anyOf) return resolved.anyOf.map((item) => typeLabel(item, spec)).join(" \\| ");
  if (resolved.type === "array" || resolved.items) {
    return `${typeLabel(resolved.items ?? {}, spec)}[]`;
  }
  if (resolved.enum) return `${resolved.type ?? "string"} (${resolved.enum.join(" \\| ")})`;
  if (resolved.format) return `${resolved.type ?? "object"} (${resolved.format})`;
  return resolved.type ?? "object";
}

function deref(node, spec) {
  if (!node || typeof node !== "object" || !node.$ref) return node ?? {};
  const value = resolvePointer(spec, node.$ref);
  if (!value) return { description: `onbekende $ref ${node.$ref}` };
  return value;
}

function resolvePointer(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  let current = spec;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    current = current?.[key];
  }
  return current ?? null;
}

function refNameFromRef(ref) {
  return String(ref).split("/").pop() ?? ref;
}

function mdCell(text) {
  return String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n+/g, " ")
    .trim();
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeMdLinkText(text) {
  return String(text).replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function indentLines(lines, prefix) {
  return lines.map((line) => (line === "" ? line : `${prefix}${line}`));
}

main();
