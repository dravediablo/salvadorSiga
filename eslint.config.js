import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'dev-dist', 'referencia', 'scripts', 'datos-locales', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      // Los diálogos nativos están prohibidos: se usan los de la app (src/ui/dialogos.tsx).
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'No uses alert(): usa avisar() o confirmar() de src/ui/dialogos.tsx.' },
        { name: 'confirm', message: 'No uses confirm(): usa confirmar() de src/ui/dialogos.tsx.' },
        { name: 'prompt', message: 'No uses prompt(): usa un diálogo propio de la app.' },
      ],
      'no-restricted-properties': [
        'error',
        ...['alert', 'confirm', 'prompt'].flatMap((nombre) =>
          ['window', 'globalThis', 'self'].map((objeto) => ({ object: objeto, property: nombre, message: `No uses ${objeto}.${nombre}(): usa los diálogos de la app.` })),
        ),
      ],
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
  {
    // La interfaz no toca la base: lee con `consultas` y escribe con `repos`, ambos desde '@/datos'.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: 'La interfaz no importa Dexie: usa @/datos (consultas y repos).' }],
          patterns: [
            { group: ['@/datos/*', '**/datos/*'], message: 'Importa solo desde "@/datos"; las escrituras deben pasar por los repositorios.' },
          ],
        },
      ],
    },
  },
  {
    // La capa de datos no depende de la interfaz ni de la PWA.
    files: ['src/datos/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/datos no puede importar React.' },
            { group: ['@/ui', '@/ui/*', '@/pwa', '@/pwa/*', '**/ui/*', '**/pwa/*'], message: 'src/datos no puede depender de ui ni pwa.' },
          ],
        },
      ],
    },
  },
)
