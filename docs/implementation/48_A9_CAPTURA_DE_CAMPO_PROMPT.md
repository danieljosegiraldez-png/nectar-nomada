# A9 — Captura de campo en el apiario: prompt de alcance

Mismo género que `22_APIARY_V1_SCOPING_PROMPT.md`: esto **no es un ticket**. Es
una entrada del dueño más un inventario de lo que este repositorio ya tiene
escrito, para que decidas mejor. Lo que se pide de vuelta es un **informe de
alcance** con el rigor de `22_APIARY_V1_SCOPING_REPORT.md`.

**Ninguna propuesta de los anexos es una decisión tomada.** Los anexos son
material del dueño, redactado por un asistente que leyó el esquema y los
reportes de campo pero que **no había leído todo `docs/architecture/` cuando los
escribió**. El Anexo A corrige varias de esas suposiciones. Donde el repositorio
ya tenga mejor respuesta que los anexos, **contradícelos y dilo con nombre y
línea** — eso es lo que se está pidiendo, no cortesía.

**Contexto obligatorio, en este orden:**

1. `48_A9_ANEXO_A_INVENTARIO_DE_LO_QUE_YA_EXISTE.md` — **empieza aquí.** Doce
   conceptos, con lo que el repositorio ya dice de cada uno. Está para evitar
   que se construya por tercera vez algo que ya existe dos veces.
2. `22_APIARY_V1_SCOPING_REPORT.md` §1a, §4, §5, §7.
3. `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §6 y §7, y `43_P2_OPERATOR_CORE.md`.
4. `docs/architecture/DOMAIN_MODEL.md` §4 — apiario, con sus `[DEFERRED]`.
5. `docs/architecture/OFFLINE_FIELD_CAPABILITY.md`, `25_`, `28_A5.5`.
6. `docs/architecture/EXTERNAL_DATA_ARCHITECTURE.md` y
   `docs/architecture/GUIDED_FIELD_STUDY_TOOL.md`.
7. `CLAUDE.md` §19, §34, §35, §40, §41, §46, §47.
8. Anexos B, C y D de este prompt — **material de entrada, no especificación**.

Referencia visual, no normativa:
<https://claude.ai/code/artifact/83de3da0-794c-43bd-a715-0816b4f53407>.
Los registros de Kiva Estate · Toabré que muestra son reales (visitas de junio,
julio y septiembre de 2026); los otros tres sitios llevan valores de muestra
marcados como tales.

---

## 1. El hecho que motiva esto

La visita del 2 de septiembre de 2026 a Kiva Estate, Toabré, produjo: el
hallazgo de que las colonias de ambos sitios se habían ausentado —no muertas,
no atacadas—, la observación de que las hormigas entraron a las cajas vacías
unas dos semanas después y no antes, la instalación de tres núcleos de Parita
con reina fecundada, una decisión de campo sobre Finca 1 (no reponer hasta
podar el flanco este o reubicar el apiario), dos sets fotográficos y un costo
de viaje.

De todo eso, el sistema guardó la instalación de las colonias.

Ese es el problema, y tiene dos mitades que conviene no confundir:

1. **Lo que no tiene dónde guardarse.** La visita como hecho, el conteo de
   colonias del sitio, la condición del sitio, el costo, la interpretación.
2. **Lo que sí se podría guardar pero compite con lo primero.** Si el
   formulario pide interpretación estando de pie al sol, con guantes y sin
   señal, lo que se obtiene no es un dato mejor: es un formulario que nadie
   llena.

---

## 2. Lo que pide el dueño, en sus palabras

- En campo entra **sólo** la lista de chequeo, lo que exige el protocolo de la
  actividad, y las observaciones o acciones tomadas durante ella: alimentación,
  cosecha, tratamiento fitosanitario, manejo, lo que sea.
- El trabajo **se termina fuera del campo** — en el teléfono, en el carro, o en
  la laptop en la casa — sobre el mismo registro, sin volver a teclear.
- De ahí sale **el reporte**.
- Como usuario apicultor quiere ver **sus sitios**: última fecha de inspección,
  vitales configurables, mapa cuando hay más de uno, entrada directa cuando hay
  uno solo, y agrupación cuando dos están en la misma área.
- Al abrir un sitio: **historial, vistas de salud por línea de tiempo,
  biblioteca de imágenes, videos y reportes.**
- Y una revisión honesta de **qué datos conviene acumular** para manejar mejor
  el proyecto, no de qué campos se pueden agregar.

Su propia regla de corte, que vale la pena conservar como criterio y no como
mandato: *si se puede escribir en el carro, no va en el campo.*

---

## 3. Lo que ya existe — resumen

Detalle y citas en el Anexo A. Esta tabla existe para una sola cosa: que
ninguna decisión de §4 se tome creyendo que hay que empezar de cero.

| Concepto | Estado real |
|---|---|
| Jornada / sesión de campo | `FieldSession` + `FieldEvent` **construidos** (P2), diseñados para café; sin FK a `Inspection`, `ColonyEvent`, `Hive` ni `Colony` |
| Cola offline y borradores | **construida** para apiario (`clientDraftId`, A0/A5, service worker A5.5) |
| Motor de protocolos versionados | existe **dos veces**: Research OS (`Protocol`/`ProtocolVersion`/`ProtocolVariable`) y sensorial (`SensoryProtocolVersion`) |
| Rastro de cambios | `AuditEvent` **construido**, con `before`/`after`/`reason`/`sourceInterface` |
| Medios | `Asset` **construido**, con FK nullable a colmena, colonia, inspección y evento; `AssetAnnotation` está identificado como faltante en el audit del café (P2), no sólo en apiario |
| Floración | `SpecimenObservation` ya tiene `bloom_start` / `bloom_peak` / `bloom_end`; `Bloom/Flora` está **`[DEFERRED]`** para apiario en `DOMAIN_MODEL.md` §4 |
| Clima externo | proveedores **ya decididos** en `EXTERNAL_DATA_ARCHITECTURE.md`: Open-Meteo y NASA POWER como CORE, esta última descrita como hecha para agroclimatología |
| NDVI / satélite | catalogado y **clasificado deliberadamente** SEC/DEMAND/NOT-NOW; no es un olvido |
| Reina, genealogía de división | **`[DEFERRED]` por decisión documentada** en `DOMAIN_MODEL.md` §4 y en el reporte de alcance de agosto, con su razonamiento |
| Polinización | fuera de v1 **con argumento explícito** en agosto |
| Tableros | `CLAUDE.md` §47 sólo dice «tableros por rol, no uno universal». **No hay documento de tableros.** Es de lo poco genuinamente sin dirección |
| Notificaciones | §34 lista categorías y dice «en-app primero»; sin umbrales |

**Lo que esto cambia respecto de la versión anterior de estos anexos:** casi
nada de lo que parecía faltar falta por olvido. Falta por decisión, o falta
conexión entre piezas que ya existen. Un informe que trate esto como un vacío
va a construir de más.

---

## 4. Las decisiones abiertas

Esto es lo que hay que decidir, y lo que el informe tiene que responder. Cada
una está planteada con sus dos lados **a propósito**: si te parece que la
pregunta está mal hecha, dilo y reformúlala.

### D1 — ¿La visita es `FieldSession` extendida al apiario, o una entidad nueva?

`FieldSession`/`FieldEvent` ya agrupan «Kenis fue a Las Nubes bloque 3 el
martes e hizo estas once cosas». Es literalmente la forma del problema. Pero
`FieldEvent` apunta hoy a `Measurement`, `QuantityEvent`, `SpecimenObservation`,
`Asset`, `HarvestEvent` y `LotTransformation` — ninguno del apiario.

- **A favor de extender:** una sola noción de jornada en toda la plataforma;
  el costeo, el rastro de operadores y la sincronización se resuelven una vez;
  el café y el apiario comparten la misma tabla de esfuerzo.
- **A favor de entidad nueva:** una visita de apiario carga hechos que una
  jornada de café no tiene —conteo de colonias vivas del sitio, condición del
  emplazamiento, compromiso con un cliente— y meterlos en `FieldSession` la
  vuelve una tabla de dos dominios con la mitad de las columnas nulas siempre.
- **Qué mirar:** `COFFEE_FIELD_OS_AUDIT.md` §6, `43_P2_OPERATOR_CORE.md` §3–4,
  y si P2 dejó ganchos de extensión explícitos o cerró el diseño al café.
- **No se decide aquí:** la forma de la pantalla. Primero la entidad.

### D2 — ¿Dónde vive la lista de chequeo?

Tres caminos, no dos: columnas nuevas en `Inspection`; protocolo versionado
**reutilizando** el motor de Research OS; o un motor de protocolo de campo
nuevo.

- El argumento por el que el dueño quiere versionado es concreto: la lista
  cambia por actividad, cambia por cliente —lo que Kiva exige bajo contrato de
  polinización no es lo que se registra en Los Asientos— y cambiar la lista
  después **no puede reinterpretar lo ya respondido**.
- El argumento en contra de un motor nuevo es igual de concreto: ya hay dos
  motores de protocolo en este repositorio. Un tercero es deuda.
- **Qué mirar:** si `ProtocolVariable` / `VariableCatalog` puede describir una
  casilla de campo sin deformarse, y qué cuesta que un protocolo de Research OS
  se ejecute contra una `Colony` en vez de un `Lot`.

### D3 — ¿La enmienda es entidad nueva, o `AuditEvent` mostrado en pantalla?

`AuditEvent` ya guarda `before`, `after`, `reason` y `sourceInterface`. La
exigencia real del dueño no es una tabla: es que **lo capturado frente a la caja
no se sobreescriba en silencio** cuando alguien lo completa en la casa.

- **Qué mirar:** si `AuditEvent` se escribe hoy en las acciones de apiario, y
  si se puede leer por entidad a costo razonable. Si la respuesta es sí a las
  dos, la entidad nueva sobra y el trabajo es de pantalla.

### D4 — ¿«Cierre» es un estado nuevo, o el borrador que ya existe llevado más lejos?

`clientDraftId` y la cola offline ya distinguen «capturado en el teléfono» de
«sincronizado». Lo que no existe es «sincronizado pero incompleto».

- **La pregunta real:** ¿es un estado de la visita (`closedAt`), un estado por
  registro, o una vista derivada —«esta visita tiene campos de etapa *cierre*
  sin responder»— que no necesita columna ninguna?
- La tercera opción es la más barata y puede ser la correcta. Evalúala en serio
  antes de descartarla.

### D5 — ¿La brecha de medios se resuelve para el apiario, o se resuelve una vez?

`Asset` ya puede colgar de una colmena, una colonia, una inspección o un evento.
Lo que falta es lo que el audit del café ya llamó `AssetAnnotation` y marcó
faltante: pie de foto, qué afirma, quién aparece. Los 18 archivos del 2 de
septiembre no están huérfanos de padre: están huérfanos de significado.

- **Qué mirar:** si conviene hacer `AssetAnnotation` una vez, para los dos
  dominios, en vez de resolverlo dentro del alcance del apiario.

### D6 — ¿Qué va antes: la visita, o reina y polinización?

Los tres estaban aplazados con argumento. Dos de esos argumentos envejecieron
este año y conviene decir cuánto:

- **Reina y genealogía.** Desde septiembre Toabré tiene dos orígenes genéticos
  —Santa Fe, Veraguas en el pie original; Parita, Chitré en los tres núcleos— y
  el sistema no puede sostener la comparación. Cada colonia que se instale sin
  ficha de reina agranda el hueco.
- **Polinización.** 17 ha comprometidas a 4–6 colmenas/ha son 68–102 colonias
  contra las 3 que hay. Es una tabla y un cociente, y es el único número que
  convierte la conversación con el cliente en algo que no sea una impresión.
- **La visita** es prerrequisito de casi todo lo demás, incluido el reporte.

**No des por hecho el orden que sugieren los anexos.** Si el informe concluye
que polinización va primero porque es barata y desbloquea la conversación
comercial, ese es un resultado legítimo.

### D7 — ¿Cómo se entrega el reporte al cliente, y cómo se mantiene estable?

Decidido por el dueño el 2026-09-07: **descargable como PDF, sin almacenarlo
previamente.** Página web con enlace, y un botón que genera el PDF del contenido
según plantilla definida.

Lo que eso deja abierto, y es lo que hay que resolver:

- **El archivo no se guarda, pero el contenido sí se congela.** Un reporte
  emitido es inmutable (Anexo C §3.2): si el PDF se renderiza desde los datos
  vivos, el documento que el cliente descargue en marzo y el que descargue en
  septiembre son distintos con el mismo número. La propuesta es renderizar
  **desde `contentSnapshot`**, no desde la base. Evalúala.
- **Cómo se renderiza.** Tres caminos: hoja de estilo de impresión
  (`@media print` + `window.print()`), renderizado en servidor con navegador
  headless, o una librería de PDF con plantilla propia. **No hay ninguna
  librería de PDF en el repositorio hoy** — cualquiera de las dos últimas es
  dependencia nueva y hay que nombrarla como tal.
  El argumento a favor de la primera: la página web *es* la plantilla, una sola
  que mantener. Una plantilla de PDF aparte se separa de la web con cada cambio.
  El argumento en contra: control de saltos de página y consistencia entre
  navegadores. Pésalo.
- **Cómo abre el enlace el cliente.** Luis Sotillo no se va a crear una cuenta.
  ¿Membresía de organización con acceso real a su proyecto, o enlace firmado con
  caducidad —el mismo patrón que ya se usa para medios en R2—? El segundo es más
  realista para un cliente de finca; el primero es mejor si algún día Kiva debe
  ver su histórico. RBAC.md manda.

### D8 — ¿Qué tecnología del teléfono se aprovecha en campo, y cuál es adorno?

El dueño confirmó que quien captura será **alguien entrenado**, y pidió que sea
intuitivo y eficiente aprovechando imagen, audio, video, GPS y AI «de la manera
más práctica y complementaria». Persona entrenada permite pedir datos técnicos
reales; no arregla guantes, sol ni velo.

Evalúa cada uno por lo que ahorra, no por lo que suena bien:

- **Identificación de la caja sin navegar.** QR o NFC en cada colmena que abra
  directo la página de esa colonia. Probablemente ahorra más toques que todo lo
  demás junto, funciona sin señal y cuesta calcomanías. **El GPS no sirve para
  esto**: distingue el sitio, no dos cajas a tres metros.
- **GPS para lo que sí sirve:** seleccionar el sitio al llegar, sellar la
  coordenada de la visita, registrar la posición al colocar o mover una caja.
  `Location` ya tiene latitud, longitud y punto PostGIS.
- **Audio.** Es la única entrada que funciona con guantes y velo. Disciplina
  propuesta: **el audio es la evidencia, la transcripción es derivada, y los
  campos que la AI extraiga son una propuesta que un humano confirma al
  cerrar.** El precedente ya está sentado en `GUIDED_FIELD_STUDY_TOOL.md`
  —identificación de especies asistida por AI, pendiente de confirmación
  humana— y el modelo de procedencia ya distingue las clases.
- **Foto tomada desde dentro de la casilla que documenta**, ligada a ese ítem
  automáticamente. Resuelve el problema de las fotos huérfanas en la captura y
  no en el cierre. Video: pesa, y la cola offline lo sufre.
- **AI que vale:** transcribir la nota de voz y proponer campos; redactar el
  borrador del reporte desde los registros al cerrar; revisar coherencia al
  cerrar («reservas nulas y ninguna alimentación registrada»).
  **AI que no vale todavía:** diagnosticar enfermedad por foto, contar varroa
  por imagen. En campo un falso negativo cuesta una colonia.

**Límite de esta decisión:** D8 evalúa qué puede hacer **hoy** el cliente web
con service worker. Donde tope con una pared real —captura de audio larga sin
señal, cola de medios pesada, cámara en gama baja— **dilo y entrégaselo a
`47_P5`**, no lo conviertas en una decisión de cliente nativo por la puerta de
atrás.

### D9 — ¿Qué es «temporada»? (inconsistencia del Anexo C)

El Anexo C §1.2 propone la alerta «sin visita en 45 días **en temporada**». El
sistema no sabe qué es temporada. No hay calendario de floración, ni de época
seca y lluviosa, ni por región, en ningún lado del esquema.

Sin eso, la mitad de los umbrales del Anexo C no se pueden evaluar: la cadencia
de visita, la ventana de escasez que obliga a alimentar y la ventana de cosecha
son todas estacionales, y en Panamá no son iguales en Veraguas, Los Santos,
Coclé y Cerro Azul.

- **Lo barato:** un calendario por región y cultivo, declarado por el dueño, que
  los umbrales consulten. No es sensado ni derivado: es conocimiento suyo
  escrito una vez.
- **Lo que ya existe cerca:** `SpecimenObservation` con `bloom_start`,
  `bloom_peak`, `bloom_end` (Anexo A §8) permite *observar* floración. Un
  calendario declarado y una floración observada no son lo mismo, y conviene
  no confundirlos: uno predice, el otro registra.
- **Qué decidir:** si el calendario entra en este alcance, si los umbrales se
  quedan sin estacionalidad por ahora y se dice, o si se aplaza con su
  consecuencia escrita.

### D10 — Canal de aviso: elegible por persona, y un registro que no se elige

Decidido por el dueño el 2026-09-07, y son **dos cosas distintas** que conviene
no colapsar en una:

**a) La entrega es preferencia de cada persona.** Cada usuario elige por dónde
quiere que le lleguen sus avisos: WhatsApp, correo electrónico, la app en el
celular, o Google Calendar. `CLAUDE.md` §34 ya lo anticipa —«in-app primero, la
arquitectura debe permitir correo, push y mensajería después»—, así que esto es
un modelo de preferencias más adaptadores por canal, no una decisión de fondo.

Nota sobre Google Calendar: no es un canal de alerta, es un canal de **fecha
comprometida**. «Próxima visita a Toabré el 22 de septiembre» pertenece a un
calendario; «el alimento vence en dos días» no. Trátalos distinto o el
calendario se llena de ruido y deja de usarse.

**b) El registro no es elegible.** Independientemente de lo que cada quien
escoja para su gestión, **toda acción y toda alerta se registran en el WhatsApp
de Néctar Nómada**, el número ya registrado, ahora y de forma indefinida. Eso no
es una preferencia: es una bitácora en el teléfono del dueño.

Lo que hay que resolver, y no es trivial:

- **Bitácora, no fuente.** El hilo de WhatsApp es un **espejo** del registro,
  nunca la fuente de verdad. Si algo existe sólo en el chat, no existe. Dejarlo
  escrito evita que en seis meses el chat sea el sistema real y la base una
  copia incompleta — que es exactamente el problema del que se está saliendo.
- **Volumen.** «Toda acción» en un sitio de quince cajas son decenas de mensajes
  por visita. Un canal que se vuelve ilegible deja de leerse, y entonces no
  registra nada útil. La forma que probablemente cumple el requisito sin
  romperlo: **alertas al instante, acciones en resumen** —uno al cerrar la
  visita, uno diario— con todo el detalle enlazado. Propón lo que consideres,
  pero mide el costo de la opción literal antes de elegirla.
- **Realidad de la API.** WhatsApp Business (Meta Cloud API) cobra por
  conversación, y los mensajes iniciados por el negocio fuera de la ventana de
  24 horas requieren **plantilla aprobada**. Una bitácora automática es
  exactamente ese caso. Hay que nombrar el costo y el trámite, no descubrirlos
  después. `INTEGRATIONS.md` y `EXTERNAL_DATA_ARCHITECTURE.md` marcan la pauta
  de cómo se clasifica una integración nueva en este proyecto.
- **Qué va en el mensaje.** Un enlace profundo al registro pesa menos que el
  contenido y no saca datos del sistema. Para el reporte al cliente, el enlace
  es además la entrega (**D7**).
- **Qué NO va por ahí.** Datos personales de terceros y cualquier cosa que
  RBAC no dejaría ver a quien lee ese teléfono. El canal no puede ser una
  puerta lateral alrededor de los ámbitos.

**Fuera de alcance de D10:** construir los cuatro adaptadores. Lo que se pide es
el modelo de preferencias, la separación entre entrega y bitácora, y el
veredicto sobre volumen y costo de WhatsApp.

---

## 5. Cómo se ve un buen informe

- **Contradice los anexos** donde el repositorio tenga mejor respuesta, con
  archivo y línea. Se agradece más que el acuerdo.
- **Cada verdict con su consecuencia si se equivoca**, en la forma que ya usa
  `22_APIARY_V1_SCOPING_REPORT.md` §5: qué se pierde, y si es recuperable.
- **Distingue cuatro estados**, nunca dos: no existe / existe en documento /
  existe en código / existe y no se está usando. La versión anterior de estos
  anexos falló exactamente ahí.
- **Nada que no cambie una decisión.** Un campo propuesto sin la decisión que
  alimenta no entra.
- **Borrador de enmienda de ADR** donde corresponda, sin agregarlo a
  `DECISIONS.md`.
- **Desglose de tickets** con dependencias, no una lista de deseos.
- Español. §41.

---

## 6. Prueba de aceptación propuesta — critícala

Se propone ésta, y se pide explícitamente que la evalúes en vez de heredarla:

> La visita del 2 de septiembre de 2026 a Kiva Estate · Toabré se reconstruye
> entera desde la base —quién fue, qué se vio en cada caja, qué se hizo,
> cuántas colonias quedaron vivas, cuánto costó el viaje, qué se concluyó y qué
> se recomendó— y el reporte al cliente sale de ahí sin que nadie escriba una
> frase dos veces.

Es una prueba **retrospectiva**: se puede evaluar contra una visita que ya
ocurrió, sin esperar a la próxima temporada. Si te parece que una prueba
prospectiva —«la visita de octubre se captura entera en campo por Chayanne, sin
señal, sin que Daniel esté»— dice más sobre si el diseño sirve, propónla y
argumenta el cambio.

---

## 7. Lo que este alcance no debe expandir

- **No rediseñar el formulario de inspección de un toque.** §4 del reporte de
  agosto lo resolvió y la razón sigue en pie.
- **No tocar la separación `Inspection` / `ColonyEvent`.** Está protegida a
  nivel de base de datos por una buena razón.
- **No proponer sensores en colmena.** No se pidieron y no hay hardware.
- **No entrar en cliente nativo.** Tiene su propio hilo en `47_P5`, con su
  propio prerrequisito sin resolver.
- **No inventar datos de los otros tres apiarios.** Santa Fe, Los Asientos y
  Finca Rosina tienen identidad, región y número de colmenas reales; todo lo
  demás que aparece en el prototipo es muestra y está marcado como tal.
