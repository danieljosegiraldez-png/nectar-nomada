# Un beneficio puede existir sin finca propia

**Estado: propuesta, pendiente de que Daniel la revise.** Reserva el ADR-197, que no se
escribe en `DECISIONS.md` hasta que este diseño se apruebe.

## La decisión de Daniel, 2026-10-06

1. «Una organización puede tener un beneficio y no tener finca, que sólo compran.»
2. «`Las Nubes` puede procesar cerezas de café de otra finca no propia.»
3. De las tres formas propuestas eligió **sin padre, y la organización es el ancla**, en la
   variante **opcional**: el beneficio que ya tiene padre **lo conserva**.

Consecuencia concreta: `Las Nubes` sigue bajo `Finca Rosina` y nada vivo cambia. El
beneficio de Kiva nace **sin padre** y con organización `Kiva Estate`.

## Lo que hay hoy, medido

- **La regla vive en una línea de TypeScript.** `lib/traceability/beneficios.ts:94`:
  `if (padre.locationType !== "site") throw new BeneficioError("padre_invalido")`. Ningún
  disparador, `CHECK`, índice único ni clave ajena la impone, y `parentLocationId` ya es
  opcional en el esquema. **No hace falta migrar por la regla en sí.**
- **La organización de un beneficio sale de su padre**, no de sí mismo: `crearBeneficio`
  copia `padre.organizationId` (línea 99). Medido contra producción el 2026-10-06:
  **`Las Nubes` tiene `organization_id` NULO**, aunque su padre `Finca Rosina` sí tiene uno.
  El invariante en el que se apoyan los filtros de abajo **ya no se cumple hoy**.
- **El contrato no lo dice.** En `docs/beneficio/03_public_api.md` la palabra «beneficio»
  aparece una vez, como posible padre de una bodega, y `LocationType.beneficio` no está
  declarado en ninguna línea. El tipo lo creó el ADR-156, que `docs/beneficio` no cita ni
  una vez. Es un defecto de especificación previo a este cambio, no una contradicción con él.
- **Ninguna cadena de trazabilidad deduce la finca de un lote subiendo desde el beneficio.**
  El origen de la cereza vive en vínculos explícitos (recepción → entrega → jornada →
  `fincaSite`, o proveedor) y la ruta finca → beneficio es la clave `beneficioDestinoId`.
  Lo que sí sube por el padre es **la organización y los permisos**.

## Lo que se rompe en silencio al relajar la regla

Siete confirmados por un escéptico por hallazgo, volviendo a los archivos (de 11 candidatos;
4 refutados). Ordenados por lo que cuestan:

| # | dónde | qué pasaría |
|---|---|---|
| 1 | `lib/beneficio/vistaDeBandejas.ts:80` | el filtro «la organización tiene algún `site`» deja fuera a una organización con beneficio y sin finca. `/beneficio/bandejas` dice «No ves ninguna organización con bandejas todavía»: lee «no hay» donde la verdad es «no te dejo» |
| 2 | `tests/beneficio/vistaDeBandejas.test.ts:156` | **afirma lo contrario** que el dueño quiere: «una organización sin ningún `site` no aparece». Si sólo se relaja el servicio, sigue en verde |
| 3 | `app/beneficio/ajustes/page.tsx:51` | para una organización sin finca `sitiosParaBeneficio` lanza y la página da **404**, idéntico al de «no tienes permiso» |
| 4 | `app/beneficio/ajustes/FormularioBeneficio.tsx:18` | el desplegable de padre es obligatorio y no hay opción «sin finca» ni selector de organización: la función nueva sería inalcanzable por pantalla y ninguna prueba cae |
| 5 | `lib/traceability/lots.ts:691` | `conDescendientes(asignadas)` es la única razón por la que un gestor de finca ve los lotes del beneficio **en las listas**; sin padre, las listas salen más cortas sin mensaje (el acceso puntual sí falla en rojo) |
| 6 | `lib/traceability/jornadasDeCosecha.ts:114` | el desplegable «a qué beneficio va esta cosecha» se alimenta de la cadena de padres: saldría **vacío** para el gestor de una finca ajena, que es justo el caso de `Las Nubes` procesando cereza de otro |
| 7 | `tests/traceability/beneficios.test.ts:107` | compara `null` contra `null` (el fixture crea el `site` sin organización): quitar la copia de `organizationId` lo deja en verde |

Y dos riesgos de **procedencia**, que son los que `21_rubrica_veracidad` no perdona:

- `armarLote` fija la organización del lote **desde el beneficio**, una sola vez, y el
  linaje y las muestras la copian. Para cereza ajena, «organización del lote» pasa a ser la
  que **procesa**, no la que cultivó.
- La cata imprime esa organización **como «finca»**. Un informe de taza de cereza ajena
  diría que la finca es la del beneficio.

## Tres cambios, en este orden

Cada uno es útil solo y ninguno depende de que el siguiente exista.

**PR 1 — la organización del beneficio deja de salir de su padre.** Unos 10 archivos. No
cambia la regla, no rompe nada, y neutraliza de golpe la mayoría de los hallazgos de
arriba, porque un beneficio con `organizationId` propio satisface los cuatro filtros
`organizationId: { not: null }` que se midieron
(`lib/equipos/equipos.ts:927`, `lib/equipos/modelos.ts:445`,
`lib/catalogos/propiedad.ts:67`, `lib/inventario/recepcion.ts:61`) y los 13 archivos que
llaman a `resolveOrganizationForLocation`. Con lo medido en producción **esto ya es un
arreglo de algo roto**, no una preparación: hay que poner la organización de `Las Nubes`.
Eso es una escritura en producción y la hace Daniel, con su guion y su ensayo.

**PR 2 — se relaja la regla y se hacen alcanzables las pantallas.** `crearBeneficio` acepta
sin padre y exige organización; `sitiosParaBeneficio` deja de ser la única puerta; el
formulario gana el selector de organización y «sin finca»; `vistaDeBandejas` cambia el
filtro A5 por «tiene un `site` o un `beneficio`»; y **se reescribe el test de la línea 156
en vez de dejarlo como guardia**.

**PR 3 — permisos y procedencia.** Qué ve un gestor de finca de un beneficio que ya no
cuelga de su finca (hallazgos 5 y 6), y que un lote procesado deje de heredar como «finca»
la organización del beneficio.

## Lo que Daniel pierde con esta forma, dicho una vez

Sin padre, un beneficio pierde dos cosas que hoy tiene gratis: **los permisos no tienen
jerarquía que recorrer** —todo acceso a un beneficio sin padre es por asignación explícita
sobre el propio beneficio— y **no está en ninguna geografía**, que es lo que la §6 de la
especificación pide de una ubicación. La variante «opcional» lo acota: sólo lo pagan los
beneficios que nacen sin padre.

## Decisiones abiertas, y son de Daniel

1. **Qué ve el gestor de una finca como destino de su cosecha** (hallazgo 6). Hoy sólo ve
   el beneficio que cuelga de su finca. Para que `Las Nubes` procese cereza ajena, ¿ve todos
   los beneficios de la plataforma?, ¿los de su organización y los que le hayan concedido?,
   ¿los que su finca tenga enlazados por `beneficioDestinoId`? Cambia quién puede mandar
   cereza adónde.
2. **Quién crea un beneficio sin padre.** Hoy exige permiso sobre el `site` padre. Sin padre
   hace falta decir sobre qué: ¿la organización?, ¿la plataforma?
3. **Si el beneficio de Kiva se crea ya, o espera al PR 2.** Hasta entonces no se puede por
   pantalla.

## Lo que este diseño NO cubre, y nadie miró

- **`lib/rbac/resolve.ts` quedó sin leer.** De todo el RBAC sólo se leyó `conAncestros`
  (`lib/rbac/service.ts:173-192`). Ahí vive la decisión irreducible: cómo se resuelve un
  permiso cuando el ámbito es un beneficio sin ancestros. El PR 3 empieza por leerlo.
- **Nadie midió producción más allá de la celda de `Las Nubes`.** Falta saber cuántas
  filas dependen hoy de la organización de un beneficio.
- El tamaño de los PR 2 y 3 es una estimación del inventario, no un recuento.

## Qué comprobaría cada PR

La regla de esta casa para una ficha: la comprobación es **llamar la función y contar lo que
devuelve**, no que exista el archivo. Cada PR lleva una prueba que cae con el defecto puesto:
una organización con beneficio y sin finca **aparece** en `/beneficio/bandejas`; una
cosecha de finca ajena **ofrece** el beneficio de destino; y un lote de cereza ajena **no
imprime** la organización del beneficio como su finca.
