# Notas del laboratorio 🧪

Bitácora de experimentos de la app de Sigatoka en la rama `laboratorio`.

Esta rama es un espacio de pruebas. Los cambios de aquí **no** van directo a
la app de los productores (`main`): el dueño técnico los revisa e implementa.

Cada entrada registra: qué se pidió, el problema de campo que resuelve, qué
archivos se tocaron y si quedó algo pendiente.

---

## 2026-10-13 — Configuración inicial del laboratorio

- **Qué se pidió:** preparar la rama `laboratorio` y dejar guardado el cambio
  del `.gitignore` que ignora los archivos `.env` (archivos con contraseñas).
- **Problema que resuelve:** evita subir secretos al repositorio por accidente.
- **Qué se tocó:** `.gitignore` (commiteado en `main` y traído a `laboratorio`),
  y se creó este archivo `NOTAS-LABORATORIO.md`.
- **Pendiente para el desarrollador:**
  - Las reglas del laboratorio solo viven como texto pegado en la conversación;
    no existen en ningún archivo del repo. No hay `.claude/settings.json` ni
    carpeta `.claude/`. Si quieres que las reglas y los permisos queden
    commiteados **solo** en esta rama, hay que crearlos.
  - Confirmar que exista el "link del laboratorio" (deploy de preview en Vercel
    para esta rama) para que el colaborador vea los cambios desde el celular.

## 2026-10-13 — Fijar las reglas del laboratorio en archivos

- **Qué se pidió:** dejar las reglas del laboratorio escritas en el repo (no
  solo en la conversación) y protegidas para que no se modifiquen por error.
- **Problema que resuelve:** las reglas vivían solo como texto pegado; ahora
  quedan fijas y con prioridad sobre el resto.
- **Qué se tocó:**
  - `LABORATORIO.md`: reglas del laboratorio + regla nueva "no modificar
    CLAUDE.md, LABORATORIO.md ni nada dentro de .claude/".
  - `CLAUDE.md` (solo en esta rama): dos líneas al inicio que dan prioridad a
    LABORATORIO.md y lo importan con `@LABORATORIO.md`.
  - `.claude/settings.json`: se prohíbe editar `CLAUDE.md`, `LABORATORIO.md` y
    todo dentro de `.claude/`.
- **Nota:** los candados nuevos de `.claude/settings.json` toman efecto en la
  próxima sesión de Claude Code (se leen al arrancar).
