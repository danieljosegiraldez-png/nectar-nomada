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
| `fuentes/paquete-q1-q49/` | **las 49 decisiones de descubrimiento** —su registro es `02-DECISION-REGISTER-Q01-Q49.md`— y la arquitectura objetivo que consolidan | `MANIFIESTO.sha256`, 14 archivos |
| `fuentes/smart-hive-v1/` | el paquete de ingeniería del nodo de sensores: firmware, compras, cableado, esquemas | **su propio** `MANIFEST.sha256`, 68 archivos |

## Material de dominio

| fuente | estado | lo que hay que saber antes de usarla |
|---|---|---|
| `varroa-inspeccion-desinfeccion.md` | **borrador** | escrito para **clima templado**. El **ácido fórmico** es un asunto de seguridad en el trópico: el propio texto dice que por encima de 27 °C mata a la reina |
| `meliponini-especies.md` + `meliponini-seeder.js.txt` | **borrador** | 3 especies uno, 4 el otro, 5 según Daniel; **dos de tres discrepan entre sí** en medidas y alcance |
| `ansa-manejo-racional-meliponas.md` | **referencia externa** | ficha, no el libro. **Es de Tucumán**: sus especies son argentinas; los géneros coinciden, las especies no |
| `acidez-en-fermentacion.md`, `azucares-brix.md`, `seleccion-y-subproductos.md` | **borrador** | las tres de P-F, del 2026-09-13 |

**P-F cubre ahora las cinco en borrador.** Cerrarla es que Daniel las lea y diga cuáles
respalda; el software no puede decidirlo por él.

## Lo que NO está guardado, y por qué

- **El PDF del libro de ANSA.** Es una obra publicada. Aquí va la ficha con su sha256; si
  Daniel decide versionar el PDF, se añade con ese mismo sha.
- **Los `.zip`** de los paquetes: se comprobó que su contenido está copiado y es idéntico.
- **`.DS_Store`**: basura de macOS que Finder reescribe al abrir una carpeta.
- **Ningún `CLAUDE.md`** venía en los paquetes —comprobado—. Si viniera, no se copiaría: se
  carga en cada sesión y contradiría al del repositorio.

## Cómo se verifica que una copia sigue siendo la fuente

`tests/arquitectura/fuentes-verbatim.test.ts`, en cada corrida. Comprueba los manifiestos de
los dos paquetes y el cuerpo de los documentos con cabecera contra el sha que declaran — y
lleva cuatro controles que **alteran copias a propósito**, porque un verificador que sólo
se prueba contra copias buenas no se ha probado.

**No editar el cuerpo de ninguna fuente.** Una corrección va como nota del dueño, fechada,
aparte — la regla que él mismo fijó en ADR-147.
