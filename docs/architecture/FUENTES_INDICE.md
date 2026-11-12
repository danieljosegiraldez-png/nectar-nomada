<!--
FUENTE. Índice de todo el material de soporte que Daniel ha entregado, y de dónde vive.
-->

# Índice de fuentes — el material de soporte, dónde está y cómo se verifica

**Por qué existe.** El 2026-09-17 Daniel lo dijo: *«deberías tener más documentación y
material de soporte guardado, revisar todo»*. Tenía razón y se midió: de todo lo entregado
en septiembre, el repositorio guardaba **sólo las cuatro fuentes de Cerro Azul**. El resto
vivía en `~/Downloads`, en `~/Documents/Codex` o **sólo en la transcripción de la
conversación** — que no se versiona y que la sesión siguiente no lee.

Antes lo había pedido con otras palabras: *«no quiero que se pierda que fue mucha
investigación y preparación… servirá más allá del build como data de referencia»*.

## Dos clases, y no se mezclan

| clase | dónde | qué es | cómo se lee |
|---|---|---|---|
| **registro** | `docs/architecture/FUENTE_*` y `fuentes/` | lo que se dijo o se decidió: minutas, decisiones, paquetes | autoritativo **como registro** de lo que se dijo |
| **material de dominio** | `docs/dominio/` | conocimiento técnico con cifras: umbrales, dosis, medidas | su `estado` manda; un **borrador** no sostiene nada automático |

La distinción no es de estilo. `tests/arquitectura/material-de-dominio-declarado.test.ts`
existe porque en septiembre entraron guías con *«umbrales con pinta de norma»* redactadas
por un modelo y sin revisar. **Una matriz sin su rótulo es indistinguible de un umbral que
el dueño respalda, y el código se apoya en los dos por igual.**

## Registros

| fuente | qué es | verificación |
|---|---|---|
| `FUENTE_CERRO_AZUL_INDICE.md` + 4 | minutas de Las Nubes y el marco de investigación suelo → taza (ADR-146) | cabecera; su propio índice |
| `FUENTE_DECISIONES_DEL_DUENO_2026-09.md` | **trece decisiones de Daniel, en sus palabras literales**, cada una con su línea de la transcripción y lo que produjo | cada texto comprobado íntegro contra la extracción |
| `FUENTE_DECISIONES_DEL_DUENO_2026-10-APIARIO.md` | la entrevista sobre el Apiario del 2026-10-11 y el 2026-10-12: cada pregunta con sus opciones y la respuesta literal de Daniel; ADR-200 la resume por tema | extraído de la transcripción por programa, cada respuesta con su línea del `.jsonl` y su hora UTC |
| `fuentes/paquete-q1-q49/` | **las 49 decisiones de descubrimiento** —su registro es `02-DECISION-REGISTER-Q01-Q49.md`— y la arquitectura objetivo que consolidan | `MANIFIESTO.sha256`, 14 archivos |
| `fuentes/smart-hive-v1/` | el paquete de ingeniería del nodo de sensores: firmware, compras, cableado, esquemas | **su propio** `MANIFEST.sha256`, 68 archivos |

## Material de dominio

**El estado de cada fila es el de la línea `estado    :` de la cabecera del archivo, y si
discrepan manda la cabecera.** Esta tabla siguió diciendo «borrador» de cinco archivos que
habían dejado de serlo el 19 y el 27 de septiembre, y nada lo veía. Desde el 2026-10-19 lo vigila
`tests/arquitectura/indice-de-fuentes-al-dia.test.ts`: cada entrada de `docs/dominio/` tiene
que tener fila, y la fila de cada `.md` tiene que decir su estado exacto.

| fuente | estado | lo que hay que saber antes de usarla |
|---|---|---|
| `varroa-inspeccion-desinfeccion.md` | **respaldado en parte** | Daniel respaldó el 2026-09-27 los **procedimientos** y **ningún número**: ni el umbral de tratamiento, ni las dosis, ni los rangos de temperatura, ni el 10 % del monitoreo. Escrito para **clima templado**. El **ácido fórmico** no se ofrece sin su advertencia: el propio texto dice que por encima de 27 °C mata a la reina |
| `meliponini-especies.md` | **referencia externa** | Daniel la bajó a referencia el 2026-09-27. Lo escribió un modelo, no cita fuente y no hay nada que respaldar, así que nada del software se apoya en ella. Trae 3 especies, el seeder 4 y Daniel habla de 5; dos de las tres comunes discrepan en alcance y medidas de caja. Su cuerpo lo fija por sha `fuentes-verbatim.test.ts` |
| `meliponini-seeder.js.txt` | **sin cabecera propia** | no declara estado: empieza en `# seeder.js`. Es la otra mitad de la discrepancia de arriba y no cita fuente. El guardia de procedencia sólo mira `.md`. ADR-200 §3: ningún nombre de la semilla pasa a datos |
| `ansa-manejo-racional-meliponas.md` | **referencia externa** | ficha, no el libro. **Es de Tucumán**: sus especies son argentinas; los géneros coinciden, las especies no |
| `meliponini-amenazas-2026-10-11.md` | **referencia externa** | revisión compilada del 2026-10-11. Las fuentes las abrieron los agentes verificadores, y Daniel decidió sobre su resumen sin repasarla (ADR-200 §2). Ni umbral, ni dosis, ni protocolo: nada está probado en Panamá |
| `meliponini-sistemas-de-caja-2026-10-11.md` | **referencia externa** | revisión compilada del 2026-10-11. Daniel decidió sobre su resumen (ADR-200 §4). **No da medidas de caja para especies panameñas**: no hay ninguna con fuente |
| `acidez-en-fermentacion.md`, `azucares-brix.md`, `seleccion-y-subproductos.md` | **reemplazado · no normativo** | del 2026-09-13. Los sustituyen `docs/beneficio/10`, `11` y `12` (v3.1), y por ADR-181 los umbrales salen de la receta. **Reemplazado no es revisado**: sólo la de acidez la repasó Daniel (2026-09-18/19); las otras dos dicen `revisado  : NO` |
| `revision-literatura-fermentacion-2026-09-19.md` | **referencia externa** | revisión compilada. Cada afirmación lleva su marca: ✅ cita comprobada contra la fuente, ◻ sin comprobar, y una ◻ no se cita como hecho. No es umbral del motor (ADR-181) |
| `revision-2026-09-19/` | **referencia externa** | los seis informes A-F de esa revisión, copiados sin editar. Cada uno lo dice en su cabecera: «NO verificado salvo lo que marca con ✅», y tiene errores conocidos que la revisión de arriba señala |
| `agratronix-coffee-tester-08150.md` | **referencia externa** | la ficha del medidor de humedad, con cifras literales del catálogo del fabricante. Dice lo que el fabricante promete; **no sustituye el contraste contra patrón** (ADR-181, `02_calibration` §3) |
| `fitosanitarios-etiquetas.md` | **referencia externa** | cuatro etiquetas de fabricante. **Ninguna registra café**, así que de aquí no sale ninguna dosis de aplicación en café |
| `broca-manejo-recomendaciones.md` | **referencia externa** | recomendaciones de terceros sobre cuándo asperjar y con qué umbral; **no son la dosis de los productos de la bodega**. Las de Cenicafé son para Colombia, y sólo una fuente se leyó de primera mano: el resto es el resumen de un buscador |

**P-F está cerrada** (Daniel, 2026-09-27, `e9b1475d`): hoy ningún archivo de `docs/dominio/`
está en borrador, y `scripts/open-decisions.sh` la reabre solo si entra uno. Cerrada no quiere
decir que todo esté respaldado: el estado de cada fila es el de su cabecera, y su campo
`revisado` dice qué parte respalda Daniel.

## Lo que NO está guardado, y por qué

- **El PDF del libro de ANSA.** Es una obra publicada. Aquí va la ficha con su sha256; si
  Daniel decide versionar el PDF, se añade con ese mismo sha.
- **Los `.zip`** de los paquetes: se comprobó que su contenido está copiado y es idéntico.
- **`.DS_Store`**: basura de macOS que Finder reescribe al abrir una carpeta.
- **Ningún `CLAUDE.md`** venía en los dos paquetes de `fuentes/` —comprobado—. El
  `coffee_processing_specs_packet`, del que salen las tres guías de café, **sí traía uno**
  (Python, `pip`, `pytest`), y no se copió: lo dicen `acidez-en-fermentacion.md` y
  `azucares-brix.md` en su cabecera. Un `CLAUDE.md` se carga en cada sesión y contradiría al
  del repositorio.

## Cómo se verifica que una copia sigue siendo la fuente

`tests/arquitectura/fuentes-verbatim.test.ts`, en cada corrida. Comprueba los manifiestos de
los dos paquetes y el cuerpo de `docs/dominio/meliponini-especies.md` contra el sha que declara
(el de la ficha de ANSA es el del PDF, que no está guardado) — y
lleva cuatro controles que **alteran copias a propósito**, porque un verificador que sólo
se prueba contra copias buenas no se ha probado.

**No editar el cuerpo de ninguna fuente.** Una corrección va como nota del dueño, fechada,
aparte — la regla que él mismo fijó en ADR-147.
