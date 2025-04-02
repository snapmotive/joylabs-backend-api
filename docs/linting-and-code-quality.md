# Linting and Code Quality Guide

This document outlines the linting and code quality standards for the JoyLabs Backend API, providing practical guidance for developers.

## Overview

The JoyLabs codebase uses ESLint with Prettier for code formatting and quality enforcement. We've configured these tools to work optimally with Node.js 22, TypeScript, and our specific coding conventions.

## ESLint Configuration

Our ESLint configuration is defined in `.eslintrc.json` and is designed to accommodate both TypeScript and JavaScript files:

```json
{
  "env": {
    "node": true,
    "es2022": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-var-requires": "off",
    "no-console": "off",
    "no-undef": "warn",
    "no-unused-vars": "off",
    "no-useless-catch": "off",
    "prettier/prettier": [
      "error",
      {
        "singleQuote": true,
        "trailingComma": "es5",
        "printWidth": 100
      }
    ]
  },
  "ignorePatterns": [
    "node_modules",
    ".serverless",
    ".build",
    "dist",
    "coverage",
    "webpack.config.js",
    "scripts/**/*.js",
    "test/**/*.js",
    "test-*.js",
    "unused-firebase-files/**/*"
  ]
}
```

### Key Configuration Choices

1. **ES2022 Environment**: Enables modern JavaScript features supported by Node.js 22
2. **TypeScript Integration**: Uses TypeScript-specific ESLint rules where appropriate
3. **Pragmatic Rule Relaxation**: Disables some rules that would be too strict for a transitional codebase
4. **Selective Ignore Patterns**: Excludes test files, scripts, and build artifacts from linting

## Prettier Configuration

Our Prettier configuration is defined in `.prettierrc`:

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

This ensures consistent code formatting throughout the project.

## TypeScript Configuration

The TypeScript configuration in `tsconfig.json` works in conjunction with ESLint:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "lib": ["ES2022"],
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": ".build",
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["src/**/*", "tests/**/*", "scripts/**/*", "test/**/*", "webpack.config.js"]
}
```

### Key Configuration Choices

1. **ES2022 Target**: Matches the Node.js 22 runtime capabilities
2. **allowJs**: Enables gradual TypeScript adoption
3. **strict**: Enforces type safety where TypeScript is used
4. **Include Patterns**: Covers source code, tests, and configuration files

## Git Hooks with Husky

We use Husky to enforce linting on pre-commit:

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

This runs ESLint and Prettier on staged files before they can be committed.

## Running Linting Commands

### Check Code Quality

```bash
# Run ESLint without fixing issues
npm run lint
```

### Fix Linting Issues

```bash
# Automatically fix linting issues where possible
npm run lint:fix
```

### Format Code with Prettier

```bash
# Format all files with Prettier
npm run format
```

## Common Linting Issues and Solutions

### 1. Import/Require Issues

**Problem**: ESLint complains about CommonJS `require()` statements

**Solution**: We've disabled the `@typescript-eslint/no-var-requires` rule to accommodate our hybrid codebase:

```javascript
// This is allowed in our codebase
const express = require('express');
```

When writing new TypeScript files, prefer ES imports:

```typescript
// Preferred in new TypeScript files
import express from 'express';
```

### 2. Unused Variables

**Problem**: ESLint warns about unused variables or imports

**Solution**: While we've disabled the `no-unused-vars` rule for compatibility, it's still good practice to clean up unused variables:

```javascript
// Instead of:
const { method, path, body, query } = req;
// If only using method and path:
const { method, path } = req;
```

For callback parameters you don't use, prefix with underscore:

```javascript
// Instead of:
app.get('/api/health', (req, res, next) => {
  res.json({ status: 'ok' });
});

// Use:
app.get('/api/health', (_req, res, _next) => {
  res.json({ status: 'ok' });
});
```

### 3. Console Statements

**Problem**: Production code shouldn't contain `console.log` statements

**Solution**: While we've disabled the `no-console` rule for development, use proper logging in production code:

```javascript
// Instead of:
console.log('User authenticated:', userId);

// Prefer structured logging:
logger.info('User authenticated', { userId, timestamp: new Date().toISOString() });
```

## Best Practices

### 1. Consistent Error Handling

Use the Error Cause pattern for better error tracking:

```javascript
try {
  await someOperation();
} catch (error) {
  throw new Error('Failed to perform operation', { cause: error });
}
```

### 2. Type Annotations

Add TypeScript types for function parameters and return values:

```typescript
function getUserById(id: string): Promise<User | null> {
  // Implementation
}
```

### 3. Async/Await

Prefer async/await over Promises with then/catch:

```javascript
// Instead of:
fetchData()
  .then(data => processData(data))
  .catch(error => handleError(error));

// Prefer:
try {
  const data = await fetchData();
  await processData(data);
} catch (error) {
  handleError(error);
}
```

### 4. Destructuring

Use object destructuring for cleaner code:

```javascript
// Instead of:
const userId = req.params.userId;
const userRole = req.body.role;

// Prefer:
const { userId } = req.params;
const { role: userRole } = req.body;
```

## Gradual TypeScript Migration

We're gradually migrating the codebase to TypeScript. When working on a JavaScript file:

1. Consider converting it to TypeScript if making substantial changes
2. At minimum, add JSDoc comments with type information:

```javascript
/**
 * Get a merchant by ID
 * @param {string} merchantId - The merchant's Square ID
 * @returns {Promise<Object|null>} Merchant data or null if not found
 */
exports.getMerchantById = async merchantId => {
  // Implementation
};
```

## Conclusion

Following these linting and code quality guidelines ensures our codebase remains maintainable, consistent, and gradually improves in type safety and quality. By leveraging ESLint, Prettier, TypeScript, and Husky, we enforce these standards automatically to reduce technical debt and improve developer productivity.
