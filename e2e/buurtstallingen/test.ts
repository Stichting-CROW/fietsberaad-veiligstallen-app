import { test as base } from "@playwright/test";
import { seed } from "./seed";

export const test = base.extend({});

test.beforeEach(async () => {
  await seed();
});

export { expect } from "@playwright/test";
