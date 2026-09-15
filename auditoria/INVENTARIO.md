# Inventario del ciclo del café

**Levantado el 2026-09-14** sobre `origin/main` en `d711f5c`, como pide el paso 1
del prompt maestro. **No se auditó ni se corrigió nada**: el maestro dice
«detente ahí», y aquí se detiene.

---

## Antes de la tabla: el instrumento subcontó tres veces

Y conviene decirlo primero, porque la tabla se lee distinto sabiéndolo.

La primera versión del guion daba **63 pantallas** a la etapa «Reposo». Un 63
absurdo delata el instrumento; un 3 plausible no lo habría hecho. El patrón
`app/` casaba las 63 páginas del repositorio.

Corregido eso, **tres filas seguían mintiendo a la baja**, y cada una por elegir
mal el símbolo:

| decía | era | por qué |
|---|---|---|
| Selección sin modelo | lo tiene: `LotTransformationType.selection` | busqué `type` donde Prisma escribe `enum` |
| Equipos sin pruebas | tres archivos | las pruebas usan nombres en español, no `Equipment` |
| Perfil de tueste sin pantalla | está entero: `PerfilOptimoForm.tsx` + acción | conté `page.tsx` y me perdí los componentes de formulario |

**Cada cero de la tabla de abajo se fue a comprobar a mano.** Los que quedan son
los que sobrevivieron a esa comprobación.

---

## La tabla

`✅` implementado y con superficie · `🟡` parcial · `⛔` ausente

| Etapa | Modelo | Lógica | Pruebas | Pantalla | Filas reales | Estado |
|---|---|---|---|---|---|---|
| Cosecha | `HarvestEvent` | `harvest.ts` | 12 | `lots/new`, detalle | **33** | ✅ COMPLETO |
| Recepción | `ReceivingEvent` | `harvest.ts` | 4 | `lots/new`, informe | — | ✅ COMPLETO |
| Creación de lote | `Lot` | `lots.ts` | 13 | `lots`, `lots/new` | **49** | ✅ COMPLETO |
| Selección | `LotTransformation` (`selection`) | `selection.ts` | 1 | detalle del lote | — | ✅ COMPLETO |
| Divisiones y fusiones | `LotTransformation` + I/O | `lots.ts` | 6 | detalle del lote | **11** | 🟡 ver F2-001 |
| Procesos del lote | `LotProcess` | `lotProcess.ts` | 2 | `lots/[id]/process` | **0** | 🟡 sin estrenar |
| Tratamientos (intervenciones) | `LotProcessIntervention` | `lotProcess.ts` | 2 | `lots/[id]/process` | **0** | 🟡 sin estrenar |
| Fermentación | `FermentationRun` | `fermentation.ts` | 7 | detalle del lote | **0** | 🟡 sin estrenar |
| Motores de beneficio | — (leen `Measurement`) | `lib/beneficio/` ×6 | 47 vectores + 78 | veredicto en el lote | **38** mediciones | ✅ COMPLETO |
| Muestreo | `core.Sample` | `samples.ts` | 6 | `lots/[id]/samples/new` | — | ✅ COMPLETO |
| Secado | `DryingRun` | `drying.ts` | 5 | detalle del lote | **3** | ✅ COMPLETO |
| **Reposo** | **ninguno** | ninguna | 0 | ninguna | — | ⛔ **AUSENTE** |
| Almacenamiento | `StorageAssignment` | `storage.ts` | 3 | **sólo acción, sin página** | **0** | 🟡 sin pantalla |
| Tueste de muestra | `RoastSession` | `roasting.ts` | 3 | `lots/[id]/roast/new` | **0** | 🟡 sin estrenar |
| Perfil de tueste | `LotRoastProfile` | `roasting.ts` | — | `PerfilOptimoForm` | **0** | ✅ COMPLETO |
| Catación | `SensorySession` + 8 | `lib/sensory/` ×9 | 30+ | `sensory` ×4 | — | ✅ COMPLETO |
| **Valorización / costo** | **ninguno** | ninguna | 0 | ninguna | — | ⛔ **AUSENTE** |
| Registro y reporting | `Report`, `ReportVersion` | 4 módulos | 33 | `reports/proceso` | — | ✅ COMPLETO |
| Equipos e instrumentos | `Equipment` + 6 | `lib/equipos/` ×3 | 3 | `equipos` ×3 | **4 DEMO** | ✅ COMPLETO |

---

## Lo que la columna de filas dice, y es lo más importante de este inventario

**La cadena está construida entera y usada hasta la mitad.**

```
cosecha 33 → lote 49 → transformación 11 → medición 38 → secado 3
                                                              ↓
   proceso 0 · intervención 0 · fermentación 0 · tueste 0 · almacenamiento 0
```

Todo lo anterior al **proceso** tiene datos reales. Todo lo posterior tiene
**cero**. Y hay una consecuencia concreta que no se ve mirando código:

> **`FermentationRun` tiene cero filas**, así que la mitad de fermentación de los
> cuatro motores de beneficio —pH, Brix, y su histéresis— **nunca ha corrido
> contra un lote real**. Está cubierta por los 47 vectores de aceptación, que es
> una cosa distinta: los vectores demuestran que el motor hace lo que el contrato
> dice, no que el contrato describa lo que pasa en el patio.

Las 38 mediciones y los 3 secados son lo único que ha ejercido un motor de
verdad, y sólo el de secado.

---

## Cobertura de los tres ejes

**Funcional.** Es donde el sistema está más sólido: 169 archivos de prueba, dos
carriles de CI, y los guardias de arquitectura que esta misma sesión vio cazar
tres errores propios. La fase 2 encontró cuatro hallazgos igualmente.

**Veraz.** Hay una infraestructura de procedencia seria y poco común —
`ProvenanceClass` de diez valores, `DataQuality` de nueve, `provenanceClass`
obligatorio sin defecto en las tablas de evidencia— y el puente de beneficio
declara explícitamente lo que **no** puede saber. Pero:

- **el eje veraz de la fase 2 está sin correr** (fichas, etiquetas, exportaciones);
- y todos los umbrales de dominio siguen `[PROVISIONAL]` mientras **P-F** siga
  abierta, así que hoy toda cifra que un motor emite se apoya en un borrador de
  IA que nadie ha repasado. Es la decisión abierta más cara del repositorio.

**Pedagógico.** Es el eje **más débil, con diferencia**, y el que el kit dice que
pesa igual que los otros dos. Contra los niveles de `docs/beneficio/22`:

- el veredicto de beneficio en la pantalla del lote llega a **Nivel 2** —dice qué
  significa este valor en este lote— y **declara sus limitaciones**, que es más de
  lo que la rúbrica exige;
- pero la rúbrica manda que **todo punto que puede emitir una alerta alcance
  Nivel 3**: decir qué hacer y qué pasa si no. Hoy los textos de estado dicen qué
  ocurre, no qué hacer — y hay un guardia que prohíbe el imperativo
  (`todo-estado-tiene-texto.test.ts`), escrito para proteger la autonomía del
  operario. **Eso es una tensión real entre dos reglas de la casa**, no un
  descuido, y merece resolverse antes de la fase 6;
- y **Nivel 4 no existe en ninguna parte**: nada compara un lote con otro anterior.

---

## El plan que propongo

**Siguiente: fase 1 — cosecha, selección y creación de lote.** No por el orden
sugerido del kit, sino por lo que dice la columna de filas: **es la única parte
con datos reales** (33 cosechas, 49 lotes, 11 transformaciones). Una auditoría
sobre una etapa con cero filas sólo puede leer código; sobre una con datos puede
además comprobar si esos datos son coherentes, que es donde el eje veraz muerde.

**Qué espero encontrar.** Con F2-002 ya confirmado —el saldo se calcula a día de
hoy y no al momento del evento— espero que alguna de esas 11 transformaciones
reales no reconcilie, y que los códigos derivados de selección (`PE-90` → `PE-90-A`)
tengan algún caso que no cierre. También espero que la recepción, con 33 cosechas
y ninguna fila de proceso detrás, enseñe lotes que entraron y nunca siguieron.

**Lo que necesito de ti antes de seguir, y es corto:**

1. **Las tres decisiones de `DECISIONES_PENDIENTES.md`** — sobre todo la forma de
   `MIXED`, que deja de ser gratis en cuanto se construya cualquiera de los dos
   mecanismos que hoy no existen.
2. **P-F.** Mientras siga abierta, el eje veraz no puede aprobar nada: los
   umbrales son de un borrador sin repasar.
3. **La tensión Nivel 3 contra la regla de no ordenar.** Antes de la fase 6,
   porque esa fase la va a encontrar en cada alerta.

**Y dos cosas que el inventario no puede contestar y conviene saber:**
si «reposo» y «valorización» están ausentes porque no se han construido o porque
no van en este sistema. Los dos salieron **cero en todo**, y el
control positivo se sostiene con los nombres correctos: `priceAmount` y
`priceCurrency` existen en `Product` y `ProductVariant` —21 coincidencias de
`price|amount|currency`—, así que la búsqueda sabe encontrar dinero. De **costo
operativo** las únicas coincidencias son las palabras «costó» y «coste» dentro de
comentarios en español: ninguna columna, ningún modelo.

(La primera versión de este control citaba `priceCents`, que **no existe** en este
esquema y daba cero. Un control positivo que sale cero no prueba una ausencia:
prueba que el control está mal escrito.)

Pero «no existe» y «no va aquí» son hallazgos distintos, y ése lo decides tú.
