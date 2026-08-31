# Un acceso crudo nuevo no aparece en silencio · 2026-08-31

Sustituye al plan del `AuthzContext`, **rechazado en compuerta 2** el mismo día
(«el coste no vale la garantía obtenida»). La forma la propuso esa misma
revisión; el terreno lo medí después.

## La propiedad, dicha con precisión

**Que nadie pueda añadir un camino de acceso crudo a la base sin que algo lo
diga.** Ni más ni menos.

**No prueba** que la autorización sea *correcta*. Un `requireLotAccess` con el
permiso equivocado seguiría pasando. Tampoco lo probaba el `AuthzContext`, y
esto cuesta una fracción.

## El terreno, medido hoy

- **Dos** construcciones de `PrismaClient`, y sólo dos:
  `lib/db.ts` (acceso total) y `lib/ai/db.ts` (`aiPrisma`).
- **`lib/ai/db.ts` está atado al rol `ai_service`** de Postgres: `INSERT`+`SELECT`
  sobre `ai.recommendation` y nada más (AI_GOVERNANCE.md §3, ADR-033). Es la
  frontera más fuerte del sistema porque no la impone el código. Lo importa **un
  solo archivo**: `lib/ai/service.ts`.
- **50 archivos** importan `lib/db`; **5** de ellos bajo `app/**`.
- 41 archivos importan de `generated/prisma`, pero **sólo tipos**. Ninguno
  importa `PrismaClient` salvo los dos clientes.

## Qué se hace

1. **`tests/arquitectura/acceso-a-datos.test.ts`** — un test que inventaría:
   - toda construcción de `PrismaClient` → debe ser exactamente el conjunto
     conocido de dos, en sus rutas;
   - todo import de `lib/db` → debe coincidir con una allowlist versionada;
   - todo import de `lib/ai/db` → sólo `lib/ai/service.ts`;
   - y **falla ante cualquier entrada nueva**, nombrándola.
2. **`docs/arquitectura/acceso-a-datos.allowlist.json`** — la lista, versionada,
   con una razón por entrada. Añadir una es un acto deliberado y visible en el
   diff, no un efecto secundario.
3. **`no-restricted-imports`** en ESLint: `app/**` no importa `lib/db` ni
   `lib/ai/db`. Las 5 excepciones actuales quedan listadas con su razón hasta
   que se migren.
4. **Migrar los 5 imports de `app/**`** a servicios de dominio. Es el único
   cambio de código, y son cinco archivos, no cincuenta y uno.

## Cómo sabremos que funcionó

1. **Un cliente nuevo hace fallar el test.** Prueba: añadir un tercer
   `new PrismaClient` en un fixture y verlo fallar nombrando el archivo;
   quitarlo y verlo pasar.
2. **Un import nuevo de `lib/db` hace fallar el test**, y el mensaje dice qué
   archivo y qué hacer: justificarlo en la allowlist o usar un servicio.
3. **Un import de `lib/ai/db` desde cualquier sitio que no sea
   `lib/ai/service.ts` hace fallar el test.** Es la frontera que protege el rol
   restringido.
4. **ESLint rechaza un `import` de `lib/db` desde `app/**`.** Prueba: añadirlo a
   un archivo de `app/` y ver fallar `npm run lint`.
5. **Los 5 de `app/**` bajan a 0**, o los que queden están en la allowlist con
   una razón escrita.
6. **La salida dice qué NO prueba.** Sin ✓ global y sin la palabra «seguro».

## Qué toca

- Nuevo: el test y la allowlist.
- Modificado: `eslint.config.mjs`, y 5 archivos de `app/**`.
- `PENDING_IMPLEMENTATIONS/005` → reescrito con lo que sí queda demostrado.

## Riesgos, y el coste si me equivoco

- **La allowlist se vuelve un trámite.** Si cada PR añade una línea sin pensar,
  el guardia no guarda. *Mitigación:* exige una razón por entrada, y el número
  se reporta; que suba es una señal, no un detalle.
- **Detecta imports, no operaciones.** Un archivo ya en la lista puede añadir
  cien consultas sin que nadie lo note. *Coste:* creer que cubre más de lo que
  cubre. *Mitigación:* decirlo en el propio test y en 005.
- **`$transaction` propaga acceso** (28 usos) y esto no lo mira. *Mitigación:*
  anotado como límite conocido, no como cosa resuelta.

## Una advertencia sobre esta misma revisión

**La forma de este plan la propuso Codex.** Mandárselo a revisar sería pedirle
que revise su propia idea, y la regla es no tener un mismo asiento como autor y
revisor del mismo artefacto. Si se revisa, que sea con esa advertencia por
delante, o por otro asiento.

## Revisión — hallazgos y adjudicación

| # | hallazgo | veredicto | razón | coste si me equivoco |
|---|----------|-----------|-------|----------------------|
| _pendiente_ | | | | |
