module.exports = {
  root: true,
  env: { browser: true, node: true, es2023: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: ["tsconfig.server.json", "tsconfig.client.json"],
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/stylistic",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  settings: {
    "import/resolver": {
      typescript: { project: ["tsconfig.server.json", "tsconfig.client.json"] },
    },
  },
  rules: {
    "no-console": "off",
    "import/no-unresolved": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-ts-comment": "off",
  },
  ignorePatterns: ["dist/**", "node_modules/**", "public/*.js"],
};
