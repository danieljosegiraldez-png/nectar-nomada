/**
 * Manifiesto de rutas: la clasificación se **declara**, no se infiere.
 *
 * La revisión independiente del plan (compuerta 2) lo pidió así: clasificar por
 * grep mide «presencia de una señal conocida», no «página gateada», y un
 * clasificador que reconoce su propio vocabulario no reconoce la pérdida del
 * control. Aquí la intención es un dato; el análisis estático de
 * `inventario-de-rutas.mjs` sólo **contrasta** y falla si discrepan.
 *
 * Añadir una ruta pública es un acto deliberado y visible en el diff.
 *
 * Categorías:
 *
 * - `publica-discover`   Lee por `lib/discover/service.ts`, cuyo `PUBLIC_WHERE`
 *                        exige `classification: 'public'` Y `status: 'approved'`
 *                        en las consultas de nivel superior. ADR-024 §3: «the
 *                        single path every public route reads». **No se ha
 *                        comprobado que cada relación incluida (program, tags,
 *                        autor, variantes) lleve el mismo filtro**; eso es parte
 *                        de la frontera de RBAC, no de este manifiesto.
 * - `publica-sin-datos`  **GET sin lectura de datos observada** (inspección del
 *                        2026-08-28). No es una fuente normativa: si mañana la
 *                        portada incorpora contenido, la clase cambia.
 * - `flujo-auth`         Es el propio flujo de autenticación.
 * - `firma`              Se autentica por firma, no por sesión.
 * - `requiere-sesion`    Debe exigir sesión antes de servir.
 *
 * **Esto NO es la frontera de autorización.** `proxy.ts` y `SECURITY.md` §2 son
 * explícitos: la frontera es el servicio único de RBAC que atraviesa toda
 * lectura o escritura de datos gobernados. Este manifiesto declara *intención de
 * acceso por ruta*; que los datos estén protegidos es otra propiedad y otro
 * control.
 */

export const RUTAS = {
  // — Públicas que leen por el camino público —
  "/discover": { clase: "publica-discover", razon: "Índice de Discover. ADR-024 §3." },
  "/products/[slug]": { clase: "publica-discover", razon: "Detalle de producto aprobado y público." },
  "/projects/[slug]": { clase: "publica-discover", razon: "Detalle de proyecto aprobado y público." },
  "/experiences/[slug]": { clase: "publica-discover", razon: "Detalle de experiencia aprobada y pública." },
  "/stories/[slug]": { clase: "publica-discover", razon: "Detalle de historia aprobada y pública." },
  "/locations/[slug]": { clase: "publica-discover", razon: "Detalle de lugar aprobado y público." },

  // — Públicas que no leen datos —
  "/": { clase: "publica-sin-datos", razon: "GET sin lectura de datos observada (2026-08-28): sólo traducciones." },
  "/login": { clase: "publica-sin-datos", razon: "GET sin lectura de datos observada: traducciones y una acción importada, ninguna consulta." },
  "/signup": { clase: "publica-sin-datos", razon: "GET sin lectura de datos observada: traducciones y una acción importada, ninguna consulta." },

  // — Autenticación y firma —
  "/api/auth/[...nextauth]": { clase: "flujo-auth", razon: "Handler de Auth.js. Exigirle sesión sería imposible de satisfacer." },
  "/api/webhooks/stripe": { clase: "firma", razon: "Stripe se autentica por firma del webhook, no por sesión." },

  // — Todo lo demás exige sesión —
  "/admin/users": { clase: "requiere-sesion", razon: "Administración de usuarios y permisos." },
  "/ai": { clase: "requiere-sesion", razon: "Asistente sobre datos del titular." },
  "/api/export": { clase: "requiere-sesion", razon: "Descarga de datos. Responde 401/403, no redirige: es una descarga." },
  "/api/v1/devices": { clase: "requiere-sesion", razon: "P4 §1. Registra un aparato que sincronizará. Responde 401 en JSON, no redirige: la llama un cliente, no un navegador que navega." },
  "/api/v1/sync/field-events": { clase: "requiere-sesion", razon: "P4 §4. Push por lotes. 401 en JSON; 200 aunque haya rechazos, porque un rechazo es respuesta del protocolo y no fallo de la petición." },
  "/api/v1/sync/authorization": { clase: "requiere-sesion", razon: "P4 §8. Instantánea de autorización firmada. Decide qué OFRECE la interfaz; la autorización real sigue siendo can() en cada mutación." },
  "/api/v1/sync/field-media": { clase: "requiere-sesion", razon: "P4 §7. Cola de medios en dos pasos: firma una URL y luego registra el Asset y su FieldEvent. El servidor nunca sostiene los bytes." },
  "/api/v1/sync/field-work": { clase: "requiere-sesion", razon: "P4 §5. Pull por cursor. El ámbito lo resuelve el servidor contra el RBAC, no lo pide el aparato." },
  "/apiaries": { clase: "requiere-sesion", razon: "Operación de apiarios." },
  "/apiaries/[id]": { clase: "requiere-sesion", razon: "Operación de apiarios." },
  "/apiaries/[id]/hives/[hiveId]": { clase: "requiere-sesion", razon: "Operación de apiarios." },
  "/bookings/success": { clase: "requiere-sesion", razon: "Confirmación de una reserva del titular." },
  "/calibration": { clase: "requiere-sesion", razon: "Calibración sensorial." },
  "/calibration/[calibrationSessionId]": { clase: "requiere-sesion", razon: "Calibración sensorial." },
  "/cart": { clase: "requiere-sesion", razon: "Carrito del titular." },
  "/checkout/success": { clase: "requiere-sesion", razon: "Confirmación de compra del titular." },
  "/competitions": { clase: "requiere-sesion", razon: "Gestión de competencias." },
  "/competitions/[editionId]": { clase: "requiere-sesion", razon: "Gestión de competencias." },
  "/content": { clase: "requiere-sesion", razon: "Autoría de contenido, incluido el no aprobado." },
  "/content/new": { clase: "requiere-sesion", razon: "Autoría de contenido." },
  "/content/[id]": { clase: "requiere-sesion", razon: "Autoría de contenido." },
  "/lots": { clase: "requiere-sesion", razon: "Trazabilidad de lotes." },
  "/lots/new": { clase: "requiere-sesion", razon: "Trazabilidad de lotes." },
  "/lots/[id]": { clase: "requiere-sesion", razon: "Trazabilidad de lotes." },
  "/lots/[id]/report": { clase: "requiere-sesion", razon: "Informe de lote." },
  "/lots/[id]/drying/new": { clase: "requiere-sesion", razon: "Operación sobre un lote." },
  "/lots/[id]/fermentation/new": { clase: "requiere-sesion", razon: "Operación sobre un lote." },
  "/lots/[id]/samples/new": { clase: "requiere-sesion", razon: "Operación sobre un lote." },
  "/lots/[id]/storage/new": { clase: "requiere-sesion", razon: "Operación sobre un lote." },
  "/my-nectar": { clase: "requiere-sesion", razon: "Espacio del titular. Único prefijo que además gatea `proxy.ts`." },
  "/partner": { clase: "requiere-sesion", razon: "Espacio de socios, por asignación." },
  "/partner/[projectId]": { clase: "requiere-sesion", razon: "Espacio de socios, por asignación." },
  "/plots": { clase: "requiere-sesion", razon: "Parcelas de finca." },
  "/plots/[id]": { clase: "requiere-sesion", razon: "Lo sembrado en una parcela." },
  "/biochar": { clase: "requiere-sesion", razon: "Lotes de biochar producidos en la finca." },
  "/biochar/[id]": { clase: "requiere-sesion", razon: "Un lote de biochar y su registro de quema." },
  "/field-sessions/[id]": { clase: "requiere-sesion", razon: "Una jornada de campo y su hilo de eventos." },
  "/recipes": { clase: "requiere-sesion", razon: "Recetas y formulación." },
  "/recipes/new": { clase: "requiere-sesion", razon: "Recetas y formulación." },
  "/recipes/[id]": { clase: "requiere-sesion", razon: "Recetas y formulación." },
  "/research": { clase: "requiere-sesion", razon: "Protocolos de investigación." },
  "/research/new": { clase: "requiere-sesion", razon: "Protocolos de investigación." },
  "/research/[protocolId]": { clase: "requiere-sesion", razon: "Protocolos de investigación." },
  "/research/execute/[protocolVersionId]": { clase: "requiere-sesion", razon: "Ejecución de un protocolo." },
  "/research/treatments/[id]": { clase: "requiere-sesion", razon: "Tratamientos de investigación." },
  "/sensory": { clase: "requiere-sesion", razon: "Evaluación sensorial, incluida la ciega." },
  "/sensory/[sessionId]": { clase: "requiere-sesion", razon: "Evaluación sensorial." },
  "/start": { clase: "requiere-sesion", razon: "Aterrizaje tras iniciar sesión." },
};

// Las clases válidas las valida `inventario-de-rutas.mjs`; no se exporta una
// segunda lista que pudiera desincronizarse en silencio.
