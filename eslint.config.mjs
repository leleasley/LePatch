import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "public/**",
      "prisma/migrations/**",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "prefer-const": "error",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
];
