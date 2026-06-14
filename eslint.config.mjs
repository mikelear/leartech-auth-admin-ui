// ESLint flat config for Angular 20.
//
// Uses the unified `angular-eslint` meta-package (Angular 18+ ships
// the configs + processor + template-parser under one package).
//
// Centralisation: kept self-contained per consumer repo. ESM flat config
// doesn't compose cleanly over HTTP (what works for golangci-lint's
// yq-merge doesn't map). Migration path if fleet rule divergence becomes
// a pain: publish `@mikelear/eslint-config-leartech-angular` and
// `extends` from it.
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
);
