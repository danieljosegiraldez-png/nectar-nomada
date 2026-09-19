import { prisma } from "../db";
import { bandejasDeLaFinca, tiposDeBandeja } from "../equipos/bandejas";
import { puedeConfigurarEn, sitiosParaRegistrar } from "../equipos/equipos";
import { capacidadDeTipo, pesajesDeTipo } from "../traceability/capacidadDeBandeja";
import { puedeEditarBeneficioEnOrganizacion } from "../traceability/locations";
import { lotWhereFromVisibility, puedeGestionarLote, resolveLotVisibility } from "../traceability/lots";

/**
 * El modelo de vista de `/beneficio/bandejas` (Tarea 5 del plan 2a): una
 * fila por organización, con sus tipos ya resueltos a su capacidad, sus
 * bandejas, y qué puede hacer esta persona ahí.
 *
 * **Vive en `lib/` y no en `app/beneficio/bandejas/page.tsx`** porque
 * `app/**` no puede importar un cliente de base de datos directamente
 * (`eslint.config.mjs`, regla `no-restricted-imports` sobre `lib/db`) — la
 * página sólo pinta lo que esto devuelve, igual que `detalleInstalacion` hace
 * por `/instalaciones/[id]`.
 *
 * **Qué organizaciones entran.** El brief pide "cada organización donde
 * quien mira ve algún tipo o alguna bandeja". Tomado al pie de la letra, una
 * organización con `edit_beneficio` pero CERO tipos todavía quedaría fuera —
 * y entonces nadie podría crear el primer tipo desde la pantalla, justo lo
 * que pide el primer paso de la propia verificación en navegador de la
 * Tarea 5. Así que la condición real es: hay algún tipo, alguna bandeja, O
 * quien mira puede crear un tipo aquí. Registrar bandejas y registrar pesaje
 * siguen exigiendo que ya exista al menos un tipo, porque las dos necesitan
 * elegir uno.
 */
export async function vistaDeBandejas(userAccountId: string) {
  const sitiosPropios = await sitiosParaRegistrar(userAccountId);
  const visibilidadDeLotes = await resolveLotVisibility(userAccountId, "manage");
  const loteWhere = lotWhereFromVisibility(visibilidadDeLotes);

  // A5 (revisión final del plan 2a): sólo organizaciones con al menos un
  // `site` — sin esto un Platform Admin ve una sección por cada
  // roaster/cliente, que nunca va a tener bandejas.
  const organizaciones = await prisma.organization.findMany({
    where: { locations: { some: { locationType: "site" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const secciones = [];
  for (const org of organizaciones) {
    const tipos = await tiposDeBandeja(userAccountId, org.id);
    const bandejas = await bandejasDeLaFinca(userAccountId, org.id);
    const puedeEditar = await puedeEditarBeneficioEnOrganizacion(userAccountId, org.id);
    if (!tipos.length && !bandejas.length && !puedeEditar) continue;

    const tiposConCapacidad = [];
    for (const tipo of tipos) {
      const capacidad = await capacidadDeTipo(userAccountId, tipo.id);
      const estados = [];
      for (const linea of capacidad.estados) {
        // `detalle` es el camino de vuelta (visibles/ocultos); `linea.pesajes`
        // sigue siendo el CONTEO que ya trae `capacidadDeTipo` — no se pisan.
        const detalle = linea.fuente === "medido" ? await pesajesDeTipo(userAccountId, tipo.id, linea.estado) : null;
        estados.push({ ...linea, detalle });
      }
      tiposConCapacidad.push({ ...tipo, estados });
    }

    const candidatos = sitiosPropios.filter((s) => s.organizationId === org.id);
    const sitiosDisponibles = [];
    for (const s of candidatos) if (await puedeConfigurarEn(userAccountId, s.id)) sitiosDisponibles.push(s);

    // A1 (revisión final del plan 2a): el selector no puede enseñar id y código
    // de un lote que esta cuenta no gestiona (`lotWhereFromVisibility` sólo
    // acota ÁMBITO — proyecto o ubicación —, no clasificación). Se filtra cada
    // candidato con el mismo guardia que usa `registrarPesaje`
    // (`puedeGestionarLote`, que llama a `requireLotAccess`). `resolveLotVisibility`
    // NO se toca: es compartido y está fuera de este alcance.
    const candidatosDeLote =
      tipos.length && loteWhere
        ? await prisma.lot.findMany({
            where: { ...loteWhere, organizationId: org.id },
            select: { id: true, lotCode: true, projectId: true, locationId: true, classification: true },
            orderBy: { createdAt: "desc" },
            take: 101,
          })
        : [];
    const lotesRecortados = candidatosDeLote.length > 100;
    const lotesGestionables: { id: string; lotCode: string }[] = [];
    for (const lote of candidatosDeLote.slice(0, 100)) {
      if (await puedeGestionarLote(userAccountId, lote)) lotesGestionables.push({ id: lote.id, lotCode: lote.lotCode });
    }

    secciones.push({ org, tipos: tiposConCapacidad, bandejas, puedeEditar, sitiosDisponibles, lotesGestionables, lotesRecortados });
  }
  return secciones;
}
