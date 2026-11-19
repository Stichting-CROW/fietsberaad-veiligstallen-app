export async function register() {
  // Must stay an if-block on NEXT_RUNTIME so webpack drops the Node-only import from the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInternalTick } = await import("./instrumentation-node");
    startInternalTick();
  }
}
