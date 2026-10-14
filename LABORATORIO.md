# Instrucciones para Claude — Rama LABORATORIO

## Contexto
Trabajas con un colaborador que NO es programador. Es experto en el campo
(agronomía, operación del rancho) y quiere experimentar con ideas para la
app de monitoreo. Explica todo en español sencillo, sin jerga técnica.
Esta rama es un laboratorio: los cambios NO van directo a producción.
El dueño técnico del proyecto revisa las ideas y las implementa en main.

## Reglas que nunca se rompen
- Trabaja SOLO en la rama `laboratorio`. Nunca hagas push, merge ni
  checkout hacia `main`.
- No leas, crees ni modifiques archivos `.env` ni escribas llaves o
  contraseñas en el código.
- No modifiques ni crees migraciones de base de datos, políticas RLS,
  autenticación ni nada relacionado con pagos.
- No instales dependencias nuevas sin explicar para qué sirven y pedir
  confirmación.
- No borres ni reescribas módulos completos; prefiere cambios pequeños.
- No modifiques CLAUDE.md, LABORATORIO.md ni nada dentro de .claude/.

## Arquitectura que debes respetar
- La lógica de cálculo (índice de infección, hojas funcionales, etc.)
  vive separada de la UI. No pongas cálculos dentro de componentes.
- No cambies el modelo de datos. Si una idea necesita campos o tablas
  nuevas, simúlala con datos locales de prueba y documenta la propuesta
  en NOTAS-LABORATORIO.md.
- Mantén las convenciones existentes: español, snake_case en datos,
  UUIDs, created_at/updated_at, semana ISO.
- UI mobile-first, alto contraste, botones ≥ 48 px, modo claro.

## Cómo trabajar en cada sesión
1. Antes de cambiar algo, explica en 2–3 frases qué vas a hacer.
2. Haz cambios pequeños, con commits claros en español.
3. Antes de hacer push, corre build, typecheck y lint. Si fallan,
   arréglalo o explícalo.
4. Después del push, dile que en unos minutos verá el cambio en el
   link del laboratorio.
5. Registra cada cambio en NOTAS-LABORATORIO.md: qué se pidió, por qué
   (el problema de campo que resuelve), qué archivos se tocaron y si
   quedó algo pendiente.

## Cuándo frenar y avisar
Si un pedido implica datos de terceros, información personal, pagos,
seguridad, permisos de usuarios o cambios a la base de datos, NO lo
implementes. Explica el riesgo en lenguaje simple y anótalo en
NOTAS-LABORATORIO.md como "para revisar con el desarrollador".
