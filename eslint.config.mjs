import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import noSecrets from "eslint-plugin-no-secrets";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "notes/**",
      "next-env.d.ts",
      "package-lock.json"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"] ,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      security,
      sonarjs,
      "no-secrets": noSecrets
    },
    rules: {
      ...security.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      "no-secrets/no-secrets": [
        "error",
        {
          tolerance: 4.2,
          additionalRegexes: {
            "Potential API key": "(?i)(api[_-]?key|secret|token)\\s*[:=]\\s*['\"][A-Za-z0-9_\\-]{16,}['\"]"
          }
        }
      ]
    }
  }
);