# CryoBloom contra el esquema — qué ya se puede decir y qué no

**Escrito el 2026-09-14**, después de que Daniel describiera el flujo real y
corrigiera una afirmación mía. Todo lo que sigue está **medido contra
`origin/main`**, no deducido.

---

## La corrección que motiva este documento

El 14 de septiembre escribí, en el PR #304 y en el mensaje que lo acompañaba:

> «Hoy no hay forma de decir que un lote corre CryoBloom, así que su reposo frío
> deliberado se leería como estancamiento. Eso es un cambio de esquema.»

**Era falso.** Medí la existencia de una *columna* de perfil de protocolo en
`schema.prisma`, no encontré ninguna, y concluí que el concepto no existía. No
medí el **vocabulario**, que es donde vive:

```
manejo_temperatura   ambiente · cold_hold_prefermentativo · fermentacion_fria
                     · choque_termico · choque_en_frio
```

`cold_hold_prefermentativo` **ya estaba ahí**. Es la misma forma de error que
este repositorio ya tiene escrita tres veces en `CLAUDE.md`: *medir la lista
equivocada y leer el cero como una ausencia del mundo*.

---

## El flujo que Daniel describió, mapeado

| lo que hace | dónde vive hoy | ¿existe? |
|---|---|---|
| cosecha, se pesa | `HarvestEvent` + `QuantityEvent` | ✅ |
| se recibe | `ReceivingEvent` | ✅ |
| **se flota** | selección: `floaters` es categoría de Etapa A, y `rejection_category` es catálogo | ✅ |
| se separa, se pesa, y se registran **ambos** lotes por categorías | `LotTransformation` de tipo `selection` con sus códigos derivados — `PE-90` → `PE-90-A` | ✅ |
| selección otra vez | el mismo camino, encadenado | ✅ |
| a secado **con distintos procesos** | `LotProcess.sequenceOrder` | ✅ |
| lotes que **salen y vuelven a entrar** durante el secado | `devolverASecado` en `lib/traceability/lotProcess.ts` | ✅ |
| volver a fermentar o **reposar en mostos activos** | `medio_lavado: mosto_propio · mosto_de_otro_lote` | ✅ |

**«Tratamiento» en el vocabulario de Daniel es una intervención post-cosecha**
—pre, durante y post fermentación, y durante el secado— y eso es exactamente
`LotProcessIntervention`: cuelga de un proceso, lleva su `occurredAt`, su
operador y su nota, y toma su valor de **seis catálogos** que ya existen:

```
condicion_oxigeno    abierto_aerobico · anaerobico · maceracion_carbonica · anoxico
manejo_temperatura   ambiente · cold_hold_prefermentativo · fermentacion_fria
                     · choque_termico · choque_en_frio
medio_lavado         agua_limpia · mosto_propio · mosto_de_otro_lote · ninguno_natural
metodo_inoculacion   direct pitch · rehydrated · spontaneous
sustrato_anadido     ninguno · co_fermentacion · doble_mosto
recipiente           Tanque I · II · III · Cooler I · Cooler II · GrainProBag
```

**Y la receta no es el tratamiento**, que es lo que Daniel señaló: una
`ProcessRecipeVersion` es un **conjunto** de objetivos —variable, valor, rango
±, momento (`initial`/`during`/`final`) y ritmo— bajo un identificador único y
versionado, aplicable a lotes ya seleccionados. Eso ya es lo que él describe.

---

## CryoBloom, paso por paso

| lo que hace | dónde va | ¿existe? |
|---|---|---|
| bajar **lentamente a 9–12 °C** | intervención `manejo_temperatura: cold_hold_prefermentativo`, más `Measurement` de `temperature` | ✅ |
| **levadura MP72** | catálogo `levadura_cultivo`, donde **MP72 ya estaba** | ✅ *(corregido el 2026-09-14 — ver abajo)* |
| **atomizándola** y revolviendo | `metodo_inoculacion` / intervención | ⚠️ «atomizado» no está en el vocabulario |
| **canasta con fondo falso** dentro de un **cooler de pesca** | `recipiente: Cooler I` | ⚠️ la canasta no está |
| 3–4 latas, **90–100 lbs** | `QuantityEvent` | ✅ |
| **reposo de 24–72 h** | `ProcessRecipeVersion.expectedHours` | ❌ **es UN número, no un rango** |
| salida: **quick rinse de 1–2 min** | intervención `medio_lavado: agua_limpia` | ⚠️ **la duración no tiene dónde ir** |
| y de ahí, otro tratamiento o al secado | `sequenceOrder` | ✅ |

---

## Lo que de verdad falta, y es pequeño

**Ninguno de estos cuatro es «no se puede expresar CryoBloom».** Se puede. Son
cosas que hoy se escriben como texto y por eso **no se pueden agrupar** — el
mismo argumento que cerró el objetivo de tratamiento en el módulo de apiario:
*«hoy no se puede agrupar»*.

1. ~~**La cepa de levadura es texto libre.**~~ **FALSO, y corregido el
   2026-09-14 — ver la sección al final.** La cepa tiene catálogo curado desde
   RO1, con MP72 dentro. Lo que faltaba era una línea de cableado, y ya está
   puesta. Lo que **sigue** faltando es dónde viven los *parámetros* de la cepa
   (rango de temperatura, especie, proveedor): un `VariableCatalogValue` sólo
   guarda `value` y `definition`.
2. **La duración esperada es un número, no una ventana.** 24–72 h es un rango
   **deliberado**, y `expectedHours: Int?` sólo admite un valor. Hoy hay que
   elegir uno y perder la otra mitad de la intención.
3. **Una intervención no tiene duración.** El *quick rinse* dura uno o dos
   minutos y eso es parte de lo que lo hace un *quick* rinse; hoy sólo se puede
   registrar **cuándo** ocurrió.
4. **Dos huecos de vocabulario**: el método «atomizado» y el recipiente «canasta
   de fondo falso».

---

## Lo que esto cambia en el código, y NO es un cambio de esquema

El puente `lib/beneficio/desdeElLote.ts` deduce hoy el perfil del **grado de
proceso** —`Washed` → `WASHED_STANDARD`— y devuelve `GRADO_SIN_PERFIL` para
todo lo demás. Con lo medido aquí, lo correcto es otra cosa:

> **leer las intervenciones del proceso abierto.** Si entre ellas hay
> `manejo_temperatura: cold_hold_prefermentativo`, el perfil es
> `COLD_HOLD_PREFERMENT` y el motor **suspende la detección de estancamiento**,
> que es exactamente lo que la meseta deliberada necesita.

Eso es **código, no esquema**, y usa vocabulario que ya está cargado.

**Y una decisión de diseño que este documento propone y Daniel tiene que
aprobar:** que los motores lean sus umbrales **de la receta cuando la haya**, y
sólo caigan al perfil del paquete cuando no la haya. Los cinco `ProtocolProfile`
son presets fijos con números de industria; una `ProcessRecipeVersion` es por
lote, versionada, con rango propio y ritmo propio, **y la escribe él**. Copiar
el enum del paquete metería una segunda fuente de verdad peor que la que ya
existe, y dos fuentes derivan.

---

## Lo que este documento NO resuelve

- **Nadie ha registrado una sola intervención.** Medido: `LotProcessIntervention`
  tiene **0 filas**, y `LotProcess` también. La maquinaria está entera y sin
  estrenar, así que nada de lo de arriba está probado contra un lote real.
- **La colisión de la palabra «tratamiento».** `TreatmentBatch` ya existe y
  cuelga de un `ProtocolVersion` de Research OS: es la maquinaria de
  **experimentos**, no la de beneficio. Si el vocabulario de la casa va a llamar
  «tratamiento» a la intervención de un proceso, conviene decirlo en un ADR
  antes de que las dos palabras se crucen en una consulta.
- **Los cuatro huecos de arriba son propuestas**, no decisiones. Cada uno es una
  columna o unos valores de catálogo, y los cuatro son de Daniel.

---

## Corrección del 2026-09-14: el hueco 1 era falso

Daniel, leyendo esto: *«las cepas de levadura NO ES TEXTO LIBRE, se deben
agregar las levaduras que se van a usar o ya tenerlas en el sistema, igual que
equipos e instrumentación»*.

**Ya las teníamos.** `lib/research/catalogs.ts` define `levadura_cultivo` desde
RO1, con el vocabulario que él mismo decidió:

```
Sunrise Orange · Deep Amber · Cool Blue · Green Origin · MP72 · HDA54
Spontaneous Wild   (impliesUnknownIdentity: true — no es una cepa, es la
                    ausencia de cepa conocida)
```

Y la cabecera de ese archivo dice cómo se amplía: *«adding a new yeast is one
entry here + a re-seed, never a migration»*.

**Es la segunda vez en dos días que mido la lista equivocada sobre este mismo
tema.** La primera fue `cold_hold_prefermentativo`, que abre este documento. Las
dos veces por lo mismo: miré una **columna** de texto libre
(`FermentationRun.inoculationNote`) y concluí que el vocabulario no existía. Lo
cazó el control positivo — la búsqueda negativa no dio cero, dio **43**, y tres
de esas 43 eran exactamente esto.

**Lo que sí faltaba, medido.** `levadura_cultivo` **no estaba** en
`CATALOGOS_DE_INTERVENCION` (`lib/traceability/lotProcess.ts`). El catálogo
existía y **sólo lo alcanzaba Research OS**, a través de `ProtocolVariable`; en
el beneficio de un lote corriente, `registrarIntervencion` lo **rechazaba** con
`catalog_value_wrong_catalog`. Se podía registrar **cómo** se inoculó —`direct
pitch`, `rehydrated`, `spontaneous`— y no **con qué**. Añadida la línea, con el
guardia que comprueba que cada clave de esa lista existe de verdad en la semilla.

**Y la premisa «igual que equipos e instrumentación» tampoco se sostiene, que es
el hallazgo mayor.** Medido contra `origin/main`: **no hay entidad de equipos ni
de instrumentación.** Son texto libre en el punto de uso —
`FermentationRun.vesselNote` («Tank 3»), `LabourEntry.equipmentNote`,
`StorageAssignment.containerNote`— y `Measurement.deviceId` es una columna
heredada que **ningún código ha escrito nunca**. El único modelo de aparato,
`Device`, son los teléfonos que sincronizan desde el campo.

El diseño existe y está sin construir: `docs/architecture/EQUIPMENT_AND_READINESS.md`,
446 líneas, marcado **v2**, con cuatro decisiones esperando a Daniel en su §11.
**Y no menciona la levadura ni una vez** — control: `yeast|strain|levadura|cepa|inocul`
da cero sobre ese archivo.

**Lo que queda pendiente, y es decisión suya:** los parámetros de la cepa
—especie, proveedor, rango de temperatura recomendado— no tienen dónde vivir. Un
`VariableCatalogValue` guarda `value`, `definition` y alias, nada más. Si «el
comportamiento metabólico de la cepa sugiere el ritmo de medición» va a ser
cierto, hace falta una tabla de extensión colgada del valor de catálogo —**no un
catálogo paralelo**, porque `ProtocolVariable.catalogId` es una FK a
`VariableCatalog` y un modelo independiente rompería esa integración ya
especificada.
