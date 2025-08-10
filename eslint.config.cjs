// ESLint flat config (CommonJS export)
const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const pluginImport = require("eslint-plugin-import");

module.exports = [
  js.configs.recommended,
  // Shared TypeScript base (applies to all TS files)
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        project: ["./tsconfig.server.json", "./tsconfig.client.json"],
      },
    },
    plugins: { "@typescript-eslint": tsPlugin, import: pluginImport },
    rules: {
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow leading underscore to intentionally mark unused
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "import/no-unresolved": "off",
      "import/order": [
        "warn",
        {
          groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  // Browser/client files (moved to src/client)
  {
    files: ["src/client/**/*.ts"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        setInterval: "readonly",
        io: "readonly",
      },
    },
  },
  // Server files
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setInterval: "readonly",
      },
    },
  },
  // Node build / utility scripts (ESM .mjs)
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/*.js",
      "public/*.js.map",
      "public/*.d.ts",
      "server/**/*.js",
    ],
  },
];
