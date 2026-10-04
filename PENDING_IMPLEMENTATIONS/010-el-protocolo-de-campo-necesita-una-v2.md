# 010 · El protocolo de campo necesita una v2, y no se puede editar la v1

**Estado: HECHA (2026-10-03), las dos partes.**

- **Parte A** — los diez ítems que faltaban: las reservas partidas en nivel y sitio (ADR-117), la
  cría de zángano, y los siete de §2.4, que apuntan a `Hive` porque el Anexo dice que «se guarda en
  la colmena». Más el mapa, los guardias y la cabecera, que decía que D2 no estaba tomada.
- **Parte B** — el requisito 4: `queenSighted` de `Boolean?` y `broodPatternNote`/`temperamentNote`
  de `String?` a los tres `enum` que el protocolo ya declaraba, con su migración a mano y los dos
  renombrados. **«No se buscó» ya se puede decir**, y no cae en el mismo `null` que «no se
  preguntó».

Sus dos planes están en `docs/superpowers/plans/2026-10-03-*`, y lo que cada parte midió va en su
PR. **Lo que esta ficha enseñó, aparte de lo suyo:** tres de sus hechos habían derivado —ver abajo—
y uno me hizo concluir «resuelta» por leer un nombre de archivo como un entregable.

No es una deuda técnica: es una **divergencia medida**
entre dos documentos del dueño y el esquema que acaba de construirse.

## Qué pasó

El Anexo B §2.2 pide las reservas de miel y de polen con cuatro valores: *«alta,
media, baja, junto a la cría»*. `protocolos/apiario-campo-v1.json` las declara
igual, como `enum` de cuatro opciones, con `coversExistingColumn:
"Inspection.storesLevel"`.

**«Junto a la cría» no es una cantidad: es un sitio.** En la misma lista impide
decir «alta **y** junto a la cría», y obliga al reporte de reservas bajas a
decidir si esa cuarta opción cuenta como bajo, como alto o como desconocido.
Daniel lo resolvió el 2026-09-12: **nivel de tres valores, y el sitio en su propia
columna**. Está en ADR-117 y ya es esquema —`honey_stores_level` +
`honey_next_to_brood`, y sus dos gemelas para el polen—.

## Por qué esto queda pendiente en vez de arreglado

La cabecera del propio JSON lo prohíbe, con sus palabras:

> «Cambiar esto después NO es editar aquí: es crear una versión 2, para que las
> respuestas ya dadas sigan significando lo mismo. Mismo principio que
> `cafe-cva-adaptado.json`.»

Así que la v1 **no se toca**. Lo que hace falta es una v2 que:

1. parta `honey_stores` y `pollen_stores` en dos ítems cada una — un `enum` de
   tres valores y un `boolean` de sitio— apuntando con `coversExistingColumn` a
   las columnas nuevas;
2. añada el ítem que **falta**: el Anexo §2.2 pide «Zángano / cría de zángano
   sí/no» y el JSON tiene los otros seis campos del §2.2 pero **no ese**. Los dos
   documentos del dueño no coinciden, y se siguió el Anexo porque trae el motivo
   escrito —«señal de obrera ponedora si aparece sin reina»—. La columna existe:
   `drone_brood_present`;
3. **añada los ítems de §2.4, que el protocolo no tiene ninguno.** Medido el
   2026-09-14: sus cinco actividades no llevan un solo campo de configuración de caja,
   y desde hoy las siete columnas existen en `Hive` (ADR-122). Su etapa la dice el
   Anexo: «campo, sólo si cambió» para cinco, y **cierre** para «cuadros por caja»;
4. pase `queen_sighted`, `brood_pattern` y `temperament` de las columnas de texto
   que tienen hoy a los enums que el propio JSON ya declara (`vista/no_vista/
   no_se_busco`, `compacto/salteado/apretado/promedio/nulo`,
   `mansa/normal/defensiva`). **De los tres, sólo `queen_sighted` está resuelto a
   medias:** el 2026-09-12 dejó de ser una casilla en `InspectionForm` y pasa a
   tres estados, pero la columna sigue siendo `Boolean?`, así que «no se buscó» se
   guarda como `null` y no se distingue de «el campo no se preguntó».

## Lo que no hay que volver a medir

- El protocolo **no está cargado** en la copia local: `research.protocol_version`
  no tiene ninguna fila con `external_identifier` que empiece por `apiario-campo`
  (medido el 2026-09-12). De producción no se puede decir lo mismo sin tocarla, y
  no se toca.
- Su `status` es literalmente `draft_contenido_sin_esquema_decidido`, y D2 del
  informe de alcance dice dónde vive la lista: `ProtocolVersion` de Research OS
  ejecutada contra la **visita**, con los ítems `coversExistingColumn` escribiendo
  en columnas. Este trabajo construyó esas columnas; lo que falta es el ítem que
  las nombra.
- El cargador es idempotente por `apiario-campo-v<versión>`
  (`scripts/cargar-protocolo-de-campo.ts:69`), así que una v2 entra sin pisar la
  v1 y sin necesitar ninguna migración.

---

## Lo que derivó, medido el 2026-10-03 — **sigue abierta**

Tres hechos de esta ficha ya son falsos. No cambian lo que hay que hacer, pero sí lo que hay
que creer al empezar, y uno de ellos me hizo concluir «resuelta» antes de leerla entera.

**1. `apiario-campo-v2.json` YA EXISTE — y no es la v2 que esta ficha pide.** Es el error de
leer un nombre de archivo como un entregable. Medido contra sus **44 ítems**:

| lo que pide esta ficha | en la v2 de hoy |
|---|---|
| partir `honey_stores` y `pollen_stores` en nivel + sitio | **no**: `honey_stores` sigue siendo `enum` de 4 opciones, y apunta a `Inspection.storesLevel` — la columna que el esquema marca como **reemplazada** (`schema.prisma:8171`). `pollen_stores`, 4 opciones y **sin** `coversExistingColumn` |
| el ítem de cría de zángano | **no existe ninguno** (`drone`: 0 coincidencias) |
| los ítems de §2.4, configuración de caja | **ninguno** |
| los tres a `enum` | el protocolo **sí** los declara como `enum` —`queen_sighted` 3, `brood_pattern` 5, `temperament` 3— pero las **columnas** siguen sin serlo: ver abajo |

**2. Las tres columnas del punto 4, con su tipo de hoy.** `queenSighted` es **`Boolean?`**
(`schema.prisma:8170`), `broodPatternNote` y `temperamentNote` son **`String?`** (`:8169`,
`:8211`). Lo de `queenSighted` no es sólo un tipo: el protocolo ofrece **tres** estados y la
columna guarda dos, así que **«no se buscó» se guarda como `null` y no se distingue de «no se
preguntó»**. Es la misma forma que `PENDING_IMPLEMENTATIONS/019` —una ausencia presentada como
un hecho— en otro sitio.

**3. «El protocolo no está cargado» sigue siendo cierto, pero su comando no.** La columna
`external_identifier` de `research.protocol_version` **no existe**; sus columnas son
`protocol_id, version, status, notes, created_at, created_by, superseded_by_version_id`. Medido
por la otra vía, uniendo con `research.protocol`: hay **2** versiones cargadas y son **«PE
Cafelino 25-26»** y **«Cryobloom»** — **cero** de apiario de campo, de 2 protocolos en total.

**Y eso decide la pregunta que esta ficha dejaba abierta: la v2 se puede editar.** Su cabecera
prohíbe editar «para que las respuestas ya dadas sigan significando lo mismo», y **no hay
ninguna respuesta dada**: ningún `apiario-campo` está cargado, ni la v1 ni la v2. La regla no
está en juego porque su motivo no está en juego. Si alguna vez se carga y se responde, entonces
sí hace falta una v3 — y conviene decidirlo antes de cargarla, no después.

**Lo que esto no cambia:** las columnas de destino existen todas —`honey_stores_level`,
`honey_next_to_brood` y sus gemelas de polen (ADR-117), `drone_brood_present`, y las de §2.4 en
`Hive`: `framesPerBox`, `queenExcluder`, `entranceReducer`…—. Lo que falta son los **ítems que
las nombren** y los tres cambios de tipo de columna. Sigue sin necesitar ninguna decisión nueva
del dueño: ADR-117 y el Anexo B §2.2/§2.4 ya las traen.

**Y la divergencia de `honey_stores` está declarada y vigilada, no silenciosa:**
`tests/arquitectura/enum-del-protocolo.test.ts` la lleva en `DIVERGENCIAS_HEREDADAS` con **el
par exacto** permitido y su razón —«junto a cría no es una cantidad, es una posición»—, así que
cualquier OTRA diferencia en esa misma pregunta vuelve a ser rojo. Al cerrar esta ficha, esa
entrada se quita: si se queda, eximirá un desajuste que ya no existe.
