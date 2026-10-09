import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'dev-dist', 'referencia', 'scripts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // La capa de dominio es lógica pura: no puede depender de otras capas ni de frameworks.
    files: ['src/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/dominio no puede importar React.' },
            { group: ['dexie', 'dexie/*', '@supabase/*'], message: 'src/dominio no puede importar Dexie ni Supabase.' },
            {
              group: ['@/datos', '@/datos/*', '@/ui', '@/ui/*', '@/pwa', '@/pwa/*', '**/datos/*', '**/ui/*', '**/pwa/*'],
              message: 'src/dominio no puede depender de datos, ui ni pwa.',
            },
          ],
        },
      ],
    },
  },
)
