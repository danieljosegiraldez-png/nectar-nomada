# La faena de colmena, y el botiquín del apiario

**Fecha:** 2026-09-17 · **Camino:** arquitectónico

Sale de un problema de campo de Daniel: *«entré al sistema y no puedo hacer una
inspección con sus opciones de tipo de inspección y respectivo formulario, igual
alimentación y especificar qué alimento, cuánto, tipo»*.

---

## 1. El diagnóstico, y no es el que él pensaba

**Casi todo existe.** Medido el 2026-09-17 contra `origin/main`:

| Lo que pedía | Estado |
|---|---|
| Inspección con reina, población, cuadros cubiertos, cría, reservas, celdas | **existe** |
| Alimentación: qué material, cuánto, en qué unidad | **existe**, con el vocabulario de sus cinco alimentos + `otro` |
| Tratamiento: producto, lote, dosis, diana, vía, fecha de retirada | **existe** |
| Conteo de varroa, cosecha, fin de colonia | **existen** |
| Período de carencia y aviso en la cosecha | **existe** — avisa y no bloquea, decisión suya del 2026-09-11 |
| **Tipo de inspección** | **NO existe**: `Inspection` sólo tiene `outcome`, con dos valores |

**Y producción está al día**, con el vocabulario de alimentación desplegado. El
permiso tampoco lo esconde: el formato de clave es correcto y un `Platform
Admin` los tiene todos — comprobado contra la base, no razonado.

**Entonces el problema no es que falte: es que no se encuentra.** La pantalla de
la colmena es **un scroll con seis formularios** y nada dice cuál toca hoy. Es el
mismo fallo que se arregló el 2026-09-17 un piso más arriba —no encontraba la
inspección porque vivía dentro de la colmena— y aquel arreglo sólo lo movió un
nivel.

**Añadir `tipo` a `Inspection` no arreglaría nada**, y por eso no se hace: los
formularios ya existen y ya son distintos entre sí. Lo que falta es la pregunta
de entrada.

---

## 2. Sección A — «¿A qué venís hoy?»

Daniel, preguntado: **va sabiendo a qué va**. Sale a alimentar, o a tratar, o a
revisar. Así que la pantalla pregunta primero.

Una fila de faenas arriba de la colmena: **revisar · alimentar · tratar · varroa
· cosechar**. Al elegir una, esa sección se abre y las demás quedan colapsadas a
un toque — **no ocultas**: el día que abre la caja y encuentra otra cosa, la
faena que no venía a hacer está a un clic.

**Lo que NO hace, y es la mitad del diseño:**

- **No añade una columna.** La faena elegida es navegación, no un dato del
  registro. Guardar «vine a alimentar» junto a la alimentación sería guardar dos
  veces lo mismo.
- **No obliga a elegir.** Quien entra sin decidir ve la pantalla de hoy.
- **No pregunta nada nuevo al operario.** La regla del dueño sigue en pie:
  preguntar lo que no hace falta es coste sin información.

---

## 3. Sección B — El botiquín: lo que el medicamento tiene y el material no

Un medicamento veterinario no es gallinaza. El `ANEXO_G` lo documenta como **la
obligación legal más firme** —Reglamento (CE) 852/2004 y (UE) 2019/6, y en la
región SENASICA, SENASA, SAG y el libro español—, con conservación de **5 años**.

Y trae un patrón que este diseño adopta: **Chile (SAG) exige DOS registros** —
ingreso de medicamentos y uso de medicamentos— porque *«permite reconciliar
comprado contra aplicado, cosa que un solo log no permite»*.

**El inventario construido el 2026-09-17 ES el primer libro.** `ConsumableLot`
con su libro mayor ya guarda lo que entró y lo que salió. Lo que falta es lo que
un medicamento tiene y un saco de gallinaza no:

### B.1 Vencimiento

`ConsumableLot.expiresAt`, anulable. **Nulo significa «no caduca o no se sabe»,
no «vigente»** — la misma regla de siempre: lo desconocido no se convierte en
bueno. Un lote vencido **no se bloquea**: se marca, porque alguien puede estar
registrando hoy una aplicación de la semana pasada.

### B.2 Las advertencias van en el MATERIAL, no en la persona

Decisión de Daniel, 2026-09-17, preguntado explícitamente porque **la alergia de
un trabajador es un dato de salud**.

`ConsumableMaterial.safetyNotes` — «contiene ácido fórmico», «usar guantes y
gafas», «no aplicar sin ventilación». La pantalla las enseña **al ir a
aplicarlo**, no enterradas en una ficha.

**Protege igual y no guarda salud de nadie:** quien sabe que es alérgico lee la
advertencia antes de tocarlo. Registrar quién es alérgico a qué exigiría
clasificación de confidencialidad propia y decidir quién puede verlo, y eso es
otra conversación — no un campo que se añade de paso.

### B.3 Dónde está y quién responde

Dos preguntas distintas: *«¿dónde está el Apivar?»* y *«¿quién lo tiene?»*.
Daniel: el equipo y el medicamento pueden estar **bajo distinto custodio o
lugar**.

`ConsumableCustody` — lote, **ubicación**, **persona responsable**, y el
intervalo `desde`/`hasta`. Copia la forma de `StorageAssignment`, que ya existe
con exactamente esa figura pero **atada al lote de café** y por eso no sirve tal
cual. Y es la misma forma que la custodia de la trilla: quién tuvo el material y
cuándo.

### B.4 El tratamiento descuenta del lote

Aplicar enlaza al `ConsumableLot` y **descuenta**, igual que la gallinaza.
Cierra el patrón de dos libros y de paso satisface la «evidencia de adquisición»
que el Reglamento (UE) 2019/6 pide.

**El enlace es OPCIONAL**, como en el consumo de materiales: quien sabe de qué
frasco salió lo pone; quien no, registra el tratamiento igual. Obligarlo
convertiría un registro legalmente exigido en un trámite que se esquiva.

---

## 4. Lo que NO se puede entregar todavía, y hay que decirlo

Daniel pidió **«un calendario con notificación si se venció o está por vencer»**.

**La notificación no se puede entregar.** `lib/notificaciones/canales.ts` es
explícito: *«aquí no se envía nada: no hay proveedor»* — existe la preferencia de
canal por persona, no el envío.

**Lo que sí se entrega**, y cubre la mitad práctica:

- El vencimiento **se ve** donde se usa: al ir a aplicar, el lote vencido sale
  marcado.
- Una **lista de lo que caduca** — vencidos y por vencer— en la pantalla de
  inventario.
- Los datos quedan listos para que el día que haya proveedor, el aviso sea
  conectar un canal y no construir el concepto.

Prometer el aviso sin proveedor sería prometer una seguridad que no ocurre, y
con medicamentos eso es peor que no prometer nada.

---

## 5. Decisiones abiertas

1. **Si un lote vencido debe poder aplicarse.** Aquí se marca y no se bloquea,
   por la doctrina de la casa — pero con medicamentos y personas alérgicas de por
   medio, Daniel puede querer lo contrario.
2. **Qué faenas van en la fila**, y en qué orden. Las cinco propuestas salen de
   los formularios que ya existen.
3. **Si la custodia aplica a todo consumible o sólo a medicamentos.** La
   gallinaza también se guarda en algún sitio.

---

## 6. Fuera de alcance

- **El envío de notificaciones** (§4).
- **Los datos de salud de los trabajadores** (§B.2).
- **El tipo de inspección como columna** — se explica en §1 por qué no.
- El inventario base, que ya está construido: material, lote, libro mayor y saldo
  derivado.
