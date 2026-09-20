// @ts-check
import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Strict, type-aware linting on top of `strict: true` in tsconfig.json.
// `strictTypeChecked` + `stylisticTypeChecked` is typescript-eslint's own
// "turn everything sensible on" bundle — the closest equivalent in this
// ecosystem to running PHPStan at its highest level: rules here catch
// things `tsc` alone won't (floating promises, unnecessary conditions,
// unsafe `any` usage that leaked past a missing type, etc.).
export default defineConfig(
  globalIgnores(["dist/**", "node_modules/**"]),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules need a tsconfig to check against; `projectService`
        // finds the right one per file automatically.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // This file sits outside tsconfig.json's `include: ["src"]`, so there's
    // no real project to type-check it against. Rather than fight that,
    // turn type-aware rules off just for it — typescript-eslint's own
    // documented pattern for linting its own flat config file.
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
