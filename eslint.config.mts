// eslint.config.js (flat config)
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // JS only: built-in JS recommended rules
  {
    files: ["src/**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        Bun: true,
      },
    },
  },

  // TypeScript: strict, type-aware linting
  ...tseslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Project-wide parser options for typed linting (tsconfig-aware)
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        Bun: true,
      },
    },
  },

  // TS-specific rules aligned with the tsconfig
  {
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      // TS already surfaces unused locals/params; avoid duplicate lint noise
      // "no-unused-vars": "off",
      // "@typescript-eslint/no-unused-vars": "off",

      // TS 5 verbatimModuleSyntax: prefer explicit type-only imports/exports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",

      // TS compiler handles fallthrough; avoid duplicate ESLint report
      "no-fallthrough": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },

  // Ensure JS files aren’t type-checked by TS-aware rules
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
