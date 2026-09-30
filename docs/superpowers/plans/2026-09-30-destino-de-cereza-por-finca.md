# El destino de la cereza por finca — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casilla.

**Objetivo:** que el cosechador no declare a dónde va la cereza. La finca lo declara una vez, y la
jornada **copia** ese destino al abrirse.

**Arquitectura:** un campo en la `Location` de la finca, un servicio que lo declara con su
`AuditEvent`, y `abrirJornada` resolviéndolo y **congelándolo**. La clave de encaminamiento
—`jornada.beneficioId`, que `pendientesDeBeneficio` ya usa— **no cambia**; cambia **quién la pone**.

**Stack:** Next.js 16 App Router, TypeScript, Prisma 7, `next-intl`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-destino-de-cereza-por-finca-design.md` — el plan
discute desde ahí y se lee al lado. **Decisión que lo origina:** ADR-194.

**Nombre confirmado por Daniel el 2026-09-30:** `beneficioDestinoId`.

---

## Restricciones globales

- **Nombres:** `docs/beneficio/03_public_api.md` es el contrato autoritativo. `beneficioDestinoId`
  ya está confirmado; cualquier **otro** nombre nuevo se contrasta con él y, si no lo declara, **se
  para y se pregunta**.
- **Las dos rúbricas pesan igual que el funcional.** `21_rubrica_veracidad.md`: la ficha de la finca
  tiene que poder sostener «esta cereza va a Las Nubes» hasta el enlace que lo dice.
  `22_rubrica_pedagogica.md`: una finca sin destino **no dice «0 pendientes»**, dice **qué falta y
  quién lo arregla**.
- **Compuerta por tarea:** `npm run build` en **toda** tarea que toque TypeScript — vitest **no**
  comprueba tipos, y eso ya rompió `main`. Al final, `npm run verify` y `bash scripts/ci.sh`, sin
  tubería y leyendo el código de salida.
- **Carril de las pruebas:** `scripts/ci.sh` corre **todo lo que NO esté** en
  `scripts/pruebas-por-compuerta.txt`. Toda prueba de este plan **necesita base** y va al grupo
  `base-sembrada`, o CI la corre sin base y falla con un error de Prisma que no parece de permisos.
- **La base compartida del 55433 NO se resetea.** Nada de `test:db -- reset`, `prisma migrate
  reset`, `db push --force-reset`, borrar bases ni fijar
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. **Esta restricción va en el encargo de CADA
  tarea:** un subagente sólo ve el suyo.
- **La limpieza de cada prueba envuelve cada `deleteMany` en su propio `try`.** Un `afterAll` es una
  cadena: el 2026-09-30 el primer borrado que lanzó abandonó los nueve siguientes y dejó 22 filas
  TEST en la base compartida **con la suite en verde**. Y el aviso se imprime con
  `process.stdout.write`, no `console.log`: vitest oculta la consola de las pruebas que pasan.
- **Commitear ANTES de mutar.** El arnés de flip restaura desde `HEAD`.
- **El usuario de cada prueba va acotado a SU sitio, nunca Platform Admin.** Con ámbito de
  plataforma la visibilidad es `all` y los recuentos se vuelven aleatorios según lo que otras
  sesiones tengan vivo en la base compartida.

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` *(modificar)* | `Location.beneficioDestinoId`, auto-relación `FincaDestino` |
| `prisma/migrations/<ts>_destino_de_cereza_por_finca/migration.sql` *(nuevo)* | la columna, su FK y su índice |
| `lib/traceability/fincas.ts` *(modificar)* | `declararDestinoDeFinca`, y `Finca` gana su destino |
| `lib/traceability/jornadasDeCosecha.ts` *(modificar)* | `abrirJornada` resuelve y **copia**; `exigeBeneficioDeDestino` sale de ahí; `cambiarDestinoDeJornada` pasa a ser corrección |
| `app/fincas/[siteId]/destino/page.tsx` *(nuevo)* | declararlo. Sigue el precedente de `[siteId]/logotipo/` |
| `app/actions/fincas.ts` *(modificar)* | la acción, con su rama en el traductor de errores |
| `app/fincas/page.tsx` *(modificar)* | cada finca dice su destino, o **qué falta** |
| `app/components/traceability/AbrirJornadaForm.tsx` *(modificar)* | se va el selector de beneficio |
| `messages/es.json`, `messages/en.json` *(modificar)* | los textos, en los dos idiomas |
| `scripts/pruebas-por-compuerta.txt` *(modificar)* | las pruebas nuevas, al grupo `base-sembrada` |

---

## Tarea 1 — La columna y su migración

**Archivos:**
- Modificar: `prisma/schema.prisma` (modelo `Location`)
- Crear: `prisma/migrations/<AAAAMMDDHHMMSS>_destino_de_cereza_por_finca/migration.sql`
- Modificar: `lib/traceability/fincas.ts` (el tipo `Finca` y `listarFincas`)
- Prueba: `tests/traceability/destinoDeFinca.test.ts` *(base → `base-sembrada`)*

**Interfaces — produce:**
```ts
export interface Finca {
  readonly siteId: string;
  readonly nombre: string;
  readonly organizationId: string;
  readonly tipo: TipoDeFinca;
  readonly logoAssetId: string | null;
  /** El beneficio al que va su cereza. `null` = no declarado, y NO es un hueco: ver el diseño §4.1. */
  readonly beneficioDestino: { readonly id: string; readonly name: string } | null;
}
```

- [ ] **Paso 1: la prueba que fija el contrato.** Una finca recién creada devuelve
      `beneficioDestino: null`, y con la columna puesta a mano devuelve `{ id, name }`.

      ```ts
      it("una finca sin destino declarado lo dice con null, no con un hueco", async () => {
        const [finca] = (await listarFincas(operario)).filter((f) => f.siteId === miFinca);
        expect(finca!.beneficioDestino).toBeNull();
      });
      ```

- [ ] **Paso 2: correrla y verla fallar.** `npx vitest run tests/traceability/destinoDeFinca.test.ts`
      → FAIL por propiedad inexistente.

- [ ] **Paso 3: el esquema.** En `Location`, junto a la auto-relación que ya existe:

      ```prisma
      /// El beneficio al que va la cereza de esta finca (diseño 2026-09-30). Sólo tiene sentido en
      /// un `site`. **Anulable a propósito:** una finca cuya cereza se compra y se traslada no
      /// lleva destino, y un NOT NULL obligaría a inventarle uno.
      beneficioDestinoId String?   @map("beneficio_destino_id") @db.Uuid
      beneficioDestino   Location? @relation("FincaDestino", fields: [beneficioDestinoId], references: [id], onDelete: Restrict)
      fincasQueEnvianAqui Location[] @relation("FincaDestino")
      ```

      `onDelete: Restrict` a propósito: borrar un beneficio al que una finca envía dejaría fincas
      apuntando al vacío en silencio.

- [ ] **Paso 4: la migración**, escrita a mano y con el nombre de la convención
      (`AAAAMMDDHHMMSS_destino_de_cereza_por_finca`):

      ```sql
      ALTER TABLE "core"."location" ADD COLUMN "beneficio_destino_id" UUID;
      ALTER TABLE "core"."location" ADD CONSTRAINT "location_beneficio_destino_id_fkey"
        FOREIGN KEY ("beneficio_destino_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT;
      CREATE INDEX "location_beneficio_destino_id_idx" ON "core"."location" ("beneficio_destino_id");
      ```

      **Comprobar el schema de la tabla antes de escribirlo:** `location` vive en `core`, no en
      `traceability`. Si no casa, parar y medirlo, no adivinar.

- [ ] **Paso 5: aplicarla y regenerar.** `npx prisma migrate deploy` contra la base **local** y
      `npx prisma generate` después — sin el generate, el typecheck se queja de campos que sí
      existen. **NO resetear.**

- [ ] **Paso 6: `listarFincas` devuelve el destino**, con su `select` del nombre del beneficio.

- [ ] **Paso 7: las dos pruebas pasan.** **Paso 8: `npm run build`.**

- [ ] **Paso 9: la prueba al grupo `base-sembrada`**, y comprobar que **no** aparece en la salida de
      `bash scripts/ci.sh`.

- [ ] **Paso 10: commit**, contando el stat antes:
      ```bash
      git add prisma/schema.prisma prisma/migrations/<ts>_destino_de_cereza_por_finca/migration.sql \
        lib/traceability/fincas.ts tests/traceability/destinoDeFinca.test.ts scripts/pruebas-por-compuerta.txt
      git diff --cached --stat   # contar: deben ser 5
      git commit -F msg.txt
      ```

---

## Tarea 2 — Declararlo, con sus dos permisos

**Archivos:** `lib/traceability/fincas.ts`, `tests/traceability/destinoDeFinca.test.ts`

**Interfaces — produce:**
```ts
export class DestinoDeFincaError extends Error {}   // "finca_invalida" | "beneficio_invalido" | "sin_permiso"

export async function declararDestinoDeFinca(
  userAccountId: string,
  input: { readonly fincaSiteId: string; readonly beneficioId: string | null },
): Promise<void>;
```
- **`anotarEntrega` ES el envío:** `EstadoDeEntrega` tiene `@default(enviada)`, así que una
  entrega nace enviada y no hay paso aparte. `entregaDe(j)` es el ayudante del fixture.
- Consume: `exigeGestionarFinca` (hoy privado en `jornadasDeCosecha.ts:32` — **se exporta**, no se
  duplica: dos copias de «quién gestiona una finca» divergen), `beneficiosDeDestino`,
  `recordAuditEvent`.

- [ ] **Paso 1: la prueba de los DOS permisos**, que es lo que el diseño §4.1 exige y lo que un
      atajo se salta. Quien gestiona la finca **y** ve el beneficio, puede. Quien gestiona la finca
      y **no** ve ese beneficio, **no**.

      ```ts
      it("declararlo exige gestionar la finca Y poder ver el beneficio", async () => {
        await declararDestinoDeFinca(gestorDeLaFinca, { fincaSiteId: miFinca, beneficioId: miBeneficio });
        expect((await listarFincas(gestorDeLaFinca)).find((f) => f.siteId === miFinca)!.beneficioDestino!.id)
          .toBe(miBeneficio);
        await expect(
          declararDestinoDeFinca(gestorDeLaFinca, { fincaSiteId: miFinca, beneficioId: beneficioAjeno }),
        ).rejects.toThrow(/beneficio_invalido/);
      });
      ```

- [ ] **Paso 2: verla fallar.**

- [ ] **Paso 3: la prueba de que sólo acepta un `beneficio`.** Enlazarla a un `site` —por ejemplo al
      `site` «Beneficio Las Nubes», que el diseño §5 señala como duplicado— **falla**.

- [ ] **Paso 4: la prueba de que se puede quitar.** `beneficioId: null` lo desenlaza, y eso **no**
      es un error: una finca puede dejar de enviar.

- [ ] **Paso 5: el `AuditEvent`, y en la MISMA transacción.** Su prueba lee la fila y comprueba que
      lleva el antes y el después. Lo vigila `tests/arquitectura/audit-atomico.test.ts`, que lee la
      fuente — **no basta** con `expect(evento).not.toBeNull()` después de que todo salió bien: eso
      pasa igual quitando el `tx`, y ya costó cuatro guardias falsos.

- [ ] **Paso 6: implementar. Paso 7: `npm run build`. Paso 8: commit.**

- [ ] **Paso 9: DESPUÉS del commit, dos flip-tests**, cada uno con las tres señales:
      1. quitar la comprobación del beneficio → debe caer «declararlo exige gestionar la finca Y
         poder ver el beneficio», por su nombre;
      2. aceptar cualquier `locationType` → debe caer la prueba del paso 3.

---

## Tarea 3 — `abrirJornada` copia el destino, y deja de pedir permiso en el beneficio

El corazón del plan. **Aquí se cierra la contradicción de ADR-194, sus dos mitades.**

**Archivos:** `lib/traceability/jornadasDeCosecha.ts`,
`app/components/traceability/AbrirJornadaForm.tsx`, `app/actions/jornadasDeCosecha.ts`,
`tests/traceability/jornadasDeCosecha.test.ts`, y los **ocho** archivos de prueba que hoy pasan
`beneficioId` a `abrirJornada`.

**Interfaces — produce:**
```ts
export interface AbrirJornadaInput {
  readonly fincaSiteId: string;
  readonly fecha: Date;
  readonly nota?: string | null;
  readonly asignaciones: readonly { locationId: string; personId: string }[];
  // `beneficioId` YA NO ESTÁ: sale de la finca.
}
export { exigeGestionarFinca };   // lo necesita la tarea 2
```

- [ ] **Paso 1: la prueba de la INSTANTÁNEA**, que es la decisión de Daniel y la que un refactor
      mecánico rompe:

      ```ts
      it("la jornada COPIA el destino: cambiar el de la finca no la mueve", async () => {
        await declararDestinoDeFinca(gestor, { fincaSiteId: finca, beneficioId: beneficioA });
        const j = await abrirJornada(gestor, { fincaSiteId: finca, fecha: hoy, asignaciones: [una] });
        const antes = (await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId;
        await declararDestinoDeFinca(gestor, { fincaSiteId: finca, beneficioId: beneficioB });
        const despues = (await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId;
        expect(antes).toBe(beneficioA);
        expect(despues).toBe(beneficioA);   // NO beneficioB: es una instantánea
      });
      ```

- [ ] **Paso 2: verla fallar** (el input todavía pide `beneficioId`).

- [ ] **Paso 3: la prueba de la otra mitad de ADR-194** — sin ella la contradicción **no queda
      cerrada**, y es la que nadie había nombrado:

      ```ts
      it("quien abre la jornada NO necesita permiso en el beneficio", async () => {
        // `gestorSoloDeLaFinca` gestiona la finca y NO alcanza el beneficio.
        const j = await abrirJornada(gestorSoloDeLaFinca, { fincaSiteId: finca, fecha: hoy, asignaciones: [una] });
        expect(j.id).toBeTruthy();
      });
      ```

- [ ] **Paso 4: la prueba de la finca sin destino** — se abre igual, y sus entregas **no** salen en
      ningún beneficio. **Con su control positivo**, que es la misma consulta con la finca
      enlazada:

      ```ts
      it("una finca sin destino abre jornada, y su entrega no sale en ningún beneficio", async () => {
        const j = await abrirJornada(gestor, { fincaSiteId: fincaSinDestino, fecha: hoy, asignaciones: [una] });
        expect(j.id).toBeTruthy();
        await anotarEntrega(gestor, entregaDe(j));
        expect(await pendientesDeBeneficio(operarioDelBeneficio, miBeneficio)).toHaveLength(0);
        // El control positivo NO es repetir la misma consulta: es enlazar la finca y volver a
        // preguntar. Sin él, un cero se lee como «funciona» cuando puede ser «no miré».
        await declararDestinoDeFinca(gestor, { fincaSiteId: fincaSinDestino, beneficioId: miBeneficio });
        const j2 = await abrirJornada(gestor, { fincaSiteId: fincaSinDestino, fecha: hoy, asignaciones: [una] });
        await anotarEntrega(gestor, entregaDe(j2));
        expect(await pendientesDeBeneficio(operarioDelBeneficio, miBeneficio)).toHaveLength(1);
      });
      ```

- [ ] **Paso 5: implementar.** `abrirJornada` lee `beneficioDestinoId` de la finca y lo escribe en
      la jornada; **`exigeBeneficioDeDestino` sale de `abrirJornada`** y se queda sólo en
      `cambiarDestinoDeJornada`. Exportar `exigeGestionarFinca`.

- [ ] **Paso 6: los OCHO archivos de prueba que pasan `beneficioId`.** Medido: `recepcionesDeCereza`,
      `situacionesDeCampo`, `destinoDeJornada`, `jornadasDeCosecha`, `lotesDeBeneficio`,
      `veredictoDelLote`, `entregasDeCosecha`, `mermaDeRecepcion`. Cada uno declara el destino de su
      finca en el `beforeAll` **en vez** de pasarlo. **No se tocan sus aserciones.**

- [ ] **Paso 7: el formulario y la acción.** Se va el selector de beneficio de `AbrirJornadaForm`, y
      con él su clave de traducción si no la usa nadie más — comprobarlo, no suponerlo.

- [ ] **Paso 8: `npx tsc --noEmit`, `npm run build`, y `npm test` completo**, porque esta tarea toca
      ocho archivos de prueba y el riesgo es romper alguno de lado.

- [ ] **Paso 9: commit. Paso 10: DESPUÉS, tres flip-tests:**
      1. resolver el destino **en vivo** en vez de copiarlo → debe caer la prueba de la instantánea;
      2. volver a exigir `can(view, lot)` sobre el beneficio → debe caer la del paso 3;
      3. bloquear la apertura si la finca no tiene destino → debe caer la del paso 4.

---

## Tarea 4 — `cambiarDestinoDeJornada` pasa a ser corrección

**Archivos:** `lib/traceability/jornadasDeCosecha.ts`, `tests/traceability/destinoDeJornada.test.ts`

- [ ] **Paso 1: la prueba de lo nuevo** — pone destino **donde no había**, que hoy no puede:

      ```ts
      it("corrige una jornada que nació sin destino", async () => {
        const j = await abrirJornada(gestor, { fincaSiteId: fincaSinDestino, fecha: hoy, asignaciones: [una] });
        await cambiarDestinoDeJornada(gestor, { jornadaId: j.id, beneficioId: miBeneficio });
        expect((await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId)
          .toBe(miBeneficio);
      });
      ```

- [ ] **Paso 2: verla fallar. Paso 3: implementar.**

- [ ] **Paso 4: las dos reglas que YA tenía siguen en pie**, y sus pruebas existentes lo dicen: con
      `AuditEvent`, y **falla** si alguna entrega tiene recepción vigente. **Correr
      `destinoDeJornada.test.ts` entero** y comprobar que sigue verde: es el control de que la
      corrección no aflojó nada.

- [ ] **Paso 5: `npm run build`. Paso 6: commit y flip-test:** permitir el cambio con una recepción
      vigente → debe caer su prueba, por su nombre.

---

## Tarea 5 — La pantalla, y que una finca sin destino diga qué falta

**Archivos:** `app/fincas/[siteId]/destino/page.tsx` *(nuevo)*, `app/actions/fincas.ts`,
`app/fincas/page.tsx`, `messages/es.json`, `messages/en.json`,
`tests/arquitectura/claves-de-traduccion-existen.test.ts` *(debe seguir verde)*

- [ ] **Paso 1: la pantalla**, siguiendo el precedente de `app/fincas/[siteId]/logotipo/page.tsx`:
      componente de servidor, el selector alimentado por `beneficiosDeDestino` —que ya filtra por
      `can(view, lot)`—, y una opción para **quitar** el destino.

- [ ] **Paso 2: la acción**, con su rama en el traductor de errores de las acciones de fincas. **Una
      clase de error nueva que llegue a una acción sin su rama es un 500** —`friendlyError` relanza
      lo que no conoce—, y eso ya costó una pantalla de error en el PR #433.

- [ ] **Paso 3: la lista de fincas dice el destino, o QUÉ FALTA.** Rúbrica 22: no «0 pendientes»,
      sino «esta finca no envía a ningún beneficio — enlázala aquí». Con su enlace a la pantalla.

- [ ] **Paso 4: los textos en los DOS idiomas**, y el control de que no divergen:
      ```bash
      node -e 'const a=require("./messages/es.json"),b=require("./messages/en.json");
        const A=new Set(Object.keys(a.Fincas||{})),B=new Set(Object.keys(b.Fincas||{}));
        console.log("es-en:",[...A].filter(k=>!B.has(k)),"en-es:",[...B].filter(k=>!A.has(k)));'
      ```

- [ ] **Paso 5: declarar la ruta** en `scripts/rutas-declaradas.mjs` con su razón, y **recalcular
      las cifras** de `docs/arquitectura/inventario-de-acceso.md` con
      `node scripts/inventario-de-acceso.mjs` — hace falta **en cuanto** aterriza un archivo con
      acceso crudo, no al final. Si el guardia de la allowlist protesta, añadir la entrada **con su
      razón**.

- [ ] **Paso 6: las compuertas completas**, sin tubería:
      ```bash
      npm run build > /tmp/b.txt 2>&1; echo "build=$?"
      npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
      bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
      ```

- [ ] **Paso 7: verlo en un navegador**, que es lo que ninguna prueba cubre. Un worktree **no tiene
      `.env`**: hace falta uno local con `AUTH_SECRET`, y una cuenta con contraseña porque
      `auth:set-password` **exige un TTY**. Comprobar las **dos** caras: una finca enlazada dice a
      dónde va, y una sin enlazar dice **qué falta**. Borrar después la cuenta y el `.env.local`.

- [ ] **Paso 8: contar el stat y commitear.** **Paso 9: abrir el PR y contar sus comprobaciones**
      —un PR sano de este repositorio da **6**— leyendo **la conclusión de cada una, una por
      línea**, y **preguntando `mergeable` aparte**: las seis pueden estar verdes y el PR estar en
      conflicto. **Fusionar es decisión de Daniel.**

---

## Revisión final, antes de pedir la fusión

- [ ] **Las dos rúbricas.** Veracidad: cada afirmación de destino se puede desarmar hasta el enlace
      que la sostiene. Pedagógica: una finca sin destino dice qué falta y quién lo arregla.
- [ ] **ADR-194 queda cerrado en sus dos mitades**, y las dos tienen prueba con nombre: el
      cosechador no elige el destino, **y** no necesita permiso en el beneficio.
- [ ] Revisión independiente con Codex (`docs/CODEX_REVIEW.md`,
      `/Applications/ChatGPT.app/Contents/Resources/codex`).
- [ ] Anotar la entrega en `SESSION_STATE.md` §2 —**es el entregable, no el diff**— y archivar lo
      que haga falta para que quepa, **midiendo antes qué se lleva cada entrada archivada**.
