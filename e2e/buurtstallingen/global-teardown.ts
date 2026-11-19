import { resetFixture } from "./seed";

export default async function globalTeardown(): Promise<void> {
  await resetFixture();
}
