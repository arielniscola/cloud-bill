import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Igual que en el backend: los `any` se ven como aviso, no frenan el lint.
      '@typescript-eslint/no-explicit-any': 'warn',
      // "Poner cargando y pedir datos" dentro de un efecto es el patrón de todas las
      // páginas; queda como aviso hasta migrarlas una por una.
      'react-hooks/set-state-in-effect': 'warn',
      // `_x` y los hermanos de un rest (`{ productId: _productId, ...rest }`) son descartes a propósito.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
    },
  },
])
