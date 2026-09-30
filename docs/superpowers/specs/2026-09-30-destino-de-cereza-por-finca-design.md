# El destino de la cereza lo declara la finca, no el cosechador — diseño

**Fecha:** 2026-09-30 · **Camino:** arquitectónico · **Estado:** pendiente de revisión escrita de
Daniel · **Medido sobre:** `origin/main` = `bfd02533`

**De dónde sale.** ADR-194 registró la decisión de Daniel del 2026-09-29 —«el cosechador no tiene
que definir a quién le entrega; sólo entrega y pesa»— y, al escribirla, midió que el código la
contradice: `abrirJornada` **exige** `beneficioId` y además pide `can(view, lot)` **sobre ese
beneficio**. Daniel eligió rediseñar el encaminamiento, no quitar el campo ni corregir la spec.

---

## 1. Lo que el encargo NO es, medido antes de diseñar

Tres cosas parecían el mismo problema y no lo son. Dos ya están resueltas y salen del alcance:

| flujo | estado |
|---|---|
| **cereza comprada** en fincas que no están en el sistema —Jaramillo, Artillería— | **ya existe.** `recibirCereza` acepta `OrigenDeRecepcion = { proveedorId, pesoDeclaradoKg? }`, que **no pasa por ninguna jornada**: el destino **es** el beneficio donde se recibe. Es la «cereza de fuera» de ADR-194 |
| **jornadas de cosecha** de fincas cuya cosecha se registra | **esto es lo que se rediseña** |
| **mover un lote de un beneficio a OTRO** —Cafelino procesa y manda a Kiva Estate o a Las Nubes— | **fuera de alcance, y es diseño propio.** Medido: un lote nace con `locationId` del beneficio donde se arma (`lotesDeBeneficio.ts:99`); no se encontró una operación que lo traslade entre beneficios. No se afirma que no exista: se afirma que no es esto |

**Y una opción que se descartó de raíz:** agrupar por organización. Daniel: «no son la misma
organización, les colaboro yo en procesos especiales post cosecha». El enlace finca→beneficio **no
se puede derivar** del árbol ni de la organización — hay que declararlo.

## 2. Las decisiones de Daniel (2026-09-30)

| pregunta | decisión |
|---|---|
| qué entregas ve un beneficio | **las de las fincas enlazadas a él.** Cada finca declara su beneficio de destino **una vez**, en su propia ficha, no en cada jornada |
| si mañana cambia ese enlace | **instantánea.** La jornada copia el destino al abrirse y no cambia después; cambiar el enlace afecta a las jornadas **nuevas** |
| qué beneficios usan el software | **Las Nubes y Cafelino.** Se empieza **sólo con Las Nubes**; Cafelino hay que registrarlo |
| Jaramillo y Artillería | **no llevan beneficio.** Su cereza se compra y se traslada, y entra por el camino del proveedor |
| a medio plazo | «todas las fincas en Boquete las proceso inicialmente en beneficio de Cafelino y de ahí las proceso y/o las envío a Kiva Estate o a Las Nubes» — puede cambiar |

## 3. Lo que ya existe y se reutiliza — no se reescribe

| qué | dónde | qué da |
|---|---|---|
| el encaminamiento actual | `pendientesDeBeneficio` (`recepcionesDeCereza.ts:252`), `where: { estado: "enviada", jornada: { beneficioId }, … }` | la lista de entregas pendientes **de un beneficio**. Es la clave de encaminamiento, y por eso el campo no se puede volver opcional sin más: **vaciaría la pantalla del operador** |
| la comprobación al recibir | `recibirCereza`, que bloquea la jornada `FOR UPDATE` y compara su destino (`:117-118`) | que una entrega no se reciba en un beneficio que no es el suyo |
| el permiso de la finca | `exigeGestionarFinca` (`jornadasDeCosecha.ts:32`) | quien gestiona la finca; ya lo usa `abrirJornada` |
| la corrección del destino | `cambiarDestinoDeJornada` (`:202`) y `beneficiosDeDestino` | **sobreviven**, con otro papel: ver §4.3 |
| la regla de cuándo se puede cambiar | spec de recepción §3.1 | «sólo mientras ninguna entrega de la jornada tenga recepción vigente». Después queda fijo, porque una recepción anulada devuelve su entrega a pendiente **en el mismo** beneficio |

**Y el coste de migrar es cero, medido:** hoy hay **0 jornadas, 0 entregas y 0 recepciones** en la
copia local, y **un** solo beneficio. Nada real ha pasado por este camino todavía.

## 4. Diseño

### 4.1 La finca declara su destino

- `Location` gana **`beneficioDestinoId`**, una auto-relación nueva —`@relation("FincaDestino")`,
  distinta de la `LocationHierarchy` que ya existe— **anulable**, que sólo tiene sentido en un
  `site`. Apunta a una `Location` de tipo `beneficio`.
- **Anulable a propósito, y no es un hueco:** Jaramillo y Artillería no llevan destino porque su
  cereza no viaja por una jornada. Un `NOT NULL` obligaría a inventarles uno.
- Lo declara **quien gestiona la finca** —`exigeGestionarFinca`, el mismo permiso que ya exige
  abrir una jornada ahí— y **además** tiene que poder ver el beneficio elegido, con la misma
  pregunta que hace hoy `exigeBeneficioDeDestino`. Esto **no** relaja el permiso: lo **mueve** de
  cada jornada a una sola declaración.
- Con `AuditEvent`, porque cambia a dónde va la cereza de una finca entera.

**Nombre pendiente de confirmar.** `docs/beneficio/03_public_api.md` es el contrato autoritativo y
da **cero** menciones de «destino» (control: «beneficio» da 1). Según el `CLAUDE.md` del repo, un
nombre que el contrato no declara **se pregunta, no se inventa**: `beneficioDestinoId` es la
propuesta, y su confirmación es de Daniel.

### 4.2 La jornada copia el destino, y el cosechador no lo elige

- `AbrirJornadaInput` **pierde `beneficioId`**. `abrirJornada` lo **resuelve de la finca** y lo
  **copia** en la jornada.
- **Instantánea, no referencia viva.** Es el precedente que la casa ya tiene escrito —
  `20_modelo_ciclo_completo.md`: «una muestra guarda una **instantánea** del estado del lote al
  momento de extraerla, no una referencia viva». Con referencia viva, cambiar el enlace de una
  finca **movería entregas históricas de pantalla** y una recepción anulada podría volver a un
  beneficio distinto del que la recibió, que es justo lo que §3.1 prohíbe.
- **`exigeBeneficioDeDestino` desaparece de `abrirJornada`.** Quien abre la jornada ya no necesita
  permiso **en el beneficio** — que es la mitad de la contradicción de ADR-194 que nadie había
  nombrado: no es sólo que el cosechador eligiera, es que **necesitaba permiso allí**.
- **Si la finca no tiene destino declarado**, la jornada **se abre igual** y sus entregas **no
  salen como pendientes en ningún beneficio** — que es exactamente lo que §3.1 ya dice de las
  jornadas sin destino. **No se bloquea**: bloquear devolvería al cosechador al negocio del
  destino, que es lo que la decisión quita. La ficha de la finca lo dice en pantalla, y la jornada
  también, con palabras y no con un cero.

### 4.3 `cambiarDestinoDeJornada` sobrevive como corrección

Ya no es la elección del cosechador: es el arreglo de una jornada concreta que nació con el enlace
equivocado, o de una jornada sin destino. **Conserva sus dos reglas tal cual** —`AuditEvent`, y
sólo mientras ninguna entrega tenga recepción vigente— y gana una tercera: **también sirve para
poner un destino donde no había**, que es el caso de la finca sin enlace.

`beneficiosDeDestino` se queda, con dos usos: el selector de la **ficha de la finca** (§4.1) y el
de la corrección.

### 4.4 Lo que NO cambia

- `pendientesDeBeneficio` sigue filtrando por `jornada: { beneficioId }`. **La clave de encaminamiento
  es la misma**; lo que cambia es **quién la puso ahí**.
- `recibirCereza` sigue bloqueando la jornada y comparando su destino.
- El camino del proveedor no se toca.
- El esquema **no** deja de admitir `beneficio_id` nulo en la jornada: ya era anulable.

## 5. Lo que este diseño encontró y no arregla — se señala

- **Hay un `site` llamado «Beneficio Las Nubes» y un `beneficio` llamado «Las Nubes»**, los dos
  bajo Finca Rosina. Dos representaciones de la misma cosa, o una de ellas sobra. No se toca aquí,
  pero el selector de §4.1 sólo ofrecerá el de tipo `beneficio`, así que la confusión se ve.
- **Cafelino no tiene beneficio registrado.** Es trabajo de Daniel en pantalla, no de código, y
  hasta entonces sus fincas no pueden enlazarse a él.
- **Mover un lote entre beneficios** no está en el modelo (§1). Mientras no exista, «Cafelino
  procesa y manda a Kiva Estate» no se puede registrar.

## 6. Pruebas

**Con base (grupo `base-sembrada`), y el usuario acotado a SU sitio — nunca Platform Admin:**

- una finca con destino declarado → la jornada nace con ese `beneficioId` **copiado**;
- **cambiar el destino de la finca después NO mueve la jornada ya abierta** — el control es leer su
  `beneficioId` antes y después, y que sea el mismo. Es la prueba de la instantánea;
- una finca **sin** destino → la jornada se abre, y `pendientesDeBeneficio` de **cualquier** beneficio
  **no** la trae. El control positivo es la misma consulta con la finca enlazada, que sí la trae;
- quien abre la jornada **no** necesita permiso en el beneficio: una cuenta con
  `exigeGestionarFinca` sobre la finca y **sin** acceso al beneficio abre la jornada igual. Es la
  mitad de la contradicción de ADR-194, y sin esta prueba no queda cerrada;
- declarar el destino **exige** ver el beneficio: la misma cuenta **no** puede enlazar la finca a un
  beneficio que no alcanza;
- `cambiarDestinoDeJornada` pone destino donde no había, y **falla** si alguna entrega tiene
  recepción vigente;
- una recepción anulada devuelve la entrega a pendiente **en el mismo** beneficio.

**Flip-tests, contra el commit, con las tres cosas de la casa** —sha antes y después, que
**compile**, y qué prueba cae **por su nombre**—:

1. resolver el destino **en vivo** desde la finca en vez de copiarlo → debe caer la prueba de la
   instantánea;
2. bloquear la apertura de una jornada cuya finca no tiene destino → debe caer la prueba de la
   finca sin enlace;
3. volver a exigir `can(view, lot)` sobre el beneficio en `abrirJornada` → debe caer la prueba de
   la cuenta sin acceso al beneficio;
4. dejar enlazar una finca a un beneficio que no se alcanza → debe caer su prueba.

**Compuerta por tarea:** `npm run build` en toda tarea que toque TypeScript —vitest **no** comprueba
tipos—, y al final `npm run verify` y `bash scripts/ci.sh`. Las pruebas nuevas que necesiten base
van al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`, o `ci.sh` las corre sin base.

**Las dos rúbricas pesan igual que el funcional.** `21_rubrica_veracidad.md`: la ficha de la finca
tiene que poder sostener «esta cereza va a Las Nubes» hasta el enlace que lo dice.
`22_rubrica_pedagogica.md`: una finca sin destino no dice «0 entregas pendientes», dice **qué
falta** y **quién lo arregla**.

## 7. Orden y dependencias

1. **Este diseño**, PR sólo de documentación. Archivo nuevo; no choca con nadie.
2. **Confirmar el nombre** `beneficioDestinoId` contra `03_public_api.md` — decisión de Daniel.
3. **El campo y su declaración** en la ficha de la finca, con su migración y su `AuditEvent`.
4. **`abrirJornada`** deja de pedir el destino y lo copia; `exigeBeneficioDeDestino` sale de ahí.
5. **La corrección** (`cambiarDestinoDeJornada`) y los textos de «sin destino».
6. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Mover un lote entre beneficios · registrar el beneficio de Cafelino · la eficiencia de cosecha por
selección post-flotado (ADR-194 §3, que no existe) · el `site` «Beneficio Las Nubes» duplicado ·
los pedidos, cuyo `beneficio_id` **sí** es obligatorio y que este diseño no toca.
