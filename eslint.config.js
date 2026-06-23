import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import eslintReact from "@eslint-react/eslint-plugin";
import eslintCss from "@eslint/css";
import eslintJs from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import eslintReactHooks from "eslint-plugin-react-hooks";
import eslintReactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Apply global ignores using the new helper to exclude build artifacts and dependencies
  globalIgnores(["dist", "node_modules", ".agent", "drizzle"]),

  // Define the main configuration block for TypeScript React files
  {
    // Target the specific file patterns this configuration applies to
    files: ["**/*.{ts,tsx}"],

    extends: [
      eslintJs.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      eslintReact.configs["recommended-typescript"],
      eslintReact.configs["recommended-type-checked"],
      eslintReact.configs["jsx"],
      eslintReactHooks.configs.flat.recommended,
      eslintReactRefresh.configs.vite,
    ],

    // Set up language options such as the ECMAScript version and browser globals
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Register the required ESLint plugins locally
    plugins: {
      "simple-import-sort": simpleImportSort,
      "@eslint-community/eslint-comments": eslintComments,
      jsdoc,
    },

    // Define specific linting rules, pulling in React recommendations and overriding defaults
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "jsdoc/no-undefined-types": [
        "error",
        {
          markVariablesAsUsed: true,
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "off",
      "@eslint-community/eslint-comments/require-description": "error",
    },

    // Provide general settings expected by the plugins
    settings: {
      react: {
        version: "19.0",
      },
      // Point the plugin to your tsconfig.json so it correctly maps absolute paths from compilerOptions.paths
      path: {
        config: "tsconfig.json",
      },
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // Lint CSS files
  {
    files: ["**/*.css"],
    language: "css/css",
    ...eslintCss.configs.recommended,
    rules: {
      ...eslintCss.configs.recommended.rules,
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      "css/no-important": "off",
      "css/use-baseline": "off",
    },
  },
]);
