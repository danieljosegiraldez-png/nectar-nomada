# Farm-to-green — Fase 2: el ADR y la lista de tickets

**Fecha:** 2026-10-08 · **Estado:** diseño aprobado por Daniel por partes en sesión; pendiente de su lectura
del documento entero · **Sale de:** `docs/reference/farm-management/AUDIT_2026-10-04.md` (Fase 1) y las
24 respuestas de Daniel en su §8 · **Medido sobre:** `origin/main = 099a9330`.

Es la Fase 2 del prompt `docs/reference/farm-management/00_CLAUDE_CODE_PROMPT.md`: un ADR y una lista de
tickets. **No implementa nada.** Cada ticket tendrá su propio diseño, sus nombres aprobados por Daniel
(C4) y su propio visto bueno antes de construir.

---

## 1. Decisiones de Daniel que ordenan este plan (2026-10-08)

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Qué cubre el plan | **Sólo lo que nadie lleva.** La 2a, la 2b y la 2c (sesión de recetas) son **dependencias con nombre**, no tickets de este plan |
| D2 | Primera versión del cockpit | **Sin motores**, con H1–H3 arriba: franja de estado, relojes, recepciones que esperan destino (sin propuesta); más pipeline en kg y capacidad de hoy. Motores, mezcla, cosecha y clima, después |
| D3 | Las referencias del paquete | **Un ticket que amplía el archivo de referencias de la 2a a las 208**, todas las fuentes lado a lado; de sólo lectura, en código, sin tabla, nunca decide |
| D4 | Qué más entra | **Arreglos de lo que ya existe** y **finca** (floración, fenología, MIP, fertilizantes). Cosecha, calidad, catálogos y agroquímicos quedan para después |
| D5 | Cómo se ordena | **Tres carriles** con dependencias escritas: finca, arreglos, beneficio |

---

## 2. El ADR — borrador

> Se añade a `docs/architecture/DECISIONS.md` en el mismo PR que este documento, cuando Daniel lo
> apruebe. **Número tentativo: ADR-197** — el último en `main` es el 196 y ninguna rama abierta reclama el
> 197 (medido el 2026-10-08 sobre `recetas-parte-2a`, `beneficio-sin-finca` y
> `codex/apiario-reporte-completo`). Se vuelve a medir al fusionar: el guardia
> `tests/arquitectura/numeros-de-adr-unicos.test.ts` lo exige.

### ADR-197 — La integración del paquete farm-to-green: referencia, no norma, y tres carriles

**Fecha:** 2026-10-08 · **Estado:** propuesto · **Decisiones de Daniel**, en sesión, pregunta a pregunta
(2026-10-04 a 08); cada punto cita su fila en la §8 de `AUDIT_2026-10-04.md`.

**Contexto.** El paquete `docs/reference/farm-management/` (v2.1, entró con el #638) propone un módulo de
café de punta a punta y un cockpit del beneficio. La auditoría de la Fase 1 lo midió contra el código: 1
capacidad completa, 32 parciales y 15 ausentes de 48, y 18 conflictos con los normativos y los ADR.

**Decisiones.**

1. **El paquete es referencia, no norma.** Manda la precedencia de `docs/beneficio/README.md`. Sus 208
   referencias **sólo se muestran** —valor · fuente · confianza, «baja» y «NN» a la vista—, **todas las
   fuentes lado a lado y ninguna por defecto**, y **nunca deciden** (C1, C17, P1).
2. **Los umbrales salen de la receta.** Orden de la 2b: lote → receta → ninguno. **Si falta un parámetro,
   ese motor no opina y lo dice**: sin perfil de respaldo, ni por grado ni por ejes (PE-77/78). Esto cambia
   la V6 de la 2b.
3. **Qué se bloquea:** las reglas de la casa (2a D6: venta antes del reposo, equipo sin capacidad, pasos
   incoherentes, con excepción firmada), **más la sobrepresión de un recipiente sellado como bloqueo de
   seguridad**, para lo que cada recipiente sellable guarda su presión máxima (C2, dato para la 2c).
4. **Datos del campo:** mucílago **por tramo** 0/10/25/50/75/100, lo que queda (C3); **aw opcional** y fin
   de secado por humedad, con temperatura de muestra pedida si hay aw y la lectura marcada sin ella (C7);
   **reposo por receta**, sugerencias lavado 60–90 y natural 45–60, venta bloqueada (C8); **«de primera»
   con las cinco condiciones** de ADR-181 #8, y el 18–24 °Bx deja de ser regla global (C9).
5. **Nombres de proceso.** Los métodos se nombran libremente («fermentación láctica»); afirmar un
   resultado ante un comprador («es láctico») pide un dato medido o va como «perfil buscado» (P4a). Los
   nombres de la casa son Lavado, Natural, Honey, Semi Wash NN %, Multiproceso, fiebre, CryoBloom, Doble
   Mosto y fermentación láctica (P4). **La plataforma no evalúa elegibilidad de concurso**, y la
   inoculación, la bioprotección, las enzimas y el mosto propio **no son infusión ni coinfusión** (P3).
6. **Pantallas.** Portada **por rol**: `/beneficio` es el cockpit del jefe de beneficio; el operario de
   secado entra a `/beneficio/secado` (C15). Los avisos dicen **qué, cuándo y quién en tono de sugerencia
   que alguien confirma**: «Toca lavar antes de 14:30 · Juan» (C16).
7. **El registro central en el WhatsApp de Néctar Nómada es regla de Daniel**: todo aviso y toda acción
   se registran también ahí. **Se construye después del cockpit**, sin salir del aplazamiento de
   ADR-039/044 hasta entonces (C14).
8. **El trabajo va en tres carriles** —finca, arreglos, beneficio—, con la 2a, la 2b y la 2c como
   dependencias, no como trabajo de este plan.
9. **Fuera, y por qué:** nómina, aguas residuales y exportación **no se eligieron** (P5; sigue la
   decisión del 2026-09-18 de mano de obra sin nómina); **vivero en una fase futura** (P5); elegibilidad
   de concurso **depende de cada caficultor** (P3); perfiles de autoridad, **resuelto por C1**.

**Lo que este ADR NO decide.** Los nombres de nada nuevo (C4: los aprueba Daniel en el diseño de cada
ticket); el diseño interno de cada ticket; las horas de CryoBloom B (provisional, «entre 24 y 48 h»).

---

## 3. Dependencias externas — con nombre, no son trabajo de este plan

| Dependencia | Qué trae | Quién | Estado medido el 2026-10-08 |
|---|---|---|---|
| **2a PR-A** | esquema y migración de pasos, vocabulario, **archivo de referencias** (T02), autoría, editor | sesión de recetas | en construcción en `recetas-parte-2a` (T3, T4, T5a, T9a con commit) |
| **2a PR-B** | la receta en la operación: avance, guardianes, **lectores por paso** (T09), Libre, lecturas de cierre (T11), **avisos de recepción** (T12), ficha del lote (T13) | sesión de recetas | sin empezar; va sobre el PR-A |
| **2b** | lo que la receta vigila: reposo y venta, excepciones, `umbralPara` | sesión de recetas | diseño; **cambia por PE-77/78** (sin perfil de respaldo) |
| **2c** | equipos y capacidades; **quién ocupa cada tanque y cama** | sesión de recetas | diseño; algunos arreglos previos ya en `main`; `vesselEquipmentId` y la cama de la corrida **siguen sin escritor** |

---

## 4. Carril finca

### F1 — Registrar floraciones desde la parcela · **empieza ya**

- **Alcance:** la pantalla y la acción de servidor que llaman a `registrarFloracion`
  (`lib/traceability/floracion.ts:54`), que existe y **no tiene pantalla**. Con eso el aviso de
  polinizadores de la intervención, construido e inalcanzable (`SESSION_STATE.md` §3, «El aviso de
  floración está construido y no se puede alcanzar»), funciona.
- **Esquema:** ninguno; `PlotBloom` existe (`schema.prisma:5026`).
- **Aceptación:** alguien con permiso registra una floración desde la parcela, con bloques opcionales, y
  la intervención siguiente sobre esa parcela ve el aviso.
- **Pruebas:** la acción escribe la floración; sin permiso no puede; **flip**: sin la acción, la prueba de
  alcance cae.
- **Retroceso:** quitar la pantalla y la acción; no hay migración.
- **Referencias:** A12; `02_ACTIVITY_TAXONOMY.md`.

### F2 — Días desde floración · **depende de F1**

- **Alcance:** calcular y mostrar los días desde floración (DAF) por parcela y bloque, como dato para F3.
  **Sin grados-día**: Cerro Azul no tiene temperaturas oficiales y se llenan a mano; GDD queda posterior.
- **Esquema:** quizá intensidad (%) y lluvia previa en la floración; **se decide en su diseño**.
- **A decidir en su diseño:** con varias floraciones en una parcela, cuál ancla los días.
- **Pruebas:** el cálculo con una y con varias floraciones; una parcela sin floración dice «sin floración»,
  no un cero.
- **Retroceso:** sin migración si no hay campos nuevos; con ellos, la migración es aditiva.
- **Referencias:** A12, A15; `04_reference_parameters.json` (fenología).

### F3 — MIP con incidencia · **depende de F2; las referencias, de B1**

- **Alcance:** un muestreo por organismo con incidencia (afectadas sobre muestreadas), severidad opcional,
  días desde floración y posición en la rejilla. Se añaden **los seis organismos que faltan** (CBD, THB,
  PHO, PNK, ROS, XYL) con su nombre aprobado por Daniel. **El umbral lo fija la finca** —el patrón de
  `TrapRule`, `schema.prisma:10237`—; las referencias de cada institución **sólo se muestran**; superarlo
  **avisa**, no bloquea.
- **Esquema:** un registro nuevo o ampliar `SpecimenObservation` (`:7576`) —se decide en su diseño—, y los
  valores nuevos de `PlotInterventionTarget` (`:4918`), que llevan migración.
- **Pruebas:** el cálculo de incidencia; el umbral de la finca; sin umbral no hay aviso (como las
  trampas); **flip** del aviso.
- **Retroceso:** migración aditiva; los valores nuevos del enum no se borran si ya hay filas que los usan.
- **Referencias:** A10; `master_data/agronomy_catalogs.json`; `R2_ipm.md`.

### F4 — Intervención para fertilizantes y bioestimulantes · **bloqueado**

- **Bloqueos:** (1) la decisión de Daniel en `SESSION_STATE.md` §3, «Que la intervención de finca sirva
  para cualquier producto»: ¿un fertilizante es otra clase con su propio objetivo, o «objetivo» pasa a ser
  «propósito» y las plagas son un caso suyo?; (2) **la tarea 8 de la 2a en `main`**, que toca
  `lib/traceability/intervenciones.ts`.
- **Alcance:** registrar la aplicación de cualquier producto. **No** un plan de nutrición.
- **Esquema, pruebas y retroceso:** dependen de la decisión.
- **Referencias:** A5, A11; SOI.NUT.02.

---

## 5. Carril arreglos

### Empiezan ya — no tocan archivos de la 2a

**R1 — Pantallas de carga y de error.** `loading.tsx` y `error.tsx` en `/beneficio` y `/lots`, y un
`global-error.tsx` (hoy **0** en el repositorio). **Aceptación:** si una página del beneficio falla, sale
un mensaje en español con la vuelta al inicio. **Pruebas:** un guardia que exige esos archivos y cae si se
borran. **Retroceso:** borrarlos. **Referencias:** `09` §12 «States».

**R2 — `/beneficio` se lee sin conexión.** Se añade a `OPERATOR_ROUTE_PREFIXES` de `public/sw.js` y se pone
al día `tests/arquitectura/rutas-de-operador.test.ts`. **La cola de envíos de sus formularios va después
del PR-B de la 2a**, que los reescribe. **Aceptación:** sin red, el jefe abre `/beneficio` y ve el último
estado, marcado como viejo. **Retroceso:** quitar el prefijo. **Referencias:** `09` §0 «Connectivity», §10.8.

**R3 — Contraste y tacto, sólo en `app/globals.css`.** Definir `--nn-warn`, `--nn-danger` y `--nn-muted`,
que hoy no existen en ningún sitio (la cola de secado cae a hex de respaldo: «Le toca volteo» da 4,06:1);
llevar los valores críticos a ≥ 7:1; acciones de campo a 56 px; la casilla del volteo de 26 a ≥ 44 px.
**Todo por CSS**, sin tocar la página de secado, que es de la 2a. **Pruebas:** un guardia que exige las tres
variables definidas, con su control. **Retroceso:** revertir el CSS. **Referencias:** `09` §12.

**R4 — El motor, según las decisiones de Daniel.** Retirar el aviso de dilución fijo a 6,5
(`lib/beneficio/ph.ts:242`; ADR-181 #13), que no vuelve hasta que exista el pH del agua del lote; que
`TARGET_REACHED` deje de exigir aw (`lib/beneficio/secado.ts:234-236`; C7) y se marque «sin aw medida»;
corregir los textos con las cifras copiadas (`messages/es.json`, avisos de pH y secado). **Riesgo:**
cambian vectores de `tests/fixtures/vectores-de-beneficio.json` y `00_reglas_del_modulo.md` §2 —se
anotan con nota fechada que cita las decisiones, en el mismo commit (`00_reglas` §7.7)—. **Pruebas:** los
vectores al día; **flip**: devolver el 6,5 hace caer su prueba. **Retroceso:** revertir el commit.
**Referencias:** C7; `docs/beneficio/10`, `13`.

### Esperan a la 2a

**R5 — El formulario de medición · tras el PR-B de la 2a** (que toca `measurements.ts` y
`app/actions/traceability.ts`). pH, Brix y °C **en un solo envío** (hoy 12 toques; meta ≤ 6); el
instrumento y su verificación **visibles antes de guardar**; la aw pide la temperatura de la muestra y sin
ella se guarda marcada (C7); formato numérico en español. **Esquema:** la temperatura de la muestra, con
nombre a aprobar. **Pruebas:** un envío con tres variables escribe tres lecturas en una transacción; sin
temperatura de muestra la lectura sale marcada; **flip**. **Retroceso:** migración aditiva.
**Referencias:** `09` §12 «Capture»; A25.

**R6 — Brix de recepción y «de primera» · se le propone a la tarea 12 de la 2a** (avisos de recepción, que
toca `brixDeRecepcion.ts` y `perfiles.ts`); si no lo toma, va justo después. El 18–24 °Bx deja de ser regla
global (la receta Lavado puede llevarlo como su rango); los `veredicto_brix` guardados se quedan como
historia, marcados «regla anterior», sin reescribirlos; «de primera» con las cinco condiciones de ADR-181
#8. **Riesgo:** datos vivos — cuántas filas tienen veredicto es consulta de Daniel en Neon. **Referencias:**
C9; ADR-181 #6 y #8.

---

## 6. Carril beneficio

### B0 — Las Nubes, de verdad · **depende de la lista de Daniel**

Dar de alta los tanques, camas, cuarto de secado e instrumentos de **Las Nubes** (nombre canónico; P6) con
las pantallas que existen (`/instalaciones`, `/equipos`), o con un guion que **simula por defecto** y corre
Daniel en producción. **Aceptación:** el inventario de Las Nubes se ve completo en esas pantallas. **Sin
esto el cockpit dibuja un beneficio vacío.** Cafelino, después.

### B1 — Las 208 referencias, lado a lado · **depende del PR-A de la 2a**

- **Alcance:** ampliar el archivo de referencias que trae la tarea 2 de la 2a a los 208 parámetros de
  `04_reference_parameters.json`, con todas las fuentes juntas, «baja» y «NN» a la vista, y las claves
  retiradas (`deprecated_keys`) fuera o marcadas.
- **Esquema:** ninguno; vive en código.
- **Pruebas:** cada parámetro trae fuente y confianza; **un guardia de arquitectura que impide que ningún
  motor lo importe** (las referencias nunca deciden), con su **flip** (un import desde `lib/beneficio/ph.ts`
  lo hace caer).
- **Retroceso:** revertir el archivo.
- **Referencias:** A38; prompt, reglas 1, 2 y 7.

### B2 — Cockpit v1 en `/beneficio`, la portada del jefe · **depende del PR-B de la 2a, la ocupación de la 2c, B0, R1 y R3**

- **Alcance:** H1 franja de estado (el peor asunto abierto y sus contadores); H2 relojes (tiempo hasta la
  próxima acción según el paso vigente de la receta); H3 recepciones que esperan destino, con su espera,
  **sin propuesta**; H4 pipeline en kg por etapa; H5 capacidad de hoy. H1–H3 caben en la primera pantalla
  de un teléfono de 390 px. Avisos en tono de sugerencia con qué, cuándo y quién (C16). **Un lote sin
  receta dice «sin receta»** y no muestra un reloj inventado (ADR-197, punto 2: sin receta, el motor
  no opina). El índice y las rutinas
  siguen en la mitad de abajo (ADR-193).
- **A decidir en su diseño:** quién es el «quién» de cada reloj —hoy el lote no tiene responsable
  asignado—; y cómo se concilia H4 en kg con ADR-195 («sin registro» en recepción y selección).
- **Esquema:** ninguno previsto; lo dirá su diseño.
- **Aceptación:** se comprueba **en un teléfono, con los datos de Las Nubes y con capturas**, no sólo
  leyendo código; la cuenta de toques de `09` §12 se mide en esa prueba.
- **Pruebas:** el orden de los módulos; «sin receta» no pinta reloj; un lote ajeno no se ve (RBAC);
  **flip** de cada uno.
- **Retroceso:** `/beneficio` vuelve a su tablero de hoy; sin migración.
- **Referencias:** `09` §2, §4, §12; A37; C15, C16.

---

## 7. Posteriores y fuera

| Qué | Por qué |
|---|---|
| **B3** — motores: ruteo que propone, capacidad a 14 días, predicción de fin de fermentación y secado; H6 mezcla, H7 cosecha, H8 clima, H9 seco y bodega, H10 experimentos | D2: la primera versión va sin motores; necesitan factores de rendimiento aprendidos, pronóstico y ocupación real |
| **B4** — notificaciones y registro central en WhatsApp | C14: regla de Daniel, después del cockpit |
| Cosecha (pasadas, madurez, pase final), calidad (verde 350 g, catación por sistema, balance por etapas), catálogos (unidades de campo, variedades), agroquímicos (estado en Panamá, FRAC/IRAC) | D4: no se eligieron ahora |
| Vivero | P5: fase futura |
| Maquila, costos, ventas de café verde | nadie los ha decidido |
| Nómina, aguas residuales, exportación y EUDR, certificaciones, carbono | P5 y fuera de alcance |
| Elegibilidad de concurso; perfiles de autoridad | P3; C1 |

---

## 8. Lo que espera a Daniel

| Qué | Bloquea |
|---|---|
| La lista de tanques, camas, cuarto de secado e instrumentos de Las Nubes | B0, y con él B2 |
| Fertilizante: ¿otra clase o «propósito»? (`SESSION_STATE.md` §3) | F4 |
| Las horas de CryoBloom B («entre 24 y 48 h», provisional) | ninguna receta de CryoBloom B se carga sin ello |
| P-J: qué abamectina hay en la bodega | no es de este plan; es la única decisión abierta del repositorio |
| Los nombres nuevos de cada ticket | el diseño de cada ticket (C4) |

---

## 9. Orden de arranque

1. **Ya:** F1, R1, R2 (lectura), R3, R4 — en paralelo, porque no tocan archivos de la 2a.
2. **Tras F1:** F2; **tras F2:** F3 (sus referencias se ven en cuanto exista B1).
3. **Tras el PR-A de la 2a:** B1.
4. **Tras el PR-B de la 2a:** R5, R2 (cola de envíos) y R6 si la tarea 12 no lo tomó.
5. **Con la lista de Daniel:** B0.
6. **Tras el PR-B de la 2a, la ocupación de la 2c, B0, R1 y R3:** B2.
7. **Cuando Daniel decida los fertilizantes y la tarea 8 de la 2a esté en `main`:** F4.

Cada uno empieza con su propio diseño y su visto bueno; ninguno se construye en paralelo con la 2a sobre
los mismos archivos.
