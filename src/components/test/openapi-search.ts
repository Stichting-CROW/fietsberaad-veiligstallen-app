const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const SCHEMA_REF_PREFIX = "#/components/schemas/";
const MIN_QUERY_LENGTH = 2;
const MAX_HITS = 40;

export type OpenApiDocument = {
  paths?: Record<string, Record<string, unknown>>;
  tags?: { name?: string; description?: string }[];
  components?: {
    schemas?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type OpenApiSearchHit = {
  id: string;
  title: string;
  detail: string;
  hash: string;
};

export type OpenApiSearchResult = {
  spec: OpenApiDocument;
  hits: OpenApiSearchHit[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const schemaNameFromRef = (ref: string): string | null => {
  if (!ref.startsWith(SCHEMA_REF_PREFIX)) return null;
  return decodeURIComponent(ref.slice(SCHEMA_REF_PREFIX.length));
};

const clip = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, 220);

const pointerHash = (path: string, method: string): string => {
  const encoded = path.replace(/~/g, "~0").replace(/\//g, "~1");
  return `#/paths/${encoded}/${method}`;
};

const collectSchemaText = (
  name: string,
  schemas: Record<string, unknown>,
  visiting: Set<string>
): string => {
  if (visiting.has(name)) return name;
  const schema = schemas[name];
  if (!schema) return name;
  visiting.add(name);
  const text = `${name} ${nodeText(schema, schemas, visiting)}`;
  visiting.delete(name);
  return text;
};

const nodeText = (
  node: unknown,
  schemas: Record<string, unknown>,
  visiting: Set<string>
): string => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map((item) => nodeText(item, schemas, visiting)).join(" ");
  if (!isRecord(node)) return "";
  if (typeof node.$ref === "string") {
    const name = schemaNameFromRef(node.$ref);
    return name ? collectSchemaText(name, schemas, visiting) : node.$ref;
  }
  return Object.entries(node)
    .map(([key, value]) => `${key} ${nodeText(value, schemas, visiting)}`)
    .join(" ");
};

const collectSchemaRefs = (node: unknown, into: Set<string>) => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectSchemaRefs(item, into));
    return;
  }
  if (!isRecord(node)) return;
  if (typeof node.$ref === "string") {
    const name = schemaNameFromRef(node.$ref);
    if (name) into.add(name);
  }
  Object.values(node).forEach((value) => collectSchemaRefs(value, into));
};

const schemaHits = (
  schemaName: string,
  schema: unknown,
  phrase: string
): OpenApiSearchHit[] => {
  const hits: OpenApiSearchHit[] = [];
  const record = isRecord(schema) ? schema : null;
  const description = record && typeof record.description === "string" ? record.description : "";
  const hash = `#/components/schemas/${encodeURIComponent(schemaName)}`;
  if (schemaName.toLowerCase().includes(phrase) || description.toLowerCase().includes(phrase)) {
    hits.push({
      id: `schema:${schemaName}`,
      title: schemaName,
      detail: clip(description || schemaName),
      hash,
    });
  }
  const properties = record && isRecord(record.properties) ? record.properties : null;
  if (!properties) return hits;
  for (const [propName, propSchema] of Object.entries(properties)) {
    const prop = isRecord(propSchema) ? propSchema : null;
    const propDescription = prop && typeof prop.description === "string" ? prop.description : "";
    const enumText = prop && Array.isArray(prop.enum) ? prop.enum.map(String).join(" ") : "";
    const blob = `${propName} ${propDescription} ${enumText}`.toLowerCase();
    if (!blob.includes(phrase)) continue;
    hits.push({
      id: `schema:${schemaName}.${propName}`,
      title: `${schemaName}.${propName}`,
      detail: clip(propDescription || enumText || propName),
      hash,
    });
  }
  return hits;
};

const operationOwnText = (method: string, path: string, operation: Record<string, unknown>): string => {
  const tags = Array.isArray(operation.tags) ? operation.tags.join(" ") : "";
  const summary = typeof operation.summary === "string" ? operation.summary : "";
  const description = typeof operation.description === "string" ? operation.description : "";
  const parameters = nodeText(operation.parameters, {}, new Set());
  return `${method} ${path} ${tags} ${summary} ${description} ${parameters}`;
};

/**
 * Filter an OpenAPI document by a case-insensitive phrase.
 * Matches operation text and schema names, descriptions, property names and enums.
 * A blank or one-character query returns the original document.
 */
export const searchOpenApi = (spec: OpenApiDocument, rawQuery: string): OpenApiSearchResult => {
  const phrase = rawQuery.trim().toLowerCase();
  if (phrase.length < MIN_QUERY_LENGTH) return { spec, hits: [] };

  const schemas = spec.components?.schemas ?? {};
  const hits: OpenApiSearchHit[] = [];
  const matchingSchemaNames = new Set<string>();

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const schemaHitList = schemaHits(schemaName, schema, phrase);
    if (schemaHitList.length > 0) matchingSchemaNames.add(schemaName);
    hits.push(...schemaHitList);
  }

  const keptPaths: Record<string, Record<string, unknown>> = {};
  const referencedSchemas = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!isRecord(pathItem)) continue;
    const keptItem: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(key)) keptItem[key] = value;
    }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !isRecord(operation)) continue;
      const resolved = nodeText(operation, schemas, new Set());
      const own = operationOwnText(method, path, operation);
      if (!`${own} ${resolved}`.toLowerCase().includes(phrase)) continue;
      keptItem[method] = operation;
      collectSchemaRefs(operation, referencedSchemas);
      if (own.toLowerCase().includes(phrase)) {
        const summary = typeof operation.summary === "string" ? operation.summary : "";
        const description = typeof operation.description === "string" ? operation.description : "";
        hits.push({
          id: `operation:${method}:${path}`,
          title: `${method.toUpperCase()} ${path}`,
          detail: clip(summary || description),
          hash: pointerHash(path, method),
        });
      }
    }
    if (Object.keys(keptItem).some((key) => HTTP_METHODS.has(key))) {
      keptPaths[path] = keptItem;
    }
  }

  const keptSchemaNames = new Set<string>([...matchingSchemaNames, ...referencedSchemas]);
  const keptSchemas: Record<string, unknown> = {};
  for (const name of keptSchemaNames) {
    if (name in schemas) keptSchemas[name] = schemas[name];
  }

  const usedTags = new Set<string>();
  for (const pathItem of Object.values(keptPaths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !isRecord(operation) || !Array.isArray(operation.tags)) continue;
      for (const tag of operation.tags) {
        if (typeof tag === "string") usedTags.add(tag);
      }
    }
  }

  const next: OpenApiDocument = {
    ...spec,
    paths: keptPaths,
    components: {
      ...spec.components,
      schemas: keptSchemas,
    },
  };
  if (Array.isArray(spec.tags)) {
    next.tags = spec.tags.filter((tag) => {
      const name = tag.name ?? "";
      const description = tag.description ?? "";
      return usedTags.has(name) || `${name} ${description}`.toLowerCase().includes(phrase);
    });
  }

  return { spec: next, hits: hits.slice(0, MAX_HITS) };
};
