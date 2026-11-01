/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The saved module cache keeps stale import.meta.glob results, so a new
    // battery folder went unseen and a failing test passed locally.
    fsModuleCache: false,
  },
});
