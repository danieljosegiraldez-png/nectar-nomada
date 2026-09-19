"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { CatalogoError } from "../../lib/catalogos/propiedad";
import {
  EquipoError,
  declararPatron,
  editarDatosDeEquipo,
  informarCondicion,
  registrarEquipo,
  sitiosParaRegistrar,
  verificarInstrumento,
  type ContrasteObservado,
} from "../../lib/equipos/equipos";
import {
  DocumentoError,
  confirmarSubidaDeDocumento,
  pedirSubidaDeDocumento,
  type DestinoDeDocumento,
} from "../../lib/equipos/documentos";
import { RutinaError, crearRutina } from "../../lib/rutinas/rutinas";
import { TZ_OFFSET_FIELD, fechaDeDia, parseLocalDateTime } from "../../lib/time/localDateTime";
import { declararModoDeInstrumento } from "../../lib/equipos/modosDeInstrumento";
import type { MaterialState, ProvenanceClass } from "../../generated/prisma/client";

/**
 * Verificar un instrumento contra sus patrones.
 *
 * **Un patrón sin valor escrito se OMITE, no se envía como cero.** El agua
 * destilada vale 0 °Bx, así que un campo vacío interpretado como cero produciría
 * un contraste aprobado sobre algo que nadie miró — el mismo cero peligroso que
 * el trigger de la base evita por el otro lado. Si no queda ninguno, el servicio
 * rechaza la verificación entera.
 */
export async function verificarInstrumentoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const contrastes: ContrasteObservado[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("observado_")) continue;
    const texto = String(valor).trim();
    if (texto === "") continue;
    const n = Number(texto);
    if (!Number.isFinite(n)) continue;
    contrastes.push({ requirementId: clave.slice("observado_".length), observedValue: n });
  }

  const tempTexto = String(formData.get("ambientTempC") ?? "").trim();

  await verificarInstrumento(user.userAccountId, {
    equipmentId,
    // El desfase del dispositivo lo manda el formulario; sin él esto fallaría en
    // vez de suponer una zona. Es la trampa de husos horarios que costó nueve
    // sitios en tres módulos, y `parseLocalDateTime` es su arreglo.
    occurredAt: parseLocalDateTime(String(formData.get("occurredAt") ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? "")),
    contrastes,
    performedByPersonId: String(formData.get("performedByPersonId") ?? "") || null,
    ambientTempC: tempTexto === "" ? null : Number(tempTexto),
    note: String(formData.get("note") ?? "") || null,
  });

  revalidatePath("/equipos");
  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=verificado`);
}

/** Informar de la condición de un equipo. Exige `report_condition`, no `manage`. */
export async function informarCondicionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  await informarCondicion(user.userAccountId, {
    equipmentId,
    condition: String(formData.get("condition") ?? "operational") as
      | "operational"
      | "needs_cleaning"
      | "needs_maintenance"
      | "faulty"
      | "out_of_service",
    occurredAt: parseLocalDateTime(String(formData.get("occurredAt") ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? "")),
    note: String(formData.get("note") ?? "") || null,
  });

  revalidatePath("/equipos");
  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=condicion`);
}

/**
 * Registrar un equipo.
 *
 * **La organización sale del sitio elegido**, no de un campo aparte: un
 * fermentador en Finca Rosina pertenece a Finca Rosina, y dejar elegir las dos
 * cosas invita a una combinación imposible que después nadie sabe leer.
 *
 * **`destino` se calcula dentro del `try`, y `redirect()` se llama UNA sola vez
 * al final, fuera de cualquier `catch`** (misma forma que
 * `app/actions/modelos.ts`): así su excepción de control no se confunde con un
 * `EquipoError`/`RutinaError` real, y sólo esos dos se atrapan aquí.
 */
export async function registrarEquipoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let destino: string;
  try {
    const locationId = String(formData.get("locationId") ?? "");
    const sitios = await sitiosParaRegistrar(user.userAccountId);
    const sitio = sitios.find((s) => s.id === locationId);
    // No se confía en el `value` del desplegable: un formulario se puede reenviar
    // con otro id. Se vuelve a resolver contra los sitios que esta persona puede
    // gestionar de verdad, y si no está, `registrarEquipo` lo rechazaría igual —
    // pero aquí sale con una frase legible en vez de un `forbidden` seco.
    if (!sitio) throw new EquipoError("sitio_no_gestionable");

    const aviso = String(formData.get("checkAdvisoryHours") ?? "").trim();
    const equipo = await registrarEquipo(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? "instrument") as "vessel" | "instrument" | "tool" | "machine",
      organizationId: sitio.organizationId,
      initialLocationId: sitio.id,
      provenanceClass: String(formData.get("provenanceClass") ?? "original_record") as
        | "original_record"
        | "manufacturer_specification",
      acquisitionNote: String(formData.get("acquisitionNote") ?? "") || null,
      checkAdvisoryHours: aviso === "" ? null : Number(aviso),
      modelId: String(formData.get("modelId") ?? "") || null,
      serialNumber: String(formData.get("serialNumber") ?? "") || null,
      internalCode: String(formData.get("internalCode") ?? "") || null,
      supplierOrganizationId: String(formData.get("supplierOrganizationId") ?? "") || null,
      warrantyUntil: fechaDeDia(formData.get("warrantyUntil") as string | null, "warrantyUntil"),
    });

    revalidatePath("/equipos");
    destino = `/equipos/${equipo.id}?ok=registrado`;

    // La recomendación del modelo se convierte en rutina SÓLO si quien da de alta lo
    // deja marcado (spec §3.3): es el ajuste local, no el modelo, el que manda.
    const dias = String(formData.get("rutinaMantenimientoDias") ?? "").trim();
    if (formData.get("crearRutinaMantenimiento") === "on" && dias !== "") {
      try {
        await crearRutina(user.userAccountId, { equipmentId: equipo.id, kind: "mantenimiento", intervalDays: Number(dias) });
      } catch (error) {
        if (!(error instanceof RutinaError)) throw error;
        // El equipo ya quedó registrado: el error es sólo de la rutina, y se dice en SU ficha.
        destino = `/equipos/${equipo.id}?error=${encodeURIComponent(error.message)}`;
      }
    }
  } catch (error) {
    if (!(error instanceof EquipoError)) throw error;
    destino = `/equipos/nuevo?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

/**
 * Editar los datos de identificación de un equipo ya registrado: modelo, serie,
 * código interno, proveedor y garantía. Es una edición TOTAL del formulario —el
 * `<details>` siempre manda los cinco campos—, así que vacío significa «borra
 * esto» y no «no toques esto» (la distinción que `DatosDeEquipo` sí necesita
 * para un `PATCH` parcial no aplica a este formulario).
 */
export async function editarDatosDeEquipoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    await editarDatosDeEquipo(user.userAccountId, equipmentId, {
      modelId: String(formData.get("modelId") ?? "") || null,
      serialNumber: String(formData.get("serialNumber") ?? "") || null,
      internalCode: String(formData.get("internalCode") ?? "") || null,
      supplierOrganizationId: String(formData.get("supplierOrganizationId") ?? "") || null,
      warrantyUntil: fechaDeDia(formData.get("warrantyUntil") as string | null, "warrantyUntil"),
    });
    revalidatePath("/equipos");
    revalidatePath(`/equipos/${equipmentId}`);
    destino = `/equipos/${equipmentId}?ok=datos`;
  } catch (error) {
    if (!(error instanceof EquipoError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

/**
 * Declarar un patrón contra el que se contrasta un instrumento.
 *
 * Quien lo decide es «el jefe del beneficio con el especialista en procesos», y
 * por eso se guarda **quién** — un criterio de aceptación sin autor no se puede
 * discutir después.
 */
export async function declararPatronFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  await declararPatron(user.userAccountId, {
    equipmentId,
    label: String(formData.get("label") ?? ""),
    referenceValue: Number(String(formData.get("referenceValue") ?? "0")),
    unit: String(formData.get("unit") ?? ""),
    toleranceAbs: Number(String(formData.get("toleranceAbs") ?? "0")),
  });

  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=patron`);
}

/**
 * ADR-160 — declarar un MODO de un instrumento: sobre qué material, qué variable, y en qué
 * rango lee. Un refractómetro de miel son dos modos (Brix 58–90 y H% 12–27 sobre miel).
 *
 * **Un rango vacío es «no declarado», nunca cero.** Un mínimo leído como 0 afirmaría que el
 * aparato lee desde 0 °Bx, que en uno de mieles es falso.
 */
export async function declararModoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const numero = (clave: string) => {
    const v = String(formData.get(clave) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const variable = String(formData.get("variable") ?? "").trim();
  await declararModoDeInstrumento(user.userAccountId, {
    equipmentId,
    label: String(formData.get("label") ?? ""),
    materialState: String(formData.get("materialState") ?? "") as MaterialState,
    variable: variable === "" ? null : variable,
    rangeMin: numero("rangeMin"),
    rangeMax: numero("rangeMax"),
  });

  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=modo`);
}

/**
 * Documentos de modelo y de equipo (spec de catálogos §3.5). Dos pasos, misma
 * forma que `requestLotAssetUploadAction`/`finalizeLotAssetUploadAction`
 * (app/actions/traceability.ts): pedir la URL firmada, subir directo a R2 desde
 * el navegador, confirmar. `DocumentoError` y `CatalogoError` —el modelo puede
 * rechazar con cualquiera de las dos— se traducen a un mensaje legible; el resto
 * se relanza.
 */
export async function pedirSubidaDeDocumentoAction(
  destino: DestinoDeDocumento,
  nombre: string,
  tipo: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Equipos");
  try {
    return await pedirSubidaDeDocumento(user.userAccountId, destino, nombre, tipo);
  } catch (error) {
    if (error instanceof DocumentoError || error instanceof CatalogoError) {
      return { error: t("documentoError", { detalle: error.message }) };
    }
    throw error;
  }
}

export async function confirmarSubidaDeDocumentoAction(
  destino: DestinoDeDocumento,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  nombre: string,
  procedencia: ProvenanceClass,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Equipos");
  try {
    await confirmarSubidaDeDocumento(user.userAccountId, {
      destino,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename: nombre,
      provenanceClass: procedencia,
    });
  } catch (error) {
    if (error instanceof DocumentoError || error instanceof CatalogoError) {
      return { error: t("documentoError", { detalle: error.message }) };
    }
    throw error;
  }

  return { ok: true };
}
