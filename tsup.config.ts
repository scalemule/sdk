import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/flags/server.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  noExternal: ["@scalemule/ui"],
  external: ["browser-image-compression"],
});
