# Una cuenta por operación, para ver el flujo real

**Por qué existe.** Daniel entra como Platform Admin y **lo ve todo**, así que no
puede notar cuándo a un operario le falta un botón o le sobra una pantalla. Con
una cuenta por papel, el flujo real aparece solo. Idea suya, 2026-09-25.

Los perfiles y permisos de esta tabla se midieron contra la base el 2026-09-25, no
se recordaron: `core.role_profile` con sus permisos, y los guardias de cada
pantalla leídos en el código. Si alguien cambia un perfil, esta tabla envejece —
la forma de re-medirla está al final.

## Cómo se crea cada cuenta

1. La persona se registra en `/signup` con su correo y **su propia** contraseña.
   Nadie más la escribe.
2. Daniel, en `/admin/users`, le da **perfil** + **ámbito**.
3. El ámbito es lo que acota: **un lugar alcanza también todo lo que cuelga de
   él** (ADR-144). Dar la finca da sus parcelas, su beneficio y sus apiarios; dar
   sólo el beneficio da sólo el beneficio.

## La tabla

| Operación | Perfil | Ámbito | Qué podrá hacer |
|---|---|---|---|
| **Finca: crear parcelas y microparcelas** | **Farm Manager** | la finca (sitio) | El único además de admin con `location:create_site`. **Un Farm Operator no puede crear parcelas**, sólo editar las que hay |
| **Beneficio: recepción, fermentación, secado, bandejas** | Farm Operator | el beneficio | Registrar y corregir procesos y lotes de ese beneficio, y de ningún otro |
| **Parcela: manejo, fitosanitarios, jornadas de campo** | Farm Operator | la parcela, o la finca | Con la parcela sola no ve el resto de la finca |
| **Cosecha: entregar café** | **Recolector** | la finca | El único con `harvest_delivery:create_own`: anota **sus** entregas, no las de otros |
| **Apiario: colmenas, inspecciones, cosecha de miel** | Farm Operator | el apiario | Crear colmenas, inspeccionar, cosechar |
| **Apiario: sólo anotar lo que pasó** | Apiary Colony Event Recorder | el apiario | Alimentaciones, tratamientos, observaciones. **No** crea colmenas ni inspecciones formales |
| **Cata: montar la sesión** | Cupping Host | **plataforma** | Ver la nota de abajo: este papel **no se puede acotar por finca** |
| **Cata: juzgar** | Sensory Judge | **la sesión** | Una asignación por sesión. Su formulario a ciegas, y nada más |
| **Cata: jefe de cata** | Sensory Head Judge | la sesión | Además, qué café es cada código ciego, el tueste servido y su edad |
| **Investigación** | Research Lead · Research Contributor | el proyecto | Protocolos y tratamientos de ese proyecto |
| **Contenido e historias** | Content/Ops Coordinator | plataforma | Historias y sugerencias de IA |
| **Socio que sube datos de campo** | Partner Field Collector | el proyecto | Su espacio de socio: envíos y fotos |
| **Mirar sin tocar** | Project Viewer | el proyecto | Lee lotes y apiarios del proyecto |

## Dos cosas medidas que conviene saber antes de probar

**1. «Nueva microparcela» no comprueba permisos para pintarse.**
`app/plots/[id]/ajustes/page.tsx` muestra el botón sólo por que el lugar sea una
parcela (`puedeSubdividir = location.locationType === "plot"`). La acción de
servidor decide después. Es un botón que promete lo que quizá niegue — el mismo
tipo de defecto que el proyecto viene cerrando en otras pantallas.

**Y el camino para llegar es largo:** `/finca` enlaza a la **lista** de parcelas
(`/plots`), no a cada parcela; hay que abrir la parcela → **Ajustes** → **Nueva
microparcela**. Daniel no lo encontró el 2026-09-25 y creyó que había
desaparecido. No había desaparecido: está a tres pasos y sin camino desde la
finca.

**2. Montar una cata se juzga a nivel de plataforma.**
`requireManageSession` (`lib/sensory/sessions.ts`) pregunta por
`sensory:manage_session` con ámbito `{ scopeType: "platform" }`. Así que un
Cupping Host **no se puede acotar a una finca**: con dos fincas, quien monta
catas las monta de todas. Con una sola finca no molesta; es una decisión
pendiente para cuando haya dos.

## Por dónde empezar el recorrido

Tres cuentas cubren el día a día:

1. **Farm Manager** de la finca — crear parcelas y microparcelas.
2. **Farm Operator** del beneficio — recibir cereza, fermentar, secar, pesar.
3. **Recolector** de la finca — entregar café.

Con cada una: navegar como se navegaría de verdad, y anotar qué falta o qué
sobra **antes** de construir más.

## Cómo re-medir esta tabla

```bash
# Los perfiles y cuántos permisos lleva cada uno
psql "$DATABASE_URL" -Atc "select rp.name, count(p.id)
  from core.role_profile rp
  left join core.role_profile_permission rpp on rpp.role_profile_id = rp.id
  left join core.permission p on p.id = rpp.permission_id
  group by rp.name order by 2 desc"

# Quién tiene un permiso concreto
psql "$DATABASE_URL" -Atc "select rp.name from core.permission p
  join core.role_profile_permission rpp on rpp.permission_id = p.id
  join core.role_profile rp on rp.id = rpp.role_profile_id
  where p.resource_type = 'location' and p.action = 'create_site'"
```

Y el guardia de cada pantalla se lee en su archivo: lo que la pantalla **pinta**
no siempre es lo que el servidor **acepta**, y cuando discrepan manda el servidor.
