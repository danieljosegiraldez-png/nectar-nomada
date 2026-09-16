# Correspondencia A9 — el paquete de descubrimiento contra el apiario que existe (2026-09-16)

> **Qué es y qué no.** Es la **opción A** que Daniel aprobó: la tabla de equivalencias del
> módulo apícola y las filas de las decisiones Q26–Q31, para contestar con evidencia la
> pregunta «¿hay que renombrar o rehacer algo?». **No** es el análisis Q1–Q49 completo que
> pide el paquete, y no lo sustituye.
>
> **Cómo se midió.** Contra el árbol en `89cf26f`, leyendo `prisma/schema.prisma`, `lib/` y
> las migraciones. Cada fila dice su evidencia. Lo que no se inspeccionó se marca **sin
> medir**, no se supone.
>
> **Lo que envejece.** Las columnas de correspondencia envejecen despacio —los nombres no
> cambian solos—; las de estado envejecen rápido. Igual que
> `GAP_ANALYSIS_2026-08-10.md`, que se quedó afirmando «cero código» sobre dos módulos que
> hoy son de los más probados. Si lees esto meses después, comprueba el estado antes de
> apoyarte en él.

## 0. El resultado, en una frase

El requisito más duro del paquete para el apiario —**Q26A: la colmena persiste, la ocupación
describe la biología, el equipo se mueve aparte**— **ya lo cumple el repositorio**, con otros
nombres, y la última pieza que le faltaba se cerró el 2026-09-15 (ADR-135). Lo que el paquete
aporta aquí no es una arquitectura nueva: es **vocabulario común** y **dos huecos reales**.

## 1. La correspondencia de vocabulario

El paquete dice, tres veces y en tres documentos distintos, que **no se renombre nada** para
parecerse a él. Esta tabla existe para eso: para no tener que hacerlo.

| Término del paquete | En este repositorio | Evidencia | Veredicto |
|---|---|---|---|
| Apiary | `Location` con `locationType = "apiary_site"` | `prisma/schema.prisma`; `getApiaryList` | **Equivalente. No renombrar.** |
| Hive (identidad operativa persistente) | `Hive` | modelo `Hive`, esquema `apiary` | Mismo nombre, misma cosa |
| **Occupancy Episode** | **`Colony`**, con `startedAt` / `endedAt` / `status` | modelo `Colony`; `finDeColonia.ts` | **Equivalente exacto.** `Colony` YA es un episodio de ocupación: tiene inicio, fin anulable y estado. Renombrarlo a `Occupancy` sería coste puro |
| colonia/reina identificada (opcional) | `Colony.originType`, `originSourceValueId`, `Inspection.queenSighted` | A9.10 / Anexo B §2.2 | **Equivalente parcial**: no hay entidad `Queen`, y el paquete dice que no hace falta («queen status can be an observation without a queen entity») |
| posición/despliegue de la colmena | **`HivePlacement`** (`startedAt`/`endedAt`, intervalo semiabierto) | ADR-126, ADR-135 | **Equivalente.** Es el `storage_assignment` del café aplicado al apiario, a propósito |
| equipo reutilizable que se mueve aparte | `Hive.broodBoxes`/`supers`/`framesPerBox` + módulo `lib/equipos/` | ADR de configuración de caja; `equipos.ts` | **Parcial**: la caja se configura y los equipos se custodian, pero un alza concreta no es todavía un activo con identidad |
| Field Parcel / Microparcel | `Location` con `locationType` `plot` / `micro_plot` | `lib/navigation.ts:rutaDelSitio`; ADR-137 | **Equivalente. No añadir `Parcel`.** |
| contexto Coffee / contexto Bee | esquemas `traceability` y `apiary` de Postgres | `@@schema(...)` en cada modelo | **Equivalente.** La separación es física, no una convención |
| Experiment Engine | `lib/research/` (`protocols`, `treatments`, `analysis`, `programs`) | RO1 | **Equivalente.** El protocolo de campo del apiario ya entra como `ProtocolVersion` (A9.4) |
| inspección de colmena | `Inspection` + `InspectionIrregularity` + `VarroaCount` | Anexo B §2.2 | Equivalente |
| intervención (alimentar, tratar) | `ColonyEvent` con `eventType` | ADR-136 | Equivalente |
| cosecha de miel | `ApiaryHarvestEvent` → `resultingLot` | Q28 abajo | Parcial |

**Lo que NO hay que hacer, dicho explícitamente:** no crear `Parcel`, no crear `Occupancy`, no
crear `Apiary` como modelo propio. Los tres existen ya con otro nombre, y el paquete lo prevé.

## 2. Las decisiones del apiario, fila por fila

### Q26A — Colmena contra colonia · **SATISFECHO**

*Objetivo:* la colmena es identidad operativa persistente; la ocupación describe las abejas;
el abandono, la muerte o la retirada cierran la ocupación y un enjambre posterior abre otra;
cámaras, alzas y sensores se mueven independientemente.

*Estado real:* `Hive` y `Colony` son tablas distintas desde A2. `Colony.endedAt` es anulable
**y no se deduce del estado** —el comentario del esquema lo dice: «`status` dice qué pasó,
esto dice cuándo»—. `registrarFinDeColonia` cierra la ocupación con su causa en
`ColonyLossCause`, una fila por causa. Y **`HivePlacement`** separa dónde está la caja de qué
hay dentro.

*Lo medido el 2026-09-15:* de 29 colmenas reales, **10 no tenían colocación** —las diez de
Apiario Las Nubes— y para los lectores por fecha «no constaban en ningún sitio». ADR-135 lo
cerró: `createHive` abre la colocación en la misma transacción, con relleno para las
existentes y un guardia de fuente.

*Cambio mínimo:* ninguno. **Anotar la equivalencia y seguir.**

### Q27 — Inspecciones de colmena · **PARCIAL**

*Objetivo:* captura rápida con protocolos estructurados **por propósito y por especie**,
observaciones, intervenciones y seguimientos; no exigir inspección invasiva sólo porque
existan campos.

*Estado real:* la inspección rápida existe («Nada fuera de lo normal») y **todos los campos de
estado son opcionales a propósito** (ADR-080) — eso es exactamente el «no exigir». El
protocolo de campo existe como `ProtocolVersion` con **44 preguntas en cinco actividades**, y
desde ADR-140/141/143 se sabe dónde aterriza cada una: **38 en un campo, 1 en tabla, 5 sin
sitio**.

*Hueco:* **«por especie» no existe** — ver Q30. El protocolo es uno solo, no uno por especie.

*Cambio mínimo:* depende de Q30. Sin taxón no hay protocolo por especie.

### Q28 — Genealogía de la miel · **PARCIAL, y el hueco es la mitad de la cadena**

*Objetivo:* cosecha → alzas/contenedores → extracción → decantación/almacenamiento →
envasado, con bruto/tara/neto, cera y opérculos, filtración, pérdidas y muestras.

*Estado real, medido sobre el esquema:* `ApiaryHarvestEvent` tiene `framesHarvested`,
`extractedWeightKg`, `honeyType` y **`resultingLotId`**, que engancha con la maquinaria de
lotes del café. O sea que los dos extremos existen.

*Hueco, con la medición, y la medición corregida:* `settling`, `cappings`, `wax`, `gross` y
«decantación» dan **cero** en el esquema. `extraction` da **seis**, y las seis son **de café**
—`sample_extraction` como transformación de lote, y `extractionMethod` como método de
preparación de una taza—: ninguna es extracción de miel. `opercul` da **uno**, y es
`operculada`, una etapa de cría. La parte central de la cadena —de las alzas al tambor— no
está.

> **La primera versión de este párrafo decía «cero menciones» de los ocho términos, y ese cero
> era del instrumento.** Lo produje con `grep -ciE "gross\|tare\|net"`: en `-E`, `\|` **no es
> alternancia** sino una barra literal, así que buscaba una cadena que no existe y devolvía
> cero por construcción. Con el patrón bueno, `gross|tare|net` da **once**… y las once son
> `hectare`, una subcadena. La conclusión no cambió; la evidencia sí, y sin el control de esta
> tabla habría publicado un cero que no medía nada. Es primo de la trampa de `\b` con
> `git grep -E` que ya está en `CLAUDE.md`.

*Cambio mínimo:* no es una rebanada pequeña. Se anota como hueco de esquema, con su alcance
dicho, y se decide aparte.

### Q29 — Despliegue temporal · **SATISFECHO**

*Objetivo:* conservar posiciones, llegada/salida, propósito, personas, transporte e inspección
previa y posterior, **con movimientos en grupo que conserven la identidad de cada colmena**.
Y, literal: *«cambiar un campo de ubicación actual no basta»*.

*Estado real:* `trasladarColmenas` (ADR-126) cierra la colocación de origen y abre la del
destino **en una transacción, con una fila y un `AuditEvent` por colmena**; el motivo sale de
un catálogo cerrado; la carencia del destino se avisa. El propio encabezado de esa migración
argumenta lo mismo que el paquete: mover `hive.location_id` habría movido la historia entera
con él.

*Cambio mínimo:* ninguno. Es la coincidencia más literal del paquete con el repositorio.

### Q30 — Abejas sin aguijón y polinizadores silvestres · **HUECO REAL**

*Objetivo:* distinguir Apis manejada, unidades manejadas de abeja sin aguijón (Melipona /
Trigona) y polinizadores libres. **El taxón es configurable; el estado de manejo es
independiente de la taxonomía.**

*Estado real, medido antes de escribir este documento:* **cero menciones** de `melipona`,
`trigona` o `stingless` en todo el repositorio —esquema, `lib/`, documentación—. (Repetida
ahora, la búsqueda devuelve **un** archivo: éste. Conviene saberlo antes de leer ese uno como
un hallazgo.) Y no es un descuido: el esquema
**documenta que las tablas `Species`/`Cultivar` se aplazaron a propósito** (tres comentarios
distintos las mencionan como pendientes).

*Conflicto que hay que reconciliar, y es el único de verdad:* hay **una decisión previa del
repositorio** de no modelar taxonomía todavía, y **una decisión del dueño** de distinguir
especies manejadas. No se resuelven solas y no las resuelvo yo aquí.

*Cambio mínimo posible:* un catálogo de taxón por `VariableCatalog` —que es el mecanismo que
el propio esquema señala como alternativa a `Species`— y un campo de **estado de manejo**
separado. Pero eso es una decisión, no una obviedad.

### Q31 — Diseño experimental de polinización · **PARCIAL**

*Objetivo:* motor de experimentos compartido con hipótesis, unidad experimental,
tratamiento/control, réplica, muestreo, criterios y resultados predefinidos; biblioteca
versionada de protocolos de polinización con la metodología Roubik/STRI como familia de
referencia.

*Estado real:* el motor existe (`lib/research/`, RO1) y el compromiso de polinización también
—`PollinationCommitment`, con hectáreas, densidad objetivo y ventana de floración (ADR-130)—.
`colmenasDeLaVentana` contesta «qué colmenas estuvieron» sumando solape, no duración.

*Hueco:* la **biblioteca de protocolos de polinización** con la familia Roubik no existe como
tal; hay motor y hay un compromiso, no hay biblioteca versionada de ese dominio.

## 3. Lo que este documento NO afirma

- **No dice que el módulo esté terminado.** Dice qué equivale a qué, y dónde hay hueco.
- **No dice que una pantalla funcione.** Ninguna de estas piezas se ha usado en un apiario con
  el guante puesto; esa sigue siendo la deuda que ningún documento cierra.
- **No inspeccionó producción.** El protocolo de campo y los datos reales de Las Nubes y
  Toabré **no están cargados en producción** a fecha de hoy.
- **No leyó las transcripciones fuente completas** del paquete: diez mensajes largos vienen
  truncados y marcados por el propio paquete, y no se usan como evidencia.

## 4. Decisiones abiertas que salen de aquí

1. **Q30 / taxonomía.** Hay dos decisiones previas en tensión —aplazar `Species` contra
   distinguir especies manejadas—. Dueño: Daniel. Sin esto, «protocolo por especie» (Q27) no
   se puede construir.
2. **Q28 / cadena de la miel.** Falta la parte central. Alcance y forma por decidir; hoy no
   hay ninguna pantalla que la pida.
3. **Alza como activo con identidad** (Q26A, última frase). Hoy la caja se configura por
   número de piezas; un alza concreta que viaja entre colmenas no tiene identidad.
4. **Biblioteca de protocolos de polinización** (Q31), y si la familia Roubik entra como
   `ProtocolVersion` del motor que ya existe.

## 5. Lo que recomiendo hacer con esto

Nada, todavía, salvo leerlo. Es una tabla de equivalencias para que la próxima rebanada no
empiece renombrando. El bucle del Anexo E puede seguir exactamente igual: **ninguna de sus
piezas contradice el paquete**, y tres de ellas (ADR-126, ADR-130, ADR-135) son la
implementación literal de Q29 y Q26A.
