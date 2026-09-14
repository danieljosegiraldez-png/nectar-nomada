# A9 · Anexo G — Estado del arte: qué existe, qué falta, qué obliga la ley

> **Nota de integración (2026-09-13).** Este documento llegó del paquete `A9-paquete`
> numerado como **Anexo E**, y esa letra ya estaba ocupada en el repositorio por
> *«Pantallas y formularios de captura»*, fusionado en el PR #296. Se renumeró a
> **G** —y su compañero de *«lo que cambia»* a **H**— por decisión de Daniel: el que
> ya estaba fusionado y citado conserva su letra. **No se reescribió una sola línea
> de su contenido**; sólo las referencias cruzadas entre estos dos.

> **Qué es esto.** Investigación de mercado y regulatoria levantada el 2026-09-10
> sobre software de gestión apícola, sensores en colmena y obligaciones de
> registro. Anexo de `48_A9_CAPTURA_DE_CAMPO_PROMPT.md`.
>
> **Para qué sirve.** Dos cosas. Primero, evitar construir lo que ya es estándar
> en toda la categoría —eso no diferencia, sólo cuesta—. Segundo, encontrar los
> huecos reales, que resultaron ser exactamente el sitio donde está parada esta
> operación.
>
> **Cómo leerlo.** Todo lo que dice «confirmado» sale de la página del propio
> proveedor o del instrumento legal citado. Lo que no se pudo verificar está
> marcado como tal y no se convierte en supuesto. §10 lista lo que quedó abierto.

---

## 1. Correcciones al material de partida

El punto de partida fue un resumen generado por IA de cuatro herramientas.
Cinco de sus afirmaciones no resisten verificación. Se registran porque el
mismo resumen puede volver a aparecer.

| Afirmación del resumen | Qué dice la fuente |
|---|---|
| ApiManager tiene «interfaz limpia de tipo base de datos» | No confirmado. El proveedor describe tablero, mapa y vistas de calendario/lista. Ninguna redacción suya sostiene una interfaz tipo grilla |
| BeeGuard hace «análisis de curvas de floración» | Término inventado. Lo real es seguimiento de **miellée** por peso: la tendencia de los últimos días para decidir cuándo poner alzas. La capacidad existe; el nombre no |
| Beentry da «alertas automáticas de brotes cercanos» | Aparece **una sola vez**, en la home de marketing. Ausente de su página de funciones y de ambas fichas de tienda. Sin fuente de datos, sin radio, sin lista de países. Origen checo: plausible un registro veterinario nacional, pero plausible no es verificado |
| Beentry hace «registro masivo de colmenas» | Sobredimensionado. Lo confirmado es «bulk entries for multiple hives» — carga masiva de **registros**, no alta masiva de colmenas |
| APiLOG en Google Play | La ficha `com.floatingaxeheadministries.apilog` es **otro producto** («Apiary Docket», Florida). APiLOG es sólo navegador, sin app de tienda |

Y una omisión que pesa más que las cinco correcciones juntas:

> **Ninguna de las cuatro herramientas tiene entidad de cliente ni de contrato.**
> Ni cliente, ni contrato, ni facturación, ni acuerdo de servicio. Se verificó en
> las cuatro deliberadamente.

---

## 2. El hueco del mercado es exactamente donde estamos parados

La categoría está partida en dos, y el corte deja fuera precisamente esta
operación:

| | Tope | Precio |
|---|---|---|
| HiveTracks | aficionado, licencia única | ~$70/año |
| Apiary Book PRO | aficionado, 1 apiario gratis | €80/año |
| APiLOG «Profesional» | sideliner con etiqueta profesional | $59.50/año |
| ApiManager Premium | 10.000 colmenas | $64.99/año |
| **MyApiary Sideliner** | **350 colmenas**, 1 usuario | **$699/año** |
| MyApiary Commercial | por usuario | **$999/año/usuario** |
| PollenOps Starter | 200 colmenas | $1.188/año |
| Nectar | clientes de 15.000–30.000 colmenas | no publicado |

Cincuenta colmenas, cuatro apiarios, técnicos pagados y contratos con clientes
queda **por encima de toda herramienta de aficionado y por debajo de la economía
de toda herramienta comercial**. MyApiary Commercial para una cuadrilla de dos
son ~$2.400/año sobre 50 colmenas.

Y el segundo hueco, más grande: **no existe una plataforma profesional de
operaciones apícolas construida para apicultores comerciales hispanohablantes de
América Latina.** Apiary Book es multiidioma pero de aficionado. Beeflow y
BeeDataNetworks operan en la región pero como servicio y como hardware, no como
herramienta. Ninguna aborda permisos de movilización por país, que en
jurisdicciones hispanohablantes son carga real.

---

## 3. Table stakes — construir esto no diferencia, no construirlo descalifica

Presente en prácticamente todos los productos serios:

registros multi-apiario · inspecciones · estado y edad de reina · cría ·
temperamento · historial de tratamientos y alimentación · conteos de varroa con
umbral · fotos en la inspección · GPS del sitio y mapa · **captura offline con
sincronización al reconectar** · **etiquetas QR/NFC/RFID por colmena** ·
recordatorios de tareas · exportación CSV/Excel · tableros de rendimiento y
mortalidad · vista de color «qué apiario toca trabajar» · acceso multiusuario ·
notas de voz.

Contra el Anexo A: de esta lista ya tenemos inspección, evento, cosecha,
provenance, cola offline y medios. Nos faltan, de lo que es estándar: **QR/NFC,
conteo de varroa estructurado, mapa, y tablero.** Nada de eso diferencia — hay
que tenerlo porque su ausencia se nota.

---

## 4. Las cuatro cosas que no hace nadie

Ordenadas por qué tan apropiable es el hueco.

### 4.1 El contrato de polinización como objeto de primera clase — casi vacío

Dos productos en todo el mercado:

- **Nectar** modela la **logística** del contrato: contacto, tipo de cultivo,
  fechas de entrada y salida de colmenas, precio, códigos de portón,
  indicaciones a cada bloque; ordenable por fecha y por cultivo; y al cierre de
  temporada reporta **mortalidad desglosada por finca y por cultivo** — qué
  relación comercial te dañó las abejas. Se detiene antes de: densidad
  comprometida por hectárea, calificación de fuerza, facturación y reporte al
  cliente.
- **PollenOps** modela el ciclo completo —cotización, firma, monitoreo previo de
  fuerza, entrega documentada con GPS y foto, facturación, cobro, renovación, y
  portal para el productor— pero **lanzó en marzo de 2026**, no tiene reseñas
  independientes, ni ficha de tienda, ni cliente nombrado. Trátese su lista de
  funciones como **una buena especificación del problema**, no como prueba de
  que alguien lo resolvió.
- **MyApiary**, la mejor plataforma comercial de la categoría y la más antigua,
  **no tiene absolutamente nada** de esto.

No hay a quién desplazar.

### 4.2 La calificación de fuerza — inexistente en software

Así funciona hoy en almendra, el mercado de polinización más maduro del mundo:

- Cláusula estándar: **promedio de 8 cuadros de abeja, mínimo de 5**. Una colmena
  por debajo de 5 no cuenta para el pago.
- Tres pasos: el apicultor se autocalifica antes de enviar; **el productor**
  contrata inspectores de condado o empresas calificadoras, típicamente dentro de
  las 2 semanas de colocadas, sobre **10% de las colmenas al azar**; el reporte
  va **a las dos partes**, y si el promedio no llega, el apicultor tiene días
  para agregar colmenas o pedir segunda inspección con inspector consensuado.
- Hay dinero encima: **bonos de ~$5 por cuadro sobre lo contratado**, cero pago
  bajo el piso de 5.

**Nada de ese flujo es software hoy.** Es tablilla, inspectores de condado y
disputas. La única empresa que atacó el paso 2 —**The Bee Corp / Verifli**, conteo
de abejas por imagen infrarroja, ocho años, financiamiento NSF, pilotos con
Syngenta— **se disolvió en 2024 y donó la tecnología al USDA**. Atacaron el
problema con hardware.

**Nadie ha intentado el camino de software puro**: captura estructurada y
muestreada de la calificación, promedio calculado contra el mínimo contratado,
bandera de las colmenas bajo el piso, cálculo del bono, y un reporte que las dos
partes puedan sostener. No requiere hardware ninguno.

Y aquí hay un giro que aplica directamente a Toabré: **en un café panameño no hay
inspector de condado a quien deferir.** Eso no debilita el registro del
apicultor: lo vuelve *la única evidencia que existe*. Nota honesta: el estándar
de cuadros viene de almendra; **para café no existe estándar equivalente
publicado**, así que el número que se acuerde con el cliente es el que gobierna,
y conviene que quede escrito en el contrato antes que en el software.

### 4.3 El reporte al cliente — tres ejemplos, ninguno sirve

PollenOps tiene portal para el productor (sin probar). BeeHero tiene tablero para
el productor —pero BeeHero **es** el servicio y el apicultor es su subcontratista—.
Beeflow entrega reportes de eficiencia de polinización, y **lista café entre sus
cultivos, operando en Perú, México y Brasil** — es el análogo comercial más
cercano a lo que se hace con Kiva, y su entregable es exactamente el reporte
técnico al productor.

**Ningún producto permite a un apicultor independiente generar un reporte técnico
profesional para su cliente después de cada visita.** Es literalmente la pauta
acordada con Kiva Estate, y el mercado entero no la cubre.

### 4.4 Costo por colmena, por apiario y por contrato — uno, a medias

Sólo **MyApiary** atribuye costo, y a nivel de equipo y sitio: costo por
cuadrilla, gastos del sitio, consumo de azúcar, rendimiento y pérdida por
ubicación. **Nadie liga horas de trabajo a una colmena, un apiario o un contrato
concreto**, así que nadie puede decir si un contrato de polinización dio
ganancia después del tiempo de cuadrilla y el transporte. Nectar insinúa
«rentabilidad de la relación con el productor» vía mortalidad por finca — eso es
daño, no costo.

Es el número que vuelve calculable la propuesta de entrenar a un residente en
Toabré en vez de discutirla otra temporada.

### 4.5 Menciones menores

- **Ruteo entre apiarios**: sólo Apiarist (app iOS de un desarrollador) lo
  ofrece. Con cuatro apiarios el hueco es real pero de bajo valor.
- **Órdenes de trabajo con responsabilidad**: MyApiary es el único con
  implementación seria —fichas de trabajo configurables, planificador
  arrastrar-y-soltar por cuadrilla, y **captura GPS automática de dónde se
  completó la tarea**—. Nectar infiere responsabilidad del escaneo. Nadie tiene
  máquina de estados asignar→aceptar→completar→verificar.
- **APIs**: sólo PollenOps publica una, a $499/mes. **Ningún producto documenta
  integración contable** (Xero/QuickBooks), lo cual es notable dado que facturar
  contratos es el punto.
- **Acciones en lote**: tensión no resuelta en toda la categoría. HiveTracks
  construyó **inspección a nivel de apiario** para programas de desarrollo
  justamente porque colmena por colmena no escala; Nectar en cambio **exige**
  escaneo por colmena en tiempo real, y un competidor lo ataca por eso.
- **Beetight murió**: cerró el 2 de febrero de 2025 y borró los datos de los
  usuarios. Recordatorio de qué pasa cuando la herramienta es de un tercero.

---

## 5. El cumplimiento es el motor de adopción, y aquí sí hay ley

Esta es la parte que cambia el orden de prioridades. Igual que EUDR ordenó la
trazabilidad del café, hay instrumentos vigentes que ordenan la del apiario.

### 5.1 Registro de tratamientos veterinarios — la obligación más firme

**Reglamento (CE) 852/2004, Anexo I, Parte A, Sección III, §8** obliga a los
productores primarios de origen animal —el apicultor lo es— a registrar:
naturaleza y origen del alimento suministrado; **medicamentos veterinarios u
otros tratamientos administrados, fechas de administración y períodos de
supresión**; enfermedades que puedan afectar la inocuidad; resultados de
análisis relevantes.

**Reglamento (UE) 2019/6, art. 108** detalla: fecha de primera administración,
nombre del producto, cantidad, proveedor con dirección, evidencia de
adquisición, identificación del animal o grupo, veterinario prescriptor,
**período de supresión «aunque sea cero»**, duración. **Conservación: 5 años.**

En la región es igual o más prescriptivo:

- **México** (SENASICA, NOM-064-ZOO-2000): el *Registro de Tratamientos
  Veterinarios* exige colmenas tratadas, diagnóstico, producto, días de
  aplicación, resultados, **dosis, período de retiro y fecha de caducidad del
  medicamento**. Mínimo 2 años.
- **Argentina** (SENASA): además del registro, **hay que conservar los troqueles
  o marbetes de los productos veterinarios de los últimos 2 años**. Implicación
  de diseño directa: **guardar foto de la etiqueta como adjunto del registro de
  tratamiento.**
- **Chile** (SAG, RAMEX): **dos registros distintos** — *Ingreso de Medicamentos*
  (entrada de inventario) y *Uso de Medicamentos* (aplicación). Ese patrón de
  dos libros permite **reconciliar comprado contra aplicado**, cosa que un solo
  log no permite.
- **España** (RD 209/2002 art. 7): el *libro de registro de explotación apícola*
  incluye diagnósticos, tratamientos con fechas, análisis y movimientos.

**La conducta derivada que vale oro: el bloqueo de cosecha por período de
supresión.** Tratamiento → colmena → carencia vigente → la cosecha se rechaza o
se advierte. Es exactamente lo que el Anexo B ya propuso como campo obligatorio
en fitosanitario, y ahora está validado por cuatro jurisdicciones. **Es también
algo que en papel nadie hace bien**, y por eso es argumento de adopción.

### 5.2 Directiva (UE) 2024/1438 — el EUDR de la miel, ya vigente

Modifica la Directiva 2001/110/CE:

- Los **países de origen deben listarse en orden decreciente por peso, con el
  porcentaje de cada uno**, en el campo visual principal. Se acabó el «mezcla de
  mieles UE y no UE».
- **Tolerancia del 5%** por origen, **«basada en los registros de trazabilidad
  del operador»** — la tolerancia está anclada explícitamente a los registros.
- **No se puede remover el polen** de modo que se altere el espectro polínico. El
  tratamiento térmico no puede destruir las enzimas.

Fechas: en vigor 13 jun 2024; transposición 14 dic 2025; **aplicable desde el 14
de junio de 2026 — es decir, ya**. Y hacia adelante:

- **Art. 4a**: actos delegados con **requisitos de trazabilidad a escala de la
  Unión «del productor cosechador o importador al consumidor»**, tras un estudio
  de viabilidad que cubre **soluciones digitales incluido un código identificador
  único** — plazo **14 de junio de 2029**.
- **Art. 4**: métodos armonizados de **detección de adulteración** — plazo **14
  de junio de 2028**.

**La regla de diseño que cae sola: el porcentaje por origen tiene que ser una
propiedad calculada del linaje de cosecha del lote, no un número tecleado.** Si
el sistema permite imprimir una etiqueta cuyos porcentajes no se derivan de los
registros de cosecha, el sistema falló la norma. Es la misma maquinaria de
linaje que el café ya tiene.

Contexto de por qué existe la norma: la acción coordinada **«From the Hives»**
(2021-22) halló **46% de 320 muestras sospechosas de incumplimiento** en puestos
de control fronterizo, contra 14% en 2015-17. China 74%, Turquía 93%. Entre las
técnicas detectadas: **falsificación de la información de trazabilidad** para
enmascarar origen, y **remoción de polen** para destruir el marcador de origen.
Y un dato técnico que importa: la prueba estándar de azúcares C4 (AOAC 991.41)
**no detectó** los jarabes nuevos de arroz, trigo y remolacha.

### 5.3 Exportación a la UE — Panamá no está en posición

Cuatro condiciones acumulativas: país listado en el Anexo I del Reglamento (UE)
2021/405 (**Panamá no aparece en ninguna lista recuperada**; sí Argentina,
Brasil, Cuba, República Dominicana, El Salvador, Guatemala, México, Nicaragua);
plan de monitoreo de residuos aprobado; **establecimiento listado en TRACES**
(Reg. 2023/2652, aplicable desde el 29 nov 2024); y certificado sanitario
modelo **HON**, con garantías adicionales sobre antimicrobianos desde el **3 de
septiembre de 2026**.

Lectura práctica: **la vía UE está cerrada por ahora y no depende del
productor.** Estados Unidos es mucho más accesible —registro FDA de la
instalación, Prior Notice, y sobre todo **FSVP**, donde el importador
estadounidense exige contractualmente documentación que funciona como
regulatoria—. La miel **no** está en la Food Traceability List de FSMA 204.

### 5.4 Orgánico — la fuente más rica de requisitos de datos

Reglamento (UE) 2018/848, Anexo II, Parte II, 1.9.6:

- **Conversión: 1 año.**
- **Radio de 3 km**: las fuentes de néctar y polen deben ser esencialmente
  orgánicas, flora silvestre o cultivos no tratados. **Hay que mantener y
  actualizar mapas del radio de 3 km** — la geolocalización pasa a ser campo de
  certificación, no comodidad.
- **Alimentación** sólo si peligra la supervivencia, con miel o azúcar orgánicos,
  documentando tipo, momento, cantidades y colmenas.
- **Cera nueva** de apiarios orgánicos, con análisis de residuos al certificar.
- Tratamientos permitidos: ácidos oxálico, láctico, acético, fórmico, mentol,
  timol, eucaliptol, alcanfor.
- **Un tratamiento alopático de síntesis ⇒ aislamiento de las colonias,
  reemplazo obligatorio de cera por cera orgánica, y reinicio de los 12 meses de
  conversión.** Eso **no es una bandera booleana: es una máquina de estados.**

### 5.5 Sanidad y notificación

WOAH lista seis enfermedades notificables de abejas: acarapisosis, **loque
americana**, loque europea, **pequeño escarabajo de la colmena**, **Tropilaelaps**
y **varroosis**. La obligación vincula a los **Estados**; el deber del apicultor
sale de la ley nacional.

**Panamá: no se encontró lista publicada de enfermedades de notificación
obligatoria que nombre enfermedades apícolas.** Existe la potestad habilitante
—**Ley 23 de 1997, art. 19**, que faculta a MIDA a adoptar las listas de la
OIE/WOAH— y nada más. No afirmar un deber legal panameño de notificación.

### 5.6 Panamá: lo que hay y lo que no

**Hay**: el *Proyecto de Mejoramiento Apícola* de MIDA (Dirección de Ganadería,
Santiago, Veraguas), cuyo trámite incluye evaluación técnica del sitio
—vegetación, acceso, agua—, supervisión sanitaria para reubicación e instalación
de colmenas, y **registro del apiario ante MIDA mediante un formulario
descargable «Registro de Apiario»**. Y un censo con granularidad real: 15.529
colmenas, 652 apicultores, 67.620 galones en 2025; Chiriquí produce el 61%.

**No hay** (buscado en Gaceta Oficial, FAOLEX, MIDA, Panamá Digital y el
catálogo de RT de MICI): ley o decreto que cree un registro apícola estatutario,
obligación de declaración anual de censo, guía de movilización para colmenas,
programa sanitario apícola, ni reglamento técnico de composición o etiquetado de
miel.

**Conclusión operativa: el formulario de MIDA es un trámite administrativo de un
programa de fomento, no una obligación legal demostrada.** Confirmarlo es una
llamada a la agencia regional de MIDA — trabajo de campo, no de investigación
documental.

Y el dato que enmarca toda decisión de inversión: rendimiento nacional **4,56
gal/colmena (~25 kg)** contra una meta de 8; IDIAP describe el problema del
sector como «menos de 20 kg por colmena por año» y nombra varroa y polilla como
causas; precio al productor **~US$10/litro**. **Cincuenta colmenas al promedio
nacional son ~US$8.750 brutos al año.** Ninguna inversión se juzga contra la
economía de una operación comercial estadounidense.

---

## 6. Sensores: un veredicto, y un bloqueador previo

### 6.1 El bloqueador

Antes de cualquier conversación de hardware:

| Tecnología | Panamá rural |
|---|---|
| LoRaWAN público | **The Things Network lista 0 gateways en Panamá** |
| Sigfox | operador listado (Cognix Panamá) pero sin estado de cobertura; el negocio global se reestructuró tras insolvencia |
| **LTE-M** | **Panamá está ausente de la lista de cobertura de emnify**, que sí incluye Costa Rica, Nicaragua, Honduras, El Salvador, México, Colombia, Brasil, Argentina, Chile, Ecuador y Uruguay |
| NB-IoT | sin listado dedicado; Tigo Panamá no lo nombra |
| 2G/GPRS | apagándose en la región. **No comprar hardware 2G en 2026** |
| 4G/LTE Cat-1 | sí donde hay torre; más consumo, solar casi obligatorio |
| Satélite | funciona en cualquier lado con vista al cielo; ~$100–300 hardware + $5–25/dispositivo/mes *(estimado)* |
| **WiFi de una casa cercana** | **revisar esto primero** — si un apiario tiene WiFi a ~50 m, la economía se vuelve trivial |

La ausencia de LTE-M mata la vía principal de BeeGuard. Tres correos antes de
gastar un dólar: BroodMinder (¿su SIM universal engancha en Panamá, en qué
operador y qué tecnología?), Hivemind (cotización satelital y frecuencia de paso
a 8–9° N), Tigo Business Panamá (¿LTE-M o NB-IoT, cobertura rural?).

### 6.2 Qué modalidad sobrevive al escrutinio

Sólo una: **el peso.**

- Es la única con física directa, evidencia independiente multi-sitio
  —*Apidologie* 2023, PLOS One con básculas TEKFA ±20 g, y los ~15 años del
  programa HoneyBeeNet de la NASA usando peso de colmena como registro directo
  de la interacción planta-polinizador— y modos de falla entendidos.
- Detecta bien: inicio y fin de flujo, escasez, disponibilidad floral,
  oportunidad de alzas, listo para cosechar. Detecta enjambrazón **después del
  hecho** (caída escalonada de 1,5–3 kg más colapso de la amplitud diaria), no
  antes.
- La deriva térmica de las celdas de carga es de 1–7 g/°C, y en Panamá la
  oscilación diaria comprimida la vuelve ruido irrelevante frente a un flujo de
  2 kg/día. **El clima tropical aquí ayuda.** Lo que sí estorba es la **lluvia**:
  una colmena empapada gana y pierde kilos que no son néctar.

Lo demás no se compra:

- **Acústica / predicción de enjambrazón.** El paper fuerte (Ramsey et al.,
  *Scientific Reports* 2020, 91% con 22 días de anticipación) usó
  **acelerómetros piezoeléctricos Brüel & Kjær embebidos en cera**, no el
  micrófono MEMS de un monitor comercial, y **entrenó y probó sobre las mismas
  colonias**, sin conjunto de validación independiente. n = 11 enjambres
  primarios. La revisión comercial de Colin et al. (*J. Apicultural Research*
  2025) **recomienda explícitamente no adoptarlos todavía**.
- **Humedad.** Los sensores se propolizan y dejan de funcionar. Con humedad
  ambiente alta el canal es casi inútil, y peor: un sensor propolizado no
  reporta «estoy roto», reporta un número plausible y equivocado.
- **Puntajes compuestos de salud.** Colin et al. advierten que arriesgan «dar
  información falsa o engañosa» cuando un sensor subyacente falla en silencio.
  Es la advertencia que ningún proveedor repite.

### 6.3 El hallazgo que aplica directo a Toabré

El proyecto **SAMS** de la UE, que desplegó monitoreo en **Etiopía e Indonesia**
—trópico, país en desarrollo, abeja no europea— identificó que **el ausentamiento
es un fenómeno tropical distinto que «no ha sido estudiado antes con enfoques de
apicultura de precisión»**.

Traducción: **la firma de peso de un ausentamiento no es la de una enjambrazón**
—no queda población residual, no hay reconstrucción— y **ningún algoritmo
comercial está entrenado en ella**. Cualquier «detección de enjambrazón» que se
compre va a clasificar mal un ausentamiento. Y el ausentamiento es lo que pasó
en Toabré el 2 de septiembre.

SAMS también encontró que **la energía, no el sensado, fue el problema
recurrente** en apiarios remotos, y que el costo de materiales de una unidad
competente ronda los **US$170** — útil para saber cuánto de los $250–460 de
precio de lista es margen.

### 6.4 La estrategia centinela, y su límite exacto

Hay dos señales distintas en una báscula, con transferibilidad opuesta:

| Señal | ¿Transfiere entre colmenas? |
|---|---|
| **De apiario / ambiental** — ¿hay néctar entrando? ¿se cortó el flujo? | **Sí.** Todas forrajean el mismo paisaje |
| **De colonia** — ¿está huérfana, enjambrando, saqueada, atascada de miel? | **No.** Demostrado colonia-específico |

La demostración es de un estudio USDA-ARS / Utah State (2025, 10 colonias,
muestreo cada 5 min): los mejores predictores «resultaron ser específicos de
cada colonia», y para peso «ningún pronóstico predijo observaciones ni
tendencias» al aplicarse a otra colmena del mismo apiario.

Los proveedores difuminan esa distinción porque difuminarla es como se venden 50
sensores en vez de 4. **La pregunta que vale $60 por viaje es la de apiario, y es
justo la que sí transfiere.**

### 6.5 Veredicto

**Una báscula, en el apiario más lejano, contestando una sola pregunta: ¿hay
flujo y hace falta ir?**

Costo: báscula BroodMinder W5 $259,99 + hub CELL $179,99 ≈ **$440 de capex**
(más flete e impuestos: ~$560–620 puesto en Panamá *(estimado)*) + $200/año de
plan que ya cubre toda la operación. **~$600 el primer año, ~$220 después.**

Retorno: a **$62 el viaje**, evitar 10 viajes innecesarios al año son $620.
**Se paga solo el primer año, casi todo por viajes evitados.**

Y un argumento a favor que ningún proveedor hace, porque no atiende a este
mercado: **con abeja africanizada el valor marginal de *no* abrir una colmena es
más alto.** Si revisar exige traje completo, humo, calor y riesgo real, una
báscula que dice «este apiario ganó 40 kg en 12 días, lleven alzas y lleven
ayuda» vale más que en Kentucky.

Todo lo demás: no. Y el dato de contexto que apunta en la misma dirección que la
literatura — **tres de los ocho proveedores de sensores investigados pivotaron
fuera del sensado en colmena, se quedaron callados o dejaron de publicar
precios.** Nectar pivotó a etiquetas RFID y software. BeeHero sobrevive vendiendo
analítica de contratos de polinización a productores de almendra, no sensores a
apicultores. Pollenity vende suscripciones de miel. Ese patrón es información
sobre la propuesta de valor.

---

## 7. Qué cambia en las decisiones abiertas del prompt

| Decisión | Qué aporta esta investigación |
|---|---|
| **D2** — dónde vive la lista de chequeo | El conteo de varroa necesita estructura propia: método (alcohol / azúcar / bandeja), abejas muestreadas, ácaros contados, **ácaros por 100 abejas**. Sin el método el resultado no es comparable, y es el único dato con umbral de decisión reconocido |
| **D5** — medios | Argentina exige conservar **troqueles/marbetes** 2 años. Una foto de la etiqueta del producto en el registro de tratamiento no es adorno: es el registro |
| **D6** — orden entre visita, polinización y reina | **Refuerza fuerte a polinización.** No sólo es barata: es el hueco del mercado, tiene forma conocida (Nectar publicó la mitad, PollenOps la otra) y es el único número que vuelve verificable la conversación con Kiva |
| **D7** — reporte al cliente | Es el hueco #3 del mercado. Nadie deja a un apicultor independiente emitirle un reporte técnico a su cliente. Beeflow lo entrega, pero como servicio, y **lista café entre sus cultivos** |
| **D9** — temporada | Se resuelve barato con una báscula centinela: la señal de apiario **sí transfiere**, así que una báscula en un sitio calibra el calendario de floración de ese paisaje sin declararlo a mano |
| **D10** — canal de aviso | Ningún producto de la categoría integra mensajería. Lo que hay son notificaciones en app. No hay estándar que copiar |

Y una decisión **nueva** que esta investigación abre y que no estaba en el prompt:

### D11 — ¿Se construye la captura de calificación de fuerza como instrumento contractual?

Es el hueco más limpio de todo el mercado: nunca se intentó por software, no
requiere hardware, y la operación de Toabré necesita exactamente eso —una cifra
de fuerza defendible frente a un cliente que paga por polinización dirigida—.
La forma, si se construye: muestreo declarado (qué porcentaje de colmenas, al
azar), conteo de cuadros de abeja por colmena muestreada, promedio calculado,
piso contratado, colmenas bajo el piso marcadas, y un reporte fechado con
operador y evidencia fotográfica que las dos partes puedan sostener.

Lo que hay que decidir es si entra en A10 junto con el compromiso de
polinización —son la misma conversación comercial— o si espera evidencia de que
Kiva quiere discutir en esos términos.

---

## 8. Campos nuevos que la ley obliga y el Anexo B no tenía

Además de lo que el Anexo B ya lista:

**Tratamiento** — `substancia_activa`, `numero_de_registro_sanitario`,
`fecha_de_caducidad_del_producto`, `cantidad_total_usada`,
`alzas_puestas_al_momento` (bool), `veterinario_prescriptor` + `receta`,
`evidencia_de_compra`, `foto_de_etiqueta_o_troquel`, `disposicion_del_sobrante`,
y **`fin_de_carencia` calculado** (no tecleado) que es lo que bloquea la cosecha.

**Inventario de medicamentos** — entidad separada del uso, patrón chileno:
ingreso con producto, lote, cantidad, proveedor, factura. Permite reconciliar
comprado contra aplicado, cosa que un solo log no permite.

**Varroa** — `metodo`, `abejas_muestreadas`, `acaros_contados`,
`acaros_por_100_abejas` derivado, `umbral_superado`.

**Movimiento de colmenas** — `origen`, `destino`, `fecha_salida`,
`fecha_entrada`, `motivo` (trashumancia / servicio de polinización / sanitario),
`permiso o certificado` + número + autoridad + vigencia, `notificación a la
autoridad` con fecha y evidencia, `estado sanitario a la salida`. **La misma
entidad captura el servicio de polinización en la finca del cliente**: misma
forma, distinta razón.

**Lote de miel** — `composicion_de_origen[]` = {país, región, apiario, kg, %}
**derivado del linaje de cosecha**, `fuente_botanica_declarada` +
`evidencia` (análisis polínico), `metodo_de_filtrado` + `polen_removido` (bool),
`temperatura_maxima_aplicada` + duración, `humedad`, `HMF`, `diastasa`,
`conductividad`, `lotes_padre[]`, `version_de_etiqueta_aplicada`.
Referencia Codex CXS 12-1981: humedad ≤20%, HMF **≤80 mg/kg para miel de origen
tropical** (contra 40 general), diastasa ≥8 Schade.

**Muestra de laboratorio** — `cadena_de_custodia[]`, `laboratorio` +
`acreditación ISO 17025`, `método` + versión, `LoD`, `LoQ`,
`incertidumbre_de_medida`, `identificador_publico` (destino del QR).

**Estado orgánico por apiario** — `estado` (convencional / en conversión /
orgánico), `inicio_y_fin_de_conversión`, `version_del_mapa_de_radio_3km`,
`uso_del_suelo_en_3km`, y por colmena `origen_de_la_cera`,
`ultima_sustitucion_de_cera`. Con la transición forzada: tratamiento no
permitido ⇒ aislamiento + reemplazo de cera + reinicio de conversión.

---

## 9. La lectura corta

1. **El hueco del mercado es esta operación.** Demasiado grande para las
   herramientas de aficionado, demasiado chica para la economía de las
   comerciales, y en un idioma y una región que nadie atiende profesionalmente.
2. **El contrato de polinización, la calificación de fuerza y el reporte al
   cliente son tres huecos consecutivos** que forman una sola cadena, y esa
   cadena es exactamente el trabajo con Kiva.
3. **El cumplimiento es el motor de adopción, no la comodidad.** El bloqueo de
   cosecha por carencia y el porcentaje de origen derivado del linaje son dos
   conductas calculadas que en papel nadie hace bien.
4. **Una báscula, en el sitio más lejano.** Nada más, y sólo después de confirmar
   que algo engancha a una red en el campo panameño.
5. **Ningún algoritmo comercial sabe qué es un ausentamiento.** Lo que pasó en
   Toabré no está en el entrenamiento de nadie.

---

## 10. Lo que no se pudo verificar

- **Precio real de Nectar.** No publicado. Las cifras que circulan salen de la
  página de un competidor.
- **Que PollenOps sea un producto en operación con clientes.** Sólo material
  propio y notas de prensa sindicadas; sin ficha de tienda, sin reseña
  independiente, sin cliente nombrado.
- **La fuente y cobertura de la alerta de brotes de Beentry.**
- **API o exportación de Nectar y de MyApiary.** Sin documentación pública.
- **Que algún hub celular enganche en el campo panameño.** Ninguna página de
  proveedor nombra países, o nombra sólo Europa, o sólo operadores
  estadounidenses.
- **Que Panamá esté en la lista de terceros países autorizados** para exportar
  miel a la UE. No aparece en ninguna lista recuperada, pero no se pudo abrir el
  Anexo consolidado para confirmar la negativa.
- **RTCA 67.06.74:16**, el reglamento orgánico centroamericano que sería el
  instrumento aplicable localmente: bloqueado en los tres hosts intentados.
- **Cualquier norma apícola panameña específica.** Ver §5.6.
- **Períodos de carencia por varroicida**: no hay tabla publicada; van por
  etiqueta de producto. Tiene que ser **un dato que el sistema guarda por
  producto y jurisdicción**, no una constante que calcule.
