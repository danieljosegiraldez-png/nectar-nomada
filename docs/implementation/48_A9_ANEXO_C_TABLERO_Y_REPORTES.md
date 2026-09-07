# A9 · Anexo C — Tablero y reportes (entrada del dueño)

> **Qué es esto.** Propuesta del dueño sobre qué mostrar y cómo calcularlo, no
> una especificación aprobada. Es, eso sí, el anexo cuya materia está menos
> escrita en el repositorio: `CLAUDE.md` §47 sólo dice «tableros por rol, no uno
> universal» y no existe un documento de tableros. Aquí el aporte del dueño
> pesa más que en los otros dos anexos — sigue siendo entrada.
>
> **Lee primero `48_A9_ANEXO_A_INVENTARIO_DE_LO_QUE_YA_EXISTE.md`**, sobre todo
> §7 y §8: los proveedores de clima ya están elegidos y la máquina de floración
> ya existe. La §4 de este anexo se escribió sin saberlo.

Qué se muestra, cómo se calcula y de qué fila sale. Anexo de
`48_A9_CAPTURA_DE_CAMPO_PROMPT.md`.

Regla que gobierna todo este anexo: **ninguna cifra sin fila detrás.** Si una
métrica no se puede derivar de registros existentes, no se muestra vacía ni se
estima: se muestra como «sin registro», que es un dato distinto de cero y más
útil que un cero falso. `/apiaries` y `/lots` ya distinguen «no hay» de «no
puedes ver»; el tablero añade la tercera: «no se ha medido».

---

## 1. Pantalla de sitios

Con más de un apiario, la entrada es el mapa. Con uno solo, la pantalla se
salta y se entra directo al sitio. Dos sitios del mismo predio —Finca 1 y
Finca 2 en Toabré— comparten pin y se separan dentro.

### 1.1 Vitales por sitio

| Vital | Cálculo | Fuente |
|---|---|---|
| Última visita | `max(ApiaryVisit.occurredAt)` del sitio | A9.1 |
| Días desde | hoy − última visita | derivado |
| Próxima visita | `nextVisitDueAt` de la última visita cerrada | A9.1, etapa cierre |
| Colonias vivas / cajas | último `coloniesAliveCount` sobre cajas activas | A9.4 |
| Alimento hasta | `max(coverageUntil)` de las alimentaciones de la última visita | Anexo A §3 |
| Última cosecha | `max(ApiaryHarvestEvent.occurredAt)` + kg | ya existe |
| Densidad de polinización | colonias vivas ÷ hectáreas comprometidas | A10 |
| Clima 7 días | temp. media, HR media, lluvia acumulada | capa externa |

Hoy, sin A9.1, la primera fila sólo se puede aproximar con un máximo sobre las
inspecciones de las colonias **que todavía existen**. En un sitio que se
ausentó por completo eso devuelve nada, justo cuando la fecha importa más. Esa
es la razón de ser del ticket.

### 1.2 Reglas de alerta

El color del borde izquierdo de cada sitio sale de la primera regla que se
cumpla, en este orden:

| Nivel | Regla | Por qué ese umbral |
|---|---|---|
| **Crítico** | pérdida de colonias sin reposición desde la última visita | es el hecho más caro y el que menos avisa |
| **Crítico** | visita programada vencida por más de 14 días | pasado ese punto la próxima visita ya no es la programada |
| **Crítico** | `coverageUntil` del alimento vencido y sin nueva alimentación | el modo de fallo exacto de Toabré entre julio y septiembre |
| **Aviso** | sin visita en 45 días en temporada | por debajo de eso, una brecha es normal; por encima, deja de serlo. **Ojo: el sistema no sabe qué es «temporada»** — no hay calendario de floración ni de época seca en ningún lado del esquema. Es la decisión **D9** del prompt, y es una inconsistencia de este anexo, no un detalle |
| **Aviso** | alimento vence en menos de 7 días | ventana para coordinar; Kiva exige avisar con 3 días de anticipación |
| **Aviso** | visita sin cerrar con más de 72 horas | un borrador viejo se cierra de memoria, no de recuerdo |
| **Aviso** | densidad de polinización bajo el objetivo en ventana de floración | A10 |

Los umbrales son parámetros por sitio, no constantes en el código. Un apiario
de producción en Los Asientos y uno de polinización bajo contrato en Toabré no
se visitan con la misma frecuencia y no deben alertar igual.

**Por dónde sale la alerta** es la decisión **D10** del prompt: canal elegible
por persona —WhatsApp, correo, app, Google Calendar— más una bitácora no
elegible al WhatsApp de Néctar Nómada. Una alerta que nadie ve no es una
alerta, así que el umbral y el canal se deciden juntos, no por separado.

---

## 2. Tablero del sitio

Orden fijo: primero lo que exige acción, después la serie, al final el archivo.

1. **Banda de vitales** — colonias vivas, déficit de polinización, última
   visita, alimentación, origen del pie, clima. Estado codificado en fondo y no
   sólo en número.
2. **Sitios dentro del predio** — cuando el predio tiene más de uno. Finca 1 y
   Finca 2 se comportan al revés estando a metros: dosel cerrado y húmedo con
   moho contra abierto y soleado. Esa diferencia explica una decisión de campo y
   tiene que verse junta.
3. **Colonias vivas en el año** — una serie, un conteo por visita, **sin
   interpolar**. El tramo sin dato se dibuja como ausencia de dato y se rotula
   como tal. En Toabré ese tramo son seis meses entre diciembre y junio: la
   recta punteada no es una estimación, es lo que no se midió.
4. **Historial de visitas** — visitas, no inspecciones sueltas.
5. **Colmenas** — cajas ocupadas y vacías distinguibles de un vistazo.
6. **Medios** — agregados de colmena, colonia, inspección y evento, con el
   mismo patrón que `/lots/[id]`.

### 2.1 Series que valen la pena

| Serie | Eje | Qué contesta |
|---|---|---|
| Colonias vivas | por visita | supervivencia; la curva que ninguna nota suelta reconstruye |
| Reservas de alimento | por inspección, ordinal | escasez de néctar antes de que sea hambre |
| Infestación de varroa | por conteo | umbral de tratamiento y si el tratamiento sirvió |
| Cuadros cubiertos | por inspección | fuerza de la colonia; lo que se vende en polinización |
| Cosecha por sitio | por temporada | terruño y rendimiento comparables entre regiones |
| Intervalo entre visitas | por sitio | si el plan de manejo se cumple o sólo existe en papel |

Una serie por gráfico. Nunca dos escalas en un mismo eje: si hay que comparar
reservas con lluvia, son dos gráficos alineados en el tiempo, no uno con dos
ejes.

---

## 3. Reporte de visita

Es el entregable al cliente y el cierre del ciclo. Kiva Estate lo tiene como
pauta acordada: **reporte técnico al cierre de cada visita**.

### 3.1 Estructura

| Sección | De dónde sale | Regla |
|---|---|---|
| Encabezado | sitio, fecha, operadores, propósito | de la visita |
| Resumen | conteo de colonias, cambios desde la visita anterior | derivado, no escrito |
| Por colmena | resultado, hallazgos, acciones | de inspecciones y eventos |
| Acciones ejecutadas | alimentación, tratamiento, cosecha, montaje | de los eventos, con cantidades |
| Condición del sitio | la línea de campo más lo del cierre | campo + cierre |
| Hallazgo principal | interpretación del cierre | marcado como interpretación, con autor |
| Recomendación | del cierre | lo que el cliente tiene que decidir |
| Próxima visita | fecha y alcance | de `nextVisitDueAt` |
| Costos | viáticos, materiales | del cierre; sólo si el contrato lo pide |
| Evidencia | fotos ligadas | con pie de foto real |

### 3.2 Reglas

- **Un dato que falta se nombra.** «No se contaron colonias en Finca 1» es
  información para el cliente y para la próxima visita. Rellenar el hueco con
  una frase es peor que dejarlo.
- **Observación e interpretación se distinguen en el propio documento.** Lo que
  se vio y lo que se concluye no se mezclan en el mismo párrafo. El proyecto ya
  hace esta distinción a nivel de dato; el reporte la hereda.
- **Un reporte emitido es inmutable.** Si el dato cambia, se emite versión
  nueva. **Corrección del dueño, 2026-09-07:** el archivo PDF *no* se almacena —
  se genera cuando alguien lo descarga. Lo que se congela es el
  `contentSnapshot`, y el PDF se renderiza desde ahí, nunca desde los datos
  vivos. Ver decisión **D7** del prompt, incluida la elección de mecanismo
  —hoja de impresión, navegador headless o librería— y cómo abre el enlace un
  cliente que no tiene cuenta.
- **Español primero.** Inglés cuando el cliente lo pida.

### 3.3 Otros reportes que salen casi gratis

Una vez existe la visita, estos son consultas, no desarrollos:

- **Tratamientos de la temporada** — todos los eventos de tipo tratamiento por
  sitio, con producto, lote, dosis y carencia. Hoy es un filtro sobre
  `ColonyEvent`; con objetivo y carencia como campos, es una tabla útil.
- **Consumo de alimento por sitio** — cuánto, cuándo y cuánto costó. Contesta
  si un sitio se sostiene.
- **Costo por visita y por colonia mantenida** — viáticos más materiales sobre
  colonias vivas. Es el número que convierte «entrenar a alguien residente» de
  propuesta recurrente en cálculo.
- **Cumplimiento del plan** — visitas hechas contra visitas comprometidas.

---

## 4. Capa externa: clima y satélite

Se construye **después** de A9.6. Su valor está en ponerla al lado de una serie
de colonias que todavía no existe.

### 4.1 Qué traer — el proveedor ya está elegido

`EXTERNAL_DATA_ARCHITECTURE.md` ya clasificó **Open-Meteo** y **NASA POWER**
como CORE, esta última descrita como hecha para agroclimatología y con «las
variables que el trabajo de café y apiario realmente necesita». **No hay que
volver a comparar proveedores.**

Lo que falta es la ingesta y el enganche al sitio. Por coordenada —`Location`
ya guarda latitud, longitud y punto PostGIS—, diario: temperatura máxima y
mínima, humedad relativa, lluvia acumulada, viento. Entra por el camino de
medición con fuente externa que ya existe; no es tabla nueva. `CLAUDE.md` §7
exige además que declare tipo de fuente y no mezcle procedencias.

### 4.2 Para qué sirve, concretamente

Tres usos. Ninguno es un widget de clima.

1. **Marcar los días en que la inspección era inviable**, para no leer un vacío
   de registro como negligencia.
2. **Detectar el período de escasez de néctar** que obliga a alimentar, antes
   de que las reservas lo digan.
3. **Poner lluvia y temperatura al lado de la curva de colonias** cuando se
   investigue un ausentamiento. En Toabré ya hay una hipótesis en pie —un
   frente frío de enero coincidiendo con una poda que cortó la floración— que
   sin esta capa no se puede examinar.

### 4.3 Floración y satélite — no son la misma pregunta

**Floración ya tiene máquina.** `SpecimenObservationType` incluye
`bloom_start`, `bloom_peak` y `bloom_end`, y
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` dice que eso conecta un evento de
floración con un lote de miel. Lo que pasa es que `DOMAIN_MODEL.md` §4 marca
`Bloom/Flora` como `[DEFERRED]` **para apiario**: la máquina existe y el apiario
no la usa. Engancharla es conectar, no construir — mucho más barato de lo que
esta sección suponía. Ver también `GUIDED_FIELD_STUDY_TOOL.md`, que diseña un
motor de estudio floral compartido entre apiario y café.

**Satélite y NDVI son otra cosa**, y ya están clasificados a propósito como
SEC/DEMAND/NOT-NOW en `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`: se usan sólo
cuando una necesidad concreta de índice derivado lo justifique. El compromiso de
polinización registrado sería esa justificación; sin él, no hay contra qué
comparar. Ese orden es una sugerencia, no una conclusión.

### 4.4 Honestidad de la fuente

Un dato de modelo climático no es una observación de campo. Entra con su propia
clase de procedencia y no se mezcla con lo que alguien vio parado frente a la
caja. El proyecto ya distingue clase de procedencia y calidad del dato en cada
registro; esto no es una excepción.
