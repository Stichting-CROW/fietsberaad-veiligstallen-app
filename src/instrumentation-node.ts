import { decideInternalTick } from "./server/background/internal-tick";

export function startInternalTick() {
  const decision = decideInternalTick(process.env);
  if (!decision.enabled) {
    console.log(`[background] internal tick off (${decision.reason})`);
    return;
  }

  const holder = globalThis as unknown as { __vsBackgroundTimer?: ReturnType<typeof setInterval> };
  if (holder.__vsBackgroundTimer) return;

  const source = process.env.NODE_ENV === "development" ? "internal-dev" : "internal";
  const tick = async () => {
    try {
      const { runTick } = await import("./server/background/runner");
      await runTick({ source, budgetMs: 50_000 });
    } catch (error) {
      console.error("[background] internal tick failed:", error instanceof Error ? error.message : error);
    }
  };
  holder.__vsBackgroundTimer = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 10_000);
  console.log(`[background] internal tick on (${decision.reason})`);
}
