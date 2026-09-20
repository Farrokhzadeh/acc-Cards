import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: {
    ssr: "server/jobs/worker.ts",
    outDir: "dist-worker",
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: "worker.mjs" },
      external: ["pg", "zod"],
    },
  },
});
