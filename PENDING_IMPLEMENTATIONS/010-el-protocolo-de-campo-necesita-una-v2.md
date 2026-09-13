# 010 · El protocolo de campo necesita una v2, y no se puede editar la v1

**Estado: no empezado.** No es una deuda técnica: es una **divergencia medida**
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
3. pase `queen_sighted`, `brood_pattern` y `temperament` de las columnas de texto
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
