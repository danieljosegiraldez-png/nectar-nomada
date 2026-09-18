# Ajustes del beneficio — diseño

**Fecha:** 2026-09-17 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `d3d63c4`; **revisado el 2026-09-18** sobre `4bdc7da` con las decisiones de permisos (§2, §4.2, §4.3, §6, §7)

**Alcance.** La configuración del beneficio, separada de la pantalla con la que se opera. Es hermana del tablero del beneficio (spec #363) y sigue el patrón que el tablero de parcela (#362, fusionado) ya estableció: **la pantalla enseña, los ajustes configuran**.

| pieza | qué | dónde |
|---|---|---|
| tablero del beneficio | qué pide atención ahora, y si cabe más cereza | spec #363 |
| **este spec** | **el sitio, las capacidades, y un centro que reúne equipos, instalaciones y recetas** | aquí |
| insumos | catálogo, existencias, dosis | spec #365 |

---

## 1. El problema

Daniel, 2026-09-17 (sus palabras, con dos erratas de teclado corregidas): *«debe haber una parte de configuración de beneficio para el farm manager o owner, y estas configuraciones deben estar separadas de la UI/UX de operación día a día»*.

Hoy la configuración **existe pero está repartida**, y medida sobre `main` son tres sitios sin nada que los reúna:

| qué se configura | dónde está hoy |
|---|---|
| equipos: registrar, mover, condición, verificación | `/equipos`, `/equipos/nuevo`, `/equipos/[id]` |
| instalaciones de secado y sus camas | `/instalaciones`, `/instalaciones/nueva`, `/instalaciones/[id]` |
| recetas, con `everyHours` y `expectedHours` | `/recipes`, `/recipes/new`, `/recipes/[id]` |
| **el sitio del beneficio** | **ninguna pantalla**: sólo `scripts/procedencias-y-sitios.ts` |
| **capacidad de tanques y camas** | **no se puede declarar**: el campo no existe |

Son 79 rutas declaradas y ninguna es un centro de configuración. Y `CLAUDE.md` §47 pide tableros por rol, que tampoco existen.

## 2. Decisiones de Daniel (2026-09-17)

| pregunta | decisión |
|---|---|
| forma | **un centro que reúne y enlaza**: `/beneficio/ajustes`. Lo ya construido se enlaza, **no se mueve ni cambia de dirección** |
| qué lleva | las cuatro: **alta del sitio**, **capacidades**, **equipos/instalaciones/camas**, **recetas y sus ritmos** |
| quién configura | **Farm Manager y dueño. El capataz no** — «no un capataz», sus palabras |
| quién crea un beneficio | **también el Farm Manager**, no sólo alcance de plataforma |
| dónde puede crearlo | **dentro de lo que ya gestiona**: el beneficio nace colgado de un sitio suyo, y hereda su alcance |
| qué es un beneficio en el modelo | **un `LocationType` propio, hijo del sitio de la finca** |

**Decisiones del 2026-09-18**, tras la auditoría de Codex sobre lo ya fusionado (#377), que encontró caminos por los que el capataz todavía editaba un beneficio:

| pregunta | decisión |
|---|---|
| ¿puede el capataz editar un beneficio? | **por defecto no.** *«El capataz puede editar un beneficio si en configuración el Farm Manager/owner le da ese permiso; por defecto NO»* |
| cómo se concede | **por persona**, desde los ajustes de ese beneficio, con razón escrita; auditado y revocable |
| qué abre | **todo el beneficio**: nombre, atributos, coordenadas, instalaciones, camas, equipos y capacidades |
| recetas | **detrás del mismo permiso**: crear y publicar. **Usarlas** en un lote sigue siendo operación y sigue abierto al capataz |

## 3. El tipo de ubicación

**`beneficio` es un tipo propio.** Hoy no existe: los tipos son `site`, `plot`, `micro_plot`, `apiary_site`, `meliponary`, `drying_facility`, `drying_bed` y los administrativos. Un beneficio sólo podría ser un `site`, y entonces **nada lo distingue de una finca o una bodega** salvo su nombre — deducirlo del nombre es exactamente lo que las reglas de la casa prohíben.

Sigue dos precedentes escritos en el propio esquema:

- **`meliponary`**, tipo propio por decisión de Daniel del 2026-09-16, porque el manejo cambia y porque un meliponario vacío no podía decir de qué era;
- **`drying_facility` / `drying_bed`**, que ya cuelgan de un `site` con el mismo patrón: una `Location` con su tipo y su padre, **no una familia de entidades nueva**.

**Lo que desbloquea:** un `Equipment` se coloca hoy en un sitio, así que un tanque vive «en Finca Rosina». Con el tipo, vive **en el beneficio de Finca Rosina**, y el tablero puede filtrar por el beneficio sin adivinar.

**Jerarquía permitida**, validada en el servidor como ya hace `crearUbicacionDeSecado`: `beneficio` sólo bajo `site`; `drying_facility` sigue pudiendo colgar del `site` **o del `beneficio`**. Las instalaciones existentes **no se mueven** ni se reasignan hacia atrás: donde están es donde alguien las puso.

## 4. Diseño

### 4.1 Las dos superficies

| | `/beneficio` — operar | `/beneficio/ajustes` — configurar |
|---|---|---|
| qué lleva | cola de atención, ocupación, instrumentos vencidos | sitio, capacidades, y los enlaces a equipos, instalaciones y recetas |
| formularios | **ninguno** | todos |
| quién | quien opera | **Farm Manager y dueño** |
| enlace | «Gestionar beneficio» | «Volver al tablero» |

El par de enlaces es el mismo que la parcela ya usa con «Gestionar parcela».

### 4.2 Las cinco secciones de ajustes

1. **El sitio.** Alta y edición del beneficio: nombre, sitio padre, y los atributos que `Location` ya tiene. El desplegable de padres ofrece **sólo los sitios donde quien mira puede**, y el servidor lo vuelve a resolver — *el `value` de un desplegable no es autorización*, como ya dice la razón declarada de `/equipos/nuevo`.
2. **Capacidades.** `capacidadKg` de cada tanque y cada cama, el campo que el spec #363 §4.3 deja para su paso 2. Cero es un dato; negativo se rechaza en el servidor; sin declarar se dice «capacidad sin declarar» y **nunca se inventa un número**.
3. **Equipos.** Recuento por tipo y estado, y enlaces a `/equipos` y `/equipos/nuevo`. Nada se reimplementa.
4. **Instalaciones y camas.** Cuántas hay y enlace a `/instalaciones`.
5. **Recetas y sus ritmos.** Cuáles declaran `everyHours` y `expectedHours` y cuáles no — que es lo que decide si el tablero puede avisar de una lectura debida (#363 §4.2) — y enlace a `/recipes`.

Las secciones 3, 4 y 5 son **de lectura y enlace**: lo que se edita, se edita en su pantalla. **Pero esas pantallas no tienen hoy la guardia que esta spec necesita**, y la primera versión decía lo contrario. Medido sobre `main` el 2026-09-18 por la auditoría de Codex y comprobado en el código:

| camino | qué exige hoy | por qué no basta |
|---|---|---|
| crear y editar instalaciones y camas (`lib/traceability/instalaciones.ts`) | `location:manage_attributes` | el capataz lo tiene |
| crear, editar y publicar recetas (`lib/traceability/processTargets.ts`) | `manage` sobre un lote | el capataz tiene `lot:manage` |
| atributos de una ubicación (`updateLocationAttributes`, vía `updatePlotAttributesAction`) | `manage_attributes`, **sin mirar el tipo** | el capataz edita área, altitud y descripción de un beneficio por POST |
| coordenadas (`confirmarCoordenadasDelSitio`) | lo mismo, vía `requireFieldSessionAccess` | el capataz mueve el beneficio |
| subdividir (`createMicrolot`) | `manage_attributes`; **copia el tipo del padre** | sobre un beneficio crearía otro beneficio. Hoy ninguna pantalla lo llama |

Proteger `/beneficio/ajustes` era una regla de navegación. La regla de Daniel es sobre **escrituras**, así que cada uno de esos servicios comprueba el permiso de §4.3 cuando lo que escribe es un beneficio o cuelga de uno. Ocultar el enlace no protege nada.

### 4.3 Permisos

| acción | dueño | Farm Manager | Farm Operator (capataz) |
|---|---|---|---|
| ver el tablero y operar | sí | sí | **sí** |
| informar la condición de un equipo, registrar lotes y mediciones, **usar** una receta | sí | sí | **sí** — es operar |
| crear el beneficio | sí | **sí, dentro de lo que gestiona** | **no** |
| editar el beneficio: nombre, atributos, coordenadas, instalaciones, camas, equipos, capacidades | sí | sí | **sólo si se le concede** |
| crear y publicar recetas | sí | sí | **sólo si se le concede** |
| conceder o quitar «editar beneficio» a una persona | sí | **sí, sólo ese permiso y sólo donde él lo tiene** | no |

**Un segundo permiso, «editar beneficio»** (nombre exacto a contrastar con `docs/beneficio/03_public_api.md` y `lib/rbac/catalog.ts` en el plan), de serie para **Platform Admin y Farm Manager** y **excluido de Farm Operator a propósito**. Va aparte de `location:create_site` porque son dos autoridades distintas: conceder a un capataz que edite no le da crear beneficios nuevos. Hoy `actualizarBeneficio` exige `create_site`; pasa a exigir el permiso nuevo.

**Cómo se concede.** El repositorio ya tiene concesiones por persona —`AssignmentPermissionOverride`, con razón obligatoria para un `grant` impuesta por un `CHECK` en la base—, pero **hoy sólo las escribe quien tiene `platform:manage_permissions`**, o sea el Platform Admin (`requirePermissionAdmin` en `lib/rbac/admin.ts`). La sección de ajustes añade una **delegación estrecha**:

- quien concede tiene «editar beneficio» sobre ese beneficio;
- sólo puede conceder o quitar **ese** permiso, nunca otro — no es una puerta a `manage_permissions`;
- la persona que lo recibe tiene una asignación cuyo ámbito alcanza ese beneficio;
- razón obligatoria, `AuditEvent` en la misma transacción, y se puede quitar.

**Un límite, dicho ya:** la concesión cuelga de la **asignación** del capataz. Si su asignación cubre la finca entera y la finca tiene dos beneficios, la concesión vale para los dos. Hoy hay un beneficio por finca y no cambia nada; si llega un segundo, se decide entonces si hace falta una concesión por beneficio.

**El permiso de crear**, `location:create_site` en `lib/rbac/catalog.ts` —ya fusionado en #377—, concedido a **Platform Admin y Farm Manager** y **excluido de Farm Operator a propósito** — el catálogo ya escribe exclusiones así, como `lot:override_balance`, que deliberadamente no se le da al operario.

**Se comprueba sobre el sitio padre** con `requireLocationAttributeAccess`, igual que `crearUbicacionDeSecado`, más el permiso nuevo. Así un Farm Manager de una finca **no puede** crear un beneficio en otra: no es una regla de pantalla, es el mismo mecanismo de asignaciones que ADR-144 ya define.

**Sin permiso, `/beneficio/ajustes` responde 404**, como ya hace `/equipos/[id]`, y el tablero **no pinta el enlace**. Una página vacía diría qué hay dentro.

## 5. La separación no se mantiene sola: un guardia

**Un guardia de arquitectura** que lee la fuente, como ya hacen `tests/arquitectura/audit-atomico.test.ts` y `use-server-solo-async.test.ts`:

- `app/beneficio/page.tsx` **no contiene ningún `<form>` ni invoca acciones de servidor**;
- `app/beneficio/ajustes/page.tsx` **no invoca las acciones del día a día** —abrir fermentación, registrar lectura, cerrar fase—.

La regla en prosa se lee y se razona alrededor; en un test, falla. Y el guardia lleva su flip-test obligatorio: **meter un formulario en el tablero tiene que hacerlo caer, con el mutante compilando**. Si el mutante no compila, no probó nada.

## 6. Pruebas

**Permisos, con las tres caras** (grupo `base-sembrada`):

- Farm Manager entra a ajustes y guarda una capacidad;
- **capataz → 404**, y el tablero sin enlace;
- **Farm Manager de otra finca → no puede crear un beneficio ahí.** Ésta es la que importa, porque el permiso nuevo es el que ensancha el acceso.

**«Editar beneficio», camino por camino**, porque la regla es sobre escrituras y cada servicio de §4.2 la comprueba por su cuenta:

- por cada camino —ficha, atributos, coordenadas, instalación, cama, equipo, capacidad, receta—: **capataz sin concesión → rechazado** y **Farm Manager → aceptado**. El segundo es el control positivo: sin él, un rechazo por otra causa pasaría por guardia;
- **capataz con concesión → aceptado** en ese beneficio;
- **operar sigue abierto**: el capataz sin concesión informa la condición de un equipo y usa una receta en un lote;
- `createMicrolot` sobre un beneficio → **rechazado para todos**: un beneficio no se subdivide en beneficios;
- **delegación estrecha**: un Farm Manager concede «editar beneficio» y **no puede** conceder ningún otro permiso; un `grant` sin razón no entra, **en la base**; quitarlo le devuelve al capataz el rechazo.

**El tipo de ubicación:** un `beneficio` bajo un `plot` se rechaza; bajo un `site` se acepta; una `drying_facility` puede colgar de un `beneficio`.

**Capacidades:** `null`, `0`, negativa, y no numérica.

**Flip-tests**, contra el commit, con sha antes y después, compila, y qué prueba cae por su nombre:

1. formulario en el tablero → cae el guardia de separación;
2. conceder el permiso nuevo a Farm Operator → cae la prueba del capataz;
3. no comprobar el sitio padre al crear → cae la prueba del manager ajeno;
4. tratar `capacidadKg` `null` como `0` → cae una prueba;
5. quitar la comprobación de «editar beneficio» de `updateLocationAttributes` → cae la prueba del capataz sin concesión en atributos; repetir con coordenadas e instalaciones, **una mutación por camino**, porque un guardia compartido que caiga en uno no prueba los demás;
6. dejar que la delegación acepte cualquier permiso → cae la prueba de «no puede conceder otro».

**Compuerta por tarea:** `npm run build` en toda tarea que toque TypeScript, y al final `npm run verify` y `scripts/ci.sh`. La ruta nueva se declara en `scripts/rutas-declaradas.mjs` y las cifras de `docs/arquitectura/inventario-de-acceso.md` se recalculan con su script.

**Y aprueban también los documentos normativos del beneficio**: `docs/beneficio/03_public_api.md` es el contrato de nombres —el nombre del tipo y del permiso se contrastan ahí antes de escribirlos—, y las rúbricas `21_rubrica_veracidad.md` y `22_rubrica_pedagogica.md` pesan igual que el funcional.

## 7. Orden

1. **Este spec**, PR sólo de documentación.
2. **El tipo `beneficio` y su alta** (migración de enum, permiso nuevo, pantalla de alta). **Hecho: #377, fusionado el 2026-09-17.**
3. **«Editar beneficio» y los caminos de §4.2 cerrados**, con la delegación estrecha. Va **antes** que el resto de ajustes, porque corrige lo ya fusionado: hoy el capataz edita un beneficio sin que nadie se lo haya concedido.
4. **Ajustes con las cinco secciones y las capacidades**, después del tablero, porque las capacidades sólo tienen sentido cuando hay dónde leerlas (#363).
5. **ADR nuevo** para «editar beneficio» y su delegación. El tipo y `create_site` ya quedaron en ADR-156 (#377); el número del nuevo se toma al escribirlo, no ahora.
6. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Mover `/equipos`, `/instalaciones` o `/recipes` · un rol nuevo de Processing Manager · reasignar hacia atrás las instalaciones existentes al beneficio · capacidad en m² o litros · configuración de apiario y parcela · avisos empujados, que esperan a `Notification`.
