# Ajustes del beneficio — diseño

**Fecha:** 2026-09-17 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `d3d63c4`

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

Las secciones 3, 4 y 5 son **de lectura y enlace**. Si un día hay que editar algo allí, se hace en su pantalla, que ya existe y ya tiene sus guardias.

### 4.3 Permisos

| acción | dueño | Farm Manager | Farm Operator (capataz) |
|---|---|---|---|
| ver el tablero y operar | sí | sí | **sí** |
| registrar equipo, informar condición | sí | sí | **como hoy**, en su pantalla |
| declarar capacidades | sí | sí | **no** |
| crear o editar el beneficio | sí | **sí, dentro de lo que gestiona** | **no** |

**Un permiso nuevo**, `location:create_site` en `lib/rbac/catalog.ts`, concedido a **Platform Admin y Farm Manager** y **excluido de Farm Operator a propósito** — el catálogo ya escribe exclusiones así, como `lot:override_balance`, que deliberadamente no se le da al operario.

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

**El tipo de ubicación:** un `beneficio` bajo un `plot` se rechaza; bajo un `site` se acepta; una `drying_facility` puede colgar de un `beneficio`.

**Capacidades:** `null`, `0`, negativa, y no numérica.

**Flip-tests**, contra el commit, con sha antes y después, compila, y qué prueba cae por su nombre:

1. formulario en el tablero → cae el guardia de separación;
2. conceder el permiso nuevo a Farm Operator → cae la prueba del capataz;
3. no comprobar el sitio padre al crear → cae la prueba del manager ajeno;
4. tratar `capacidadKg` `null` como `0` → cae una prueba.

**Compuerta por tarea:** `npm run build` en toda tarea que toque TypeScript, y al final `npm run verify` y `scripts/ci.sh`. La ruta nueva se declara en `scripts/rutas-declaradas.mjs` y las cifras de `docs/arquitectura/inventario-de-acceso.md` se recalculan con su script.

**Y aprueban también los documentos normativos del beneficio**: `docs/beneficio/03_public_api.md` es el contrato de nombres —el nombre del tipo y del permiso se contrastan ahí antes de escribirlos—, y las rúbricas `21_rubrica_veracidad.md` y `22_rubrica_pedagogica.md` pesan igual que el funcional.

## 7. Orden

1. **Este spec**, PR sólo de documentación.
2. **El tipo `beneficio` y su alta** (migración de enum, permiso nuevo, pantalla de alta). Puede ir **antes** del tablero si Daniel quiere dar de alta un beneficio ya; es independiente.
3. **Ajustes con las cinco secciones y las capacidades**, después del tablero, porque las capacidades sólo tienen sentido cuando hay dónde leerlas (#363).
4. **ADR nuevo** para el tipo de ubicación y el permiso: el último es ADR-151, así que el siguiente número se toma al escribirlo, no ahora.
5. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Mover `/equipos`, `/instalaciones` o `/recipes` · un rol nuevo de Processing Manager · reasignar hacia atrás las instalaciones existentes al beneficio · capacidad en m² o litros · configuración de apiario y parcela · avisos empujados, que esperan a `Notification`.
