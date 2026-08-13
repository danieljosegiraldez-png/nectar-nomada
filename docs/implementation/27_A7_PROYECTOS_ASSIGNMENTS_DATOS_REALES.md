# A7 — Projects, Assignments y carga de personas y organizaciones reales

**Absorbe `26_CARGA_REAL_PASO1_PERSONAS_ORGANIZACIONES.md`.** Ese prompt
nunca se ejecutó; su contenido está incorporado aquí para no hacer el mismo
trabajo dos veces. Tratalo como reemplazado.

**Estos son datos reales de producción, no de prueba.** Quedan
permanentemente en el registro de auditoría. Verificá cada valor contra lo
escrito abajo. Si un dato falta, dejalo nulo y reportalo — nunca lo
inventes ni lo infieras (CLAUDE.md §54). No completes apellidos, cargos,
correos ni coordenadas que no estén aquí.

**Mostrame qué vas a crear y esperá confirmación antes de escribir.**

---

## 1. Limpieza previa — listar antes de borrar

La base tiene contenido DEMO de `seedDemoSensoryContent()` y de la cadena
de T14, incluyendo un `PanelResult` con números ilustrativos declarado como
excepción a CLAUDE.md §54.

**Listá primero** qué existe —sesiones, muestras, resultados, lotes,
personas, organizaciones— con nombre e identificador, y esperá aprobación.

- **Se conserva:** los protocolos sensoriales reales de ADR-035 (café CVA,
  cerveza, hidromiel, miel, y los nueve marcadores `planned`).
- **Se borra:** la sesión de cata DEMO, sus muestras, el `PanelResult`
  ilustrativo, y cualquier lote o cadena creada solo para demostración.

## 2. Personas

**Con cuenta de usuario:**

- **Daniel Giráldez** — Néctar Nómada, asesor integral de proyectos
- **Kenis Abdiel Rodríguez Núñez** — asistente de apicultura en formación;
  ebanista y soldador; vive en Cerro Azul o cerca
- **Chayanne López** — apicultor, más de 10 años, 30 colmenas en Chitré
- **Bob Huerbsch** — copropietario, finca y beneficio Las Nubes Cerro Azul
- **Sherry Huerbsch** — copropietaria, finca y beneficio Las Nubes Cerro Azul
- **Chris Huerbsch** — punto de contacto y representante de la familia
- **Gabriel Cruz** — tostador de muestras; fuente de análisis CVA
- **Nathy Rubio** — operaciones y contenido, Néctar Nómada
- **Roberto Ameglio** — gerente general, Cafelino
- **Eliecer** — Cafelino: finca, semillero, procesos, secado, apoyo en
  almacenaje *(apellido desconocido — dejar nulo)*
- **Chini Ameglio** — Cafelino *(solo reportes)*
- **Carelia** — Cafelino: administración, planilla, ventas, exportación y
  clientes *(apellido desconocido — dejar nulo; solo reportes)*
- **Rory Beitia** — Jefe de Proyectos, Cafelino *(solo reportes)*
- **José Giráldez** — Craft Brewing Supply, jose@craftbrewingsupply.com

**Sin cuenta, referenciadas en registros:**

- **Kurt Ngo** — Q-grader, catador. Si el campo de certificaciones
  sensoriales (`BEVERAGE_SENSORY_PROTOCOLS.md` §7.3) existe en el esquema,
  registrá la credencial Q-grader; si no existe, reportalo.
- **Guillermo Ungo** — comprador de café verde, Terroir Exchange
- **Agustín Gómez** — productor, Finca Las Nubes (Jaramillo Arriba, Boquete)

**No crear:** Bryan Huerbsch, David (Chiriquí), Simon Gauterin.

## 3. Organizaciones

Verificá el enum `organization_type` real antes de asignar tipos.

- **Néctar Nómada** — organización propia
- **Finca Rosina** — finca y beneficio en Cerro Azul. Nombre de marca
  pre-aprobado por Sherry. **La sociedad formal (Beneficio Las Nubes /
  Café de Especialidad Las Nubes) aún no está constituida** — está en
  negociación, propuesta prevista para septiembre. No crearla.
- **Cafelino** — beneficio en Alto Lino, Boquete
- **Craft Brewing Supply** — proveedor
- **Cervecería Tres Gatos** — cervecería
- **Terroir Exchange** — comercializador de café verde
- **Morgan Estates** — Bambito, Chiriquí; Geisha
- **Finca Las Nubes (Jaramillo Arriba, Boquete)** — de Agustín Gómez,
  1300–1500 msnm, Geisha

**Desambiguación obligatoria:** existen dos "Las Nubes" y nunca deben
confundirse — la de Cerro Azul (Huerbsch, Catuaí) y la de Jaramillo Arriba
(Agustín Gómez, Geisha). Usá nombres que las distingan sin ambigüedad en
el registro.

## 4. Membresías organizacionales

`OrganizationMembership` es descriptivo y **no otorga permisos**
(`DOMAIN_MODEL.md` §2).

Bob y Sherry → Finca Rosina, copropietarios · Chris → Finca Rosina,
representante familiar · Daniel → Néctar Nómada, fundador · Nathy →
Néctar Nómada, operaciones y contenido · Roberto → Cafelino, gerente
general · Chini → Cafelino · Eliecer → Cafelino · Carelia → Cafelino,
administración · Rory → Cafelino, Jefe de Proyectos · José → Craft Brewing
Supply · Guillermo → Terroir Exchange · Agustín → Finca Las Nubes Boquete

Kenis, Chayanne, Gabriel y Kurt quedan **sin** membresía organizacional.
No asignes una plausible.

## 5. Ubicaciones

Jerárquicas vía `parent_location_id`.

**Finca Las Nubes Cerro Azul** (padre) — Cerro Azul, Panamá. Coordenadas
pendientes; dejá nulas y reportalo.
- Beneficio (dentro de la finca)
- Cuarto de secado (dentro de la finca)
- **Lote 1, 2, 3** — con las ~2.500 plantas de Catuaí de 3–4 años
- **Lote 4, 5, 6** — nuevos, ~200 plantones cada uno
- **Apiario 1** — camino antiguo hacia el río, lado Huerbsch, a distancia
  segura del pozo de agua
- **Apiario 2** — junto a la línea de cerca, sobre el camino que colinda
  con la propiedad Grajales. Tiene 2 colmenas vacías esperando enjambre
  silvestre.

**Alto Lino, Boquete** — beneficio de Cafelino.

**Jaramillo Arriba, Boquete** — Finca Las Nubes de Agustín Gómez.

Nota: los lotes de terreno todavía no tienen nombre definitivo; Lote 1–6 es
provisional y se renombrará.

## 6. Proyectos — dos, separados por sociedad

**Las Nubes Cerro Azul — Café.** Sociedad Huerbsch; Daniel como asesor y
posible socio (en negociación). Domain tag: café.

**Las Nubes Cerro Azul — Apiario.** **Propiedad y operación de Daniel
Giráldez**, operativa y financieramente, dentro de propiedad Huerbsch.
Los Huerbsch no lo operan. Domain tag: apicultura.

Son Projects distintos porque son sociedades distintas, no un Project con
dos etiquetas. La contención de scope (`RBAC.md` §3) debe garantizar que
Bob y Sherry no alcancen datos del apiario por su acceso al café, ni Kenis
alcance el café por su acceso al apiario.

**Cafelino** y **CryoBloom** son Projects reales pero **fuera del alcance
de A7** — se cargan después. No los crees ahora.

## 7. Assignments

**Las Nubes Cerro Azul — Café:**
- Bob Huerbsch — escritura. Registra pre y post cosecha, compras de
  insumos y equipos, manejos, costeo de labor e insumos, secado a
  almacenaje, trazabilidad a taza con puntajes CVA.
- Sherry Huerbsch — escritura, mismo alcance.
- Chris Huerbsch — **solo lectura**, reportes.
- Daniel Giráldez — administración del proyecto.
- Gabriel Cruz — evaluación sensorial.

**Las Nubes Cerro Azul — Apiario:**
- Daniel Giráldez — administración.
- Chayanne López — escritura completa: inspecciones, alimentaciones,
  tratamientos, divisiones.
- Kenis Abdiel Rodríguez Núñez — **`ColonyEvent` únicamente**
  (alimentación, tratamiento, observación al paso). **No inspecciones.**
  Participa en inspecciones acompañado; realizará inspecciones propias solo
  tras 3–4 visitas acompañadas. Es habilitación por competencia, no
  permiso permanente — registrá el criterio junto al Assignment para que
  la ampliación futura sea una decisión y no un olvido.
- Bob y Sherry Huerbsch — **solo lectura**, porque el apiario está en su
  propiedad. Alcance a este Project específicamente, no a apiarios en
  general: si en el futuro hay apiarios en otra finca, no deben verlos.
- Chris Huerbsch — **solo lectura**, reportes.

Si algún perfil de rol necesario no existe en `lib/rbac/catalog.ts`,
proponelo antes de crearlo — los Role Profiles son datos, no esquema
(`RBAC.md` §2), pero conviene revisarlos.

## 8. Verificación de aislamiento — requerida, no opcional

Probá en vivo, no por argumento:

1. Bob o Sherry **no** pueden leer datos del Project apiario más allá de
   su acceso de lectura explícito, ni escribir nada ahí.
2. Kenis **no** alcanza ningún dato del Project café.
3. Kenis **no** puede crear una `Inspection` — solo `ColonyEvent`.
4. Chris **no** puede escribir en ningún Project.
5. Chayanne **sí** puede crear inspecciones en apiario, y **no** alcanza
   el café.

Reportá cada caso con evidencia real de ejecución.

## 9. Procedencia

Los registros administrativos usan `original_record`. Donde corresponda,
`source_reference` puede citar las minutas del 18 de julio y 6 de agosto
de 2026.

## 10. Entregables

Qué se borró, qué se creó, qué campos quedaron nulos por falta de dato, y
los resultados de §8. Actualizá la fila de A7 en
`22_APIARY_V1_SCOPING_REPORT.md` y en `README.md`.

**No avances a A8.**
