# Las faenas de la colmena con nombres estándar, la división y las reinas

**Fecha:** 2026-09-18 · **Camino:** arquitectónico (hay modelo de datos nuevo)

Sale de lo que dijo Daniel al revisar el PR #397 («¿a qué vienes hoy?»), sobre la decisión
abierta §5.2 del spec `2026-09-17-faena-de-colmena-y-botiquin-design.md`:

> «también están divisiones de colmenas» · «que puedan hacer reinas nuevas» · «revisar manuales y
> ver cómo describir, términos más estándares y qué actividades son competentes y relevantes acá»

Y dos respuestas suyas del mismo día: **las cuatro actividades extra se hacen en su apiario**
(división/núcleos, cría y cambio de reinas, control de enjambrazón, unión y captura de enjambres),
y **el registro de reinas llega hasta «reina por colonia»** —no los lotes de cría—.

**#397 no se fusiona tal cual.** Queda abierto hasta que este spec esté aprobado; su mecanismo
(`?faena=`, plegar sin ocultar) se conserva y sólo cambia la lista.

---

## 1. Las fuentes, y por qué éstas

Dos manuales **oficiales** de la región, escritos para abeja **africanizada** y clima cálido —lo que
tiene Cerro Azul—, leídos el 2026-09-18:

| | Manual | Qué aporta |
|---|---|---|
| **[D]** | *Manual Técnico de Apicultura*, José Obdulio Crozier; ed. Miriam Villeda Izaguirre. DICTA, Secretaría de Agricultura y Ganadería de Honduras, 2019 (reedición del de 2005). [dicta.gob.hn](https://dicta.gob.hn/files/2019,Manual-tecnico-de-apicultura.pdf) | Manejo de colmenas, plagas y enfermedades (varroa), **multiplicación de las colmenas** (por división, por núcleo, por trasiego), prevención y control de la enjambrazón, unión, captura de enjambres, cosecha, registros |
| **[S]** | *Manual Básico de Apicultura*, Programa Nacional para el Control de la Abeja Africana, Coordinación General de Ganadería, SAGARPA (México); los datos que cita llegan a 2001. [osiap.org.mx](https://www.osiap.org.mx/senasica/sites/default/files/manual%20basico%20apicultura%20sagarpa.pdf) | «Por qué revisar una colmena» (nueve motivos), la guía de «trabajos a realizar», **división artificial de una colmena**, colonias huérfanas, **unión de colonias**, alimentación artificial, captura de enjambres, **crianza de reinas** (traslarve, orfandad, celdas reales, **introducción de reinas**), cosecha |

**Ninguna cifra de estos manuales entra al software** —dosis, intervalos, umbrales—: sólo los
NOMBRES de las actividades. Es la misma regla que ya rige `docs/dominio/` (ADR-158) y la decisión
P-F: qué cifras respalda Daniel no lo decide el sistema. Los tratamientos que [D] nombra con
antibióticos (oxitetraciclina, sulfatiazol) **no** se citan aquí como recomendación.

## 2. La fila de faenas, con los nombres de los manuales

| Faena (en pantalla) | Término de las fuentes | Qué abre | ¿Existe hoy? |
|---|---|---|---|
| **Revisar** | «revisión de colmenas» [D] · «revisión básica» [S] | la inspección | sí |
| **Alimentar** | «alimentación artificial» [D][S] · «alimentación de sostén» [S] | alimentación | sí |
| **Tratar** | «plagas y enfermedades» [D] · «prevención de enfermedades» [S] | tratamiento (con frasco del botiquín) | sí |
| **Contar varroa** | «varroa» [D] | conteo de varroa | sí |
| **Enjambrazón** | «prevención y control de la enjambrazón» [D] · «revisión de enjambrazón» [S] | la inspección en su parte de **celdas reales**, y el paso a *Dividir* | casi: las celdas ya se registran |
| **Dividir** | «multiplicación por división / por núcleo» [D] · «división artificial de una colmena» [S] | crear la colonia hija **sabiendo de cuál sale** | **no** — §3 |
| **Reinas** | «crianza de reinas», «cambio de reinas», «introducción de reinas» [S] | la reina de esta colonia y su historia | **no** — §4 |
| **Unir** | «unión de colmenas» [D] · «unión de colonias» [S] | terminar esta colonia **uniéndola a otra** | a medias — §3 |
| **Cosechar** | «cosecha de la miel» [D] · «época de cosecha» [S] | cosecha | sí |

**Captura de enjambres** («captura de enjambres» [D][S]) **no va en la fila de una colmena**: un
enjambre capturado no sale de esta caja, llega a una nueva. Va en el apiario, como «nueva colonia»
con origen *capturada*, que ya existe (`ColonyOriginType.captured`).

**El orden** sigue el de [S] («trabajos a realizar»): revisar primero, cosechar al final. Cambiarlo
es editar la lista `FAENAS`.

## 3. La genealogía de la colonia — lo que falta para dividir y unir

Hoy una colonia nace con `originType = split` y **no guarda de cuál salió**; y termina como
`combined` y **no guarda con cuál se unió**. Sin eso no se puede seguir una línea, ni contar cuántas
colonias salieron de una buena, que es para lo que [D] dice que se multiplica («duplicar el número de
colmenas»).

- **`Colony.parentColonyId`** — la colonia madre, cuando nace de una división. Obligatoria si
  `originType = split` (CHECK), prohibida en los demás orígenes.
- **`Colony.combinedIntoColonyId`** — con cuál se unió, cuando termina `combined`. Obligatoria en
  ese estado (CHECK), prohibida en los demás.
- **Dividir** es UNA acción que, en una transacción, crea la colonia hija en otra caja con su madre
  declarada, y opcionalmente anota en la madre qué salió (cuadros de cría, con o sin reina — [D]
  «dos de cría y uno de alimento como mínimo» se enseña como guía, no se exige).
- **Unir** cierra la colonia débil como `combined` apuntando a la que la recibe; la receptora no
  cambia de identidad.
- **Lo que NO hace:** no infiere genealogía de colonias ya registradas. Las divisiones pasadas sin
  madre declarada se quedan sin madre — un nulo, no una madre adivinada (ADR-080).

## 4. La reina — «reina por colonia»

Mismo mecanismo que los artefactos (#405): **intervalos**, porque una reina se mete en una colonia,
se cambia, o se muere, y la pregunta es «¿qué reina tenía esta colonia en mayo?».

- **`Queen`** — la reina: **origen** (vocabulario cerrado con escape: *criada aquí*, *comprada*,
  *natural* —la que la colonia hizo sola—, *de enjambre*, *otro* con nota), la **colonia de donde
  salió** cuando se crió aquí, **marca** (color y/o año, si se marcó — nulo si no), notas.
- **`QueenTenure`** — el intervalo reina↔colonia: desde, hasta (nulo = sigue), y **cómo terminó**
  (*cambiada*, *muerta*, *perdida*, *enjambró*, *otro*). Una reina puede tener más de un intervalo
  (enjaulada y metida en otra colonia: «introducción de reinas» [S]); una colonia tiene **como mucho
  una reina abierta** (índice parcial, como el nodo).
- **Cambio de reina** es una acción que cierra la tenencia vigente y abre la de la nueva en el mismo
  instante, en una transacción — sin hueco ni solape.
- **Colonia huérfana** ([S] cap. 10) se ve sola: colonia activa sin tenencia abierta. No es un dato
  que se guarde, es una lectura — y **no se afirma** para colonias sin ninguna reina registrada
  nunca: «nunca registrada» no es «huérfana».
- **Fuera de alcance, por decisión de Daniel:** los lotes de cría (traslarve, celdas reales,
  núcleos de fecundación, tasa de aceptación). El vocabulario de origen *criada aquí* deja sitio para
  colgarlos después sin rehacer esto.

## 5. Permisos

Dividir, unir y cambiar reina son trabajo de la colmena: **`apiary:manage`**, como la inspección.
El `Apiary Colony Event Recorder` (Kenis) no los hace, igual que no inspecciona — la fila le enseña
las faenas que sí puede, y las demás con su razón, que es el molde del 2026-09-17.

## 6. Lo que se construye, en orden

1. **La fila con los nueve nombres** (navegación pura, sobre #397). Las faenas sin modelo todavía
   —Dividir, Reinas, Unir— aparecen **con su razón** («llega con la genealogía») en vez de ocultas.
2. **Genealogía** (§3): columnas, CHECK, acciones Dividir y Unir.
3. **Reinas** (§4): `Queen`, `QueenTenure`, cambio de reina, la lectura «huérfana».

Cada paso con su plan, sus pruebas contra Postgres y sus flip-tests, como el botiquín y los
artefactos.

## 7. Decisiones abiertas — de Daniel

1. **¿Marca de reina con el código internacional de colores por año** (blanco/amarillo/rojo/verde/
   azul por terminación 1-6/2-7/…)? Ninguna de las dos fuentes leídas lo trae; si lo usan en Cerro
   Azul, se añade como vocabulario; si no, la marca es texto libre.
2. **¿La faena «Enjambrazón» merece fila propia** o basta con que *Revisar* resalte las celdas
   reales? Las dos fuentes la separan del resto.
