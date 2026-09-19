# Manejo fitosanitario de la parcela (PR B) — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA:
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.
> Los pasos usan casillas (`- [ ]`).

**Objetivo:** que una intervención pueda hacerse sobre **bloques**, que la regla de
trampas apunte a un **producto del catálogo**, y que el aviso de una trampa con
lectura alta traiga **«Registrar aplicación»** ya rellenado y **se dé por
atendido** cuando una intervención posterior cubra esa trampa.

**Arquitectura:** amplía lo del PR A (#438) y lo de la pieza 2 (#413), sin tablas
nuevas: `PlotInterventionArea` gana `plotBlockId`; `TrapRule` gana
`suggestedMaterialId`; la regla de «atendido» vive en la función pura
`avisosDeTrampas` (`lib/traceability/pendienteDeTrampas.ts`), que el tablero ya
llama.

**Stack:** Next.js 16 · React 19 · Prisma 7 · Postgres · vitest · next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-aplicaciones-fitosanitarias-design.md`
§2.2, §4.2 y §6 (punto 2). Plan del PR A:
`docs/superpowers/plans/2026-09-18-aplicaciones-fitosanitarias.md`.

## Restricciones globales

Todas las del plan del PR A siguen valiendo. Las que más muerden aquí:

- **PROHIBIDO tocar la base compartida 55433** más allá de lo que hacen las
  pruebas: nada de `npm run test:db`, `prisma migrate dev` ni `migrate reset`.
  El esquema se cambia con una migración **nueva** (`prisma migrate diff
  --from-migrations … --to-schema-datamodel … --script` + SQL a mano) aplicada
  con `prisma migrate deploy`. Las migraciones ya aplicadas no se editan.
- **Nulo ≠ cero**; **toda escritura con su auditoría en la misma transacción**;
  **nunca se edita en sitio**.
- **La regla sugiere, no manda** (spec de la pieza 2, §5). «Atendido» no juzga si
  la respuesta fue la sugerida: cuenta **cualquier** intervención vigente
  posterior que cubra la trampa, también un manejo cultural.
- **Nada de valores de enum crudos en pantalla.** Todo texto nuevo, en `es` y `en`.
- **Cada prueba con base nueva va a `base-sembrada`** de
  `scripts/pruebas-por-compuerta.txt` en la misma tarea; las herméticas no.
- `npm run verify` y `npm run build` en toda tarea que toque TypeScript.
- **Flip-test con evidencia**: sha antes y después, que compila y corre, y el
  nombre de la prueba que cae.
- **La organización de una parcela se hereda de sus ancestros**
  (`resolveOrganizationForLocation`); nunca `location.organizationId` directo.
- **Número de ADR:** no se crea uno nuevo. Lo del PR B entra como **anexo** del ADR
  del manejo fitosanitario ya fusionado (el que hoy se llama ADR-174 en `main`),
  para no volver a pelear un número con otras sesiones.

Comandos:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test
export SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_shadow
```

## Decisiones que toma este plan

| Decisión | Por qué | Coste si es mal |
|---|---|---|
| «Cubre» sólo mira intervenciones de **la misma parcela que la trampa** | una intervención en la parcela madre sobre «la parcela entera» es de la madre; si se contara, habría que decidir si baja a todas las microparcelas, y el spec no lo dice | un aviso de más en una microparcela tratada desde la madre: el lado seguro |
| El texto `suggestedAction` **sigue obligatorio** | la regla ya lo exige; con producto pasa a ser la nota que se enseña debajo | ninguno: pedir una frase corta |
| Una trampa **sin revisión vigente** no tiene nada que atender | sin lectura no hay «lectura alta» | ninguno |
| «Atendido» apaga **sólo** el aviso de lectura alta, no el de revisión vencida | atendido no es resuelto (spec §4.2): la trampa sigue con su plazo | ninguno |

---

## Tarea 1: El esquema

**Archivos:** `prisma/schema.prisma`; migración nueva
`prisma/migrations/<marca>_areas_por_bloque_y_regla_con_producto/migration.sql`;
prueba `tests/traceability/manejoPrB.test.ts` (a `base-sembrada`).

- [ ] **Paso 1:** en `PlotInterventionArea`: `specimenId` pasa a `String?`; añadir

```prisma
  /// El bloque (pieza 2). Exactamente uno de `specimenId` o `plotBlockId`: CHECK en la base.
  plotBlockId String?    @map("plot_block_id") @db.Uuid
  plotBlock   PlotBlock? @relation("PlotInterventionAreaBlock", fields: [plotBlockId], references: [id])
```

  y `@@unique([interventionId, plotBlockId])`. En `PlotBlock`, el inverso
  `intervencionesSobreEl PlotInterventionArea[] @relation("PlotInterventionAreaBlock")`.

  En `TrapRule`:

```prisma
  /// El producto que sugiere la regla (spec fitosanitario §4.2). Opcional: el texto
  /// `suggestedAction` se queda como nota, y una regla vieja no pierde nada.
  suggestedMaterialId String?             @map("suggested_material_id") @db.Uuid
  suggestedMaterial   ConsumableMaterial? @relation("TrapRuleSuggestedMaterial", fields: [suggestedMaterialId], references: [id])
```

  y su inverso en `ConsumableMaterial`: `reglasDeTrampaQueLoSugieren TrapRule[] @relation("TrapRuleSuggestedMaterial")`.

- [ ] **Paso 2:** SQL generado con `migrate diff`, y a mano al final:

```sql
-- Un área es una planta O un bloque, nunca los dos ni ninguno.
ALTER TABLE "traceability"."plot_intervention_area"
  ADD CONSTRAINT "plot_intervention_area_planta_o_bloque"
  CHECK (num_nonnulls("specimen_id", "plot_block_id") = 1);
```

  FK de `plot_block_id` y de `suggested_material_id` con `ON DELETE RESTRICT`
  (evidencia y configuración: no se borra por debajo). Aplicar con
  `prisma migrate deploy` + `prisma generate`.

- [ ] **Paso 3: pruebas contra la base**, cada una con su control positivo: área
  con planta **y** bloque → la rechaza la base; área sin ninguno → la rechaza;
  área con sólo bloque → entra; la unicidad (misma intervención, mismo bloque dos
  veces) la rechaza la base; `TrapRule` con `suggestedMaterialId` nulo entra y
  queda nulo.
- [ ] **Paso 4:** `derivaDeMigraciones`, `verify`, `build`, `ci.sh`; commit; flip
  quitando el CHECK en una transacción (cae «planta y bloque se rechaza» por su
  nombre) y restaurándolo.

---

## Tarea 2: Intervenciones sobre bloques

**Archivos:** `lib/traceability/intervenciones.ts`, `tests/traceability/intervenciones.test.ts`.

**Interfaces:** `RegistrarIntervencionInput` gana `plotBlockIds?: readonly string[]`
(y `corregirIntervencion` lo acepta en `nueva`). `intervencionesVigentes` añade a
cada fila `parcelaEntera: boolean` (sin áreas) y `plotBlockIds: string[]`.

- [ ] Validación en `validarReferencias`: cada bloque existe y su `locationId` es
  **exactamente** la parcela de la intervención; si no, `IntervencionValidationError`.
- [ ] `crearAreas` crea una fila por bloque (además de las de plantas).
- [ ] Pruebas: bloque de la parcela → entra, con su área; bloque de otra parcela →
  rechazo; corrección con bloques → la fila nueva lleva sus áreas; `intervencionesVigentes`
  devuelve `parcelaEntera` y `plotBlockIds` correctos (sin áreas → `true`/`[]`;
  con un bloque → `false`/`[id]`; sólo plantas → `false`/`[]`).
- [ ] Flip: quitar la comprobación de parcela del bloque → cae «bloque de otra parcela».

---

## Tarea 3: La regla apunta a un producto

**Archivos:** `lib/traceability/trapRules.ts`, `app/actions/traceability.ts`
(`saveTrapRuleFormAction`), `app/components/traceability/ReglaDeTrampasForm.tsx`,
`app/plots/[id]/ajustes/page.tsx`, `lib/traceability/plantingCohorts.ts`
(select de la regla), mensajes, `tests/traceability/trapRules.test.ts` o el que
ya pruebe `saveTrapRule`.

- [ ] `SaveTrapRuleInput` gana `suggestedMaterialId?: string | null`. Validar:
  existe, `isPlantProtection`, y es de la organización de la finca
  (`resolveOrganizationForLocation(farmLocationId)`). Si no, `TrapRuleValidationError`.
  Nulo se guarda nulo. El texto sigue obligatorio. La auditoría ya existente
  incluye el campo.
- [ ] El formulario de la regla ofrece un selector «Producto sugerido (opcional)»
  con los productos fitosanitarios de la organización de la finca
  (`productosFitosanitarios(userAccountId, farmLocationId)`, ya existe) y la
  opción «— ninguno —». El texto se rotula «Nota de la acción».
- [ ] `getPlotDetail` lee `suggestedMaterial: { select: { id: true, name: true } }`.
- [ ] Pruebas: guarda con producto; producto no fitosanitario → rechazo; producto de
  otra organización → rechazo; sin producto → nulo (control). Flip: quitar la
  comprobación de organización → cae su prueba.

---

## Tarea 4: «Atendido», puro

**Archivos:** `lib/traceability/pendienteDeTrampas.ts`,
`lib/traceability/pendienteDeLaParcela.ts` (tipo `Aviso`),
`tests/traceability/pendienteDeTrampas.test.ts` (hermética; si ya existe, ampliarla).

**Interfaces:**

```ts
export interface TrampaParaAviso {
  // … lo que ya tiene, más:
  plotBlockId: string | null;
  // `ultimaRevision` gana `id` y `observedAt` (instante): `{ id; dia; observedAt; brocaLevel }`
}
export interface ReglaParaAviso {
  // … lo que ya tiene, más:
  suggestedMaterial: { id: string; name: string } | null;
}
export interface IntervencionQueCubre {
  occurredAt: Date;
  parcelaEntera: boolean;
  plotBlockIds: readonly string[];
}
// avisosDeTrampas({ hoy, trampas, regla, intervenciones }) — `intervenciones` es de la MISMA parcela.
// El aviso `trampa_con_lectura_alta` gana: observationId, plotBlockId, materialId | null, materialName | null.
```

- [ ] Regla: una trampa con lectura alta **no** emite `trampa_con_lectura_alta` si
  existe una intervención con `occurredAt > ultimaRevision.observedAt` y
  (`parcelaEntera` **o** `plotBlockId` de la trampa ∈ `plotBlockIds`). Una trampa
  sin bloque sólo la cubre `parcelaEntera`. El aviso `trampa_por_revisar` no cambia.
- [ ] Pruebas herméticas, una por fila de la tabla del spec §4.2 más los bordes:
  parcela entera posterior → atendido; bloque propio posterior → atendido; **otro**
  bloque → no; sólo plantas (`parcelaEntera: false`, `plotBlockIds: []`) → no;
  trampa sin bloque + bloque cualquiera → no; trampa sin bloque + parcela entera →
  atendido; intervención **anterior o simultánea** a la lectura → no (el borde es
  estricto: `>`); manejo cultural cuenta igual (el tipo no entra en la regla);
  el aviso de revisión vencida sale aunque esté atendido; sin intervenciones → sale
  como hoy (control); el aviso trae `materialId`/`materialName` de la regla, o nulos.
- [ ] Flips: `>` → `>=` (cae «simultánea no atiende»); quitar la rama del bloque
  (cae «bloque propio atiende»); quitar `parcelaEntera` (cae «parcela entera atiende»).

---

## Tarea 5: Pantallas

**Archivos:** `lib/traceability/plantingCohorts.ts` (datos de la trampa),
`app/plots/[id]/page.tsx`, `lib/traceability/pendienteDeLaParcela.ts`
(`enlaceDelAviso`), `app/plots/[id]/manejo/nuevo/page.tsx`,
`app/components/traceability/IntervencionForm.tsx`,
`app/plots/[id]/manejo/[interventionId]/page.tsx`, mensajes.

- [ ] `getPlotDetail` añade a cada trampa `plotBlockId` y a `ultimaRevision` su `id`
  (ya lo lee) — `trampasParaAviso` los pasa. La página pasa a `pendienteDeLaParcela`
  las intervenciones vigentes **de esa misma parcela** con `parcelaEntera` y
  `plotBlockIds`, y la regla con su `suggestedMaterial`.
- [ ] El aviso de lectura alta: si la regla tiene producto, lo nombra y enseña la
  nota debajo; si no, la nota como hoy. Enlace «Registrar aplicación» a
  `/plots/<id>/manejo/nuevo?motivo=<observationId>&bloque=<plotBlockId>&material=<materialId>`
  (sin los parámetros que sean nulos).
- [ ] «Registrar manejo»: el área ofrece **bloques** de la parcela (`listPlotBlocks`,
  ya existe) además de plantas; `?bloque=` lo deja marcado y `?material=` precarga
  la primera línea (con su carencia y reentrada **a la vista**, como hoy). Todo
  editable. Un parámetro que no sea de esta parcela u organización se ignora (no
  se pinta un error).
- [ ] El detalle enseña los bloques del área por su nombre.
- [ ] `verify`, `build`, `ci.sh`. La verificación en navegador la hace el controlador.

---

## Tarea 6: Documentación

- [ ] Anexo «PR B» al final del ADR del manejo fitosanitario en `DECISIONS.md`
  (sin número nuevo): lo que se construyó y las decisiones de la tabla de arriba.
- [ ] `SESSION_STATE.md`: una línea en la entrada del manejo fitosanitario, y quitar
  de §3 lo que el PR B ya no espera. `npm run check:state` en 0 (archivar lo más viejo
  si hace falta).

## Compuerta final

`verify`, `build`, `derivaDeMigraciones`, `ci.sh` y las pruebas con base de la rama,
leyendo el código de salida; `git diff --name-only origin/main...HEAD` sólo con
archivos de esta rama; revisión final con Codex sobre un paquete acotado.
