import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Parse Prisma schema to extract foreign key relationships
 * Returns a map of table -> [tables it depends on]
 */
function parseSchemaDependencies(): Map<string, Set<string>> {
  const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  
  const dependencies = new Map<string, Set<string>>();
  const modelRegex = /^model\s+(\w+)\s*\{/gm;
  let currentModel: string | null = null;
  let modelContent = '';
  
  // Split schema into model blocks
  const lines = schemaContent.split('\n');
  let inModel = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for model start
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      // Save previous model if exists
      if (currentModel && modelContent) {
        parseModelDependencies(currentModel, modelContent, dependencies);
      }
      currentModel = modelMatch[1];
      modelContent = line + '\n';
      inModel = true;
      continue;
    }
    
    // Check for model end
    if (inModel) {
      if (line.trim() === '}') {
        modelContent += line + '\n';
        if (currentModel) {
          parseModelDependencies(currentModel, modelContent, dependencies);
        }
        currentModel = null;
        modelContent = '';
        inModel = false;
      } else {
        modelContent += line + '\n';
      }
    }
  }
  
  return dependencies;
}

/**
 * Parse a single model to extract foreign key dependencies
 */
function parseModelDependencies(
  modelName: string,
  modelContent: string,
  dependencies: Map<string, Set<string>>
): void {
  if (!dependencies.has(modelName)) {
    dependencies.set(modelName, new Set());
  }
  
  // Pattern 1: fieldName ModelName? @relation(fields: [field], references: [refField])
  // Example: security_users security_users @relation(fields: [UserID], references: [UserID])
  // Example: security_roles security_roles? @relation(fields: [RoleID], references: [RoleID])
  const relationPattern1 = /(\w+)\s+(\w+)\??(\[\])?\s+@relation\s*\([^)]*fields:\s*\[[^\]]+\][^)]*references:\s*\[[^\]]+\][^)]*\)/g;
  const matches1 = [...modelContent.matchAll(relationPattern1)];
  
  for (const match of matches1) {
    // match[2] is the model name (the type of the field)
    const referencedModel = match[2];
    if (referencedModel && referencedModel !== modelName) {
      // Only add if it looks like a model name (not a primitive type)
      const primitiveTypes = ['String', 'Int', 'Boolean', 'DateTime', 'Decimal', 'BigInt', 'Float', 'Bytes', 'Json'];
      if (!primitiveTypes.includes(referencedModel)) {
        dependencies.get(modelName)!.add(referencedModel);
      }
    }
  }
  
  // Pattern 2: ModelName? @relation("relationName", fields: [field], references: [refField])
  // Example: contacts? @relation("fietsenstallingen_SiteIDTocontacts", fields: [SiteID], references: [ID])
  // This pattern has the model name before @relation
  const relationPattern2 = /(\w+)\??(\[\])?\s+@relation\s*\([^)]*fields:\s*\[[^\]]+\][^)]*references:\s*\[[^\]]+\][^)]*\)/g;
  const matches2 = [...modelContent.matchAll(relationPattern2)];
  
  for (const match of matches2) {
    const referencedModel = match[1];
    if (referencedModel && referencedModel !== modelName) {
      const primitiveTypes = ['String', 'Int', 'Boolean', 'DateTime', 'Decimal', 'BigInt', 'Float', 'Bytes', 'Json'];
      if (!primitiveTypes.includes(referencedModel)) {
        dependencies.get(modelName)!.add(referencedModel);
      }
    }
  }
}

/**
 * Topological sort to determine sync order
 * Tables without dependencies come first
 */
function topologicalSort(
  tables: string[],
  dependencies: Map<string, Set<string>>
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  
  // Build dependency map for the given tables only
  const tableDeps = new Map<string, Set<string>>();
  for (const table of tables) {
    const deps = dependencies.get(table) || new Set();
    // Only include dependencies that are in our table list
    const filteredDeps = new Set(
      Array.from(deps).filter(dep => tables.includes(dep))
    );
    tableDeps.set(table, filteredDeps);
  }
  
  function visit(table: string) {
    if (visiting.has(table)) {
      // Circular dependency - log warning but continue
      console.warn(`Circular dependency detected involving table: ${table}`);
      return;
    }
    if (visited.has(table)) {
      return;
    }
    
    visiting.add(table);
    const deps = tableDeps.get(table) || new Set();
    for (const dep of deps) {
      if (tables.includes(dep)) {
        visit(dep);
      }
    }
    visiting.delete(table);
    visited.add(table);
    result.push(table);
  }
  
  for (const table of tables) {
    if (!visited.has(table)) {
      visit(table);
    }
  }
  
  return result;
}

/**
 * Get ordered tables based on foreign key dependencies
 */
export function getOrderedTables(tables: string[]): string[] {
  try {
    const dependencies = parseSchemaDependencies();
    return topologicalSort(tables, dependencies);
  } catch (error) {
    console.error('Error determining table order, using original order:', error);
    return tables; // Fallback to original order
  }
}

