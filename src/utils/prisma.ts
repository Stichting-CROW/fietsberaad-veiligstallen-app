import { Prisma } from "~/generated/prisma-client";

// Helper function to process Date and other special types
const processSpecialTypes = (obj: any) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  Object.entries(obj).forEach(([key, prop]) => {
    if (prop instanceof Date) {
      obj[key] = new Date(obj[key]).toISOString();
    }
    else if (prop instanceof BigInt) {
      obj[key] = obj[key].toString();
    }
    else if (prop instanceof Prisma.Decimal) {
      obj[key] = Number(prop);
    }
    // Convert numeric IDs to strings if they should be strings
    else if (key === 'ID' && typeof prop === 'number') {
      obj[key] = prop.toString();
    }
    // Recursively process nested objects
    else if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
      obj[key] = processSpecialTypes(prop);
    }
    // Process arrays
    else if (Array.isArray(prop)) {
      obj[key] = prop.map(item => processSpecialTypes(item));
    }
  });
  return obj;
};

export {
  processSpecialTypes
}