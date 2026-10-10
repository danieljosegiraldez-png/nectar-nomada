"use client";

import { useActionState, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import { actualizarPasoAction, agregarPasoAction, type TraceabilityActionState } from "../../actions/traceability";
import type { CatalogosDelEditor, ValorDeCatalogo } from "../../../lib/recetas/catalogosDelEditor";
import { MAX_FILAS, type PasoInicial } from "../../../lib/recetas/formularioDePaso";
import type { ReferenciaDelPaquete } from "../../../lib/recetas/referencias";
import {
  EJES_POR_TIPO_DE_PASO,
  FASE_DEL_TIPO,
  TRAMOS_DE_MUCILAGO,
  type EjeDelPaso,
  type TipoDePaso,
} from "../../../lib/recetas/vocabulario";

const initialState: TraceabilityActionState = {};

/**
 * Un sinónimo del paquete que apunta a un valor de catálogo — sólo para MOSTRAR (I7: un alias no cruza catálogos). Es la forma de cada fila de
 * `SINONIMOS_ENTRE_CATALOGOS` (`lib/recetas/referencias.ts`, tarea 2): `catalogo` es la clave del catálogo del valor, `valor` el valor al que apunta.
 */
export interface SinonimoDelPaquete {
  termino: string;
  catalogo: string;
  valor: string;
}

/** Una variable que se puede medir, con su unidad canónica y sus límites físicos (`listVariableDefinitions`). */
export interface VariableChoice {
  variable: string;
  canonicalUnit: string;
  min: number;
  max: number;
}

/** Un tipo de paso que se puede elegir: el id de su valor de catálogo, el tipo del vocabulario y su rótulo ya traducido. */
export interface TipoElegible {
  id: string;
  tipo: TipoDePaso;
  etiqueta: string;
}

interface FilaDeAdicion {
  key: number;
  categoriaValueId: string;
  cantidad: string;
  unidad: string;
  momento: "pre_green" | "post_green";
}

interface FilaDeFin {
  key: number;
  variable: string;
  operador: "gte" | "lte";
  valor: string;
  /** La lectura de cierre de la que salió la condición (diseño §5.3): no se enseña, pero se REENVÍA. */
  desdeLecturaId: string;
}

interface FilaDeMeta {
  key: number;
  variable: string;
  moment: "initial" | "during" | "final";
  targetValue: string;
  minValue: string;
  maxValue: string;
  /** Cada cuántas horas medir. Sólo aplica a `moment: "during"`. */
  everyHours: string;
  note: string;
}

/**
 * El formulario de UN paso de un borrador — diseño §6. Parte 2a, tarea 14 (2026-10-03).
 *
 * **Primero el tipo, y sólo aparecen los datos que le aplican** (`EJES_POR_TIPO_DE_PASO`, que es inferencia de la casa y no del paquete: tarea 2). Un
 * eje que el tipo no admite no se pinta, y el servicio lo rechazaría igual (`eje_no_aplica`). El volteo y la banda de humedad son del secado.
 *
 * **Las referencias del paquete se ENSEÑAN, no se precargan.** `ReferenciaDelPaquete.valor` es texto («3–4 turns/day»); volverlo un campo
 * («voltear cada 6 h») sería una cifra que el paquete no dio. Cada una lleva su fuente, su confianza y —si `marcarVisible`— la marca de lo que hay que verificar
 * (`low` y `NN`), y las alternativas de otras autoridades a la vista: nunca se elige una en silencio. La receta decide; los campos nacen vacíos. Y, bajo su fila,
 * la NOTA del paquete (I6): a veces es la salvedad que impide leer la referencia como un hecho.
 *
 * **El mucílago es lo que QUEDA, en seis tramos** (Ruling M: 0 = Lavado, 100 = Honey): un desplegable, no un número libre. **Los sinónimos del paquete** (I7) salen en la
 * ayuda del eje cuyo catálogo es el de su destino. **En una recepción** (I9) las metas llevan `brix` e «inicial» fijos y es una sola: es lo único que la recepción compara.
 *
 * **Editar no puede perder datos.** Todo campo del paso se precarga (`inicial`), y la lectura de cierre de cada condición de fin se reenvía en un campo
 * oculto aunque no se enseñe: sin eso, guardar sin tocar nada se la llevaba. `tests/arquitectura/campos-con-dos-puertas.test.ts` exige que cada campo de `PasoEditable`
 * esté aquí.
 */
function CuerpoDelFormulario({
  modo,
  recipeId,
  recipeVersionId,
  despuesDeSeq,
  stepId,
  inicial,
  tipos,
  catalogos,
  modosDeSecado,
  variables,
  referencias,
  sinonimos,
  soloLectura = false,
}: {
  modo: "agregar" | "editar";
  recipeId: string;
  recipeVersionId: string;
  /** Sólo al agregar: detrás de qué paso va (`null` o ausente = al principio). */
  despuesDeSeq?: number | null;
  /** Sólo al editar: qué paso es. */
  stepId?: string;
  inicial: PasoInicial;
  tipos: TipoElegible[];
  catalogos: CatalogosDelEditor;
  /** Los valores de `DryingEnvironment`, ya rotulados por la página (su rótulo vive en otro espacio de textos). */
  modosDeSecado: { valor: string; etiqueta: string }[];
  variables: VariableChoice[];
  referencias: Partial<Record<TipoDePaso, readonly ReferenciaDelPaquete[]>>;
  /** Los sinónimos del paquete (I7), todos: cada eje enseña los de su catálogo. */
  sinonimos: readonly SinonimoDelPaquete[];
  /** El paso de una versión que ya no es un borrador (publicada o del historial): se VE entero y no se envía. Sin botón de guardar y sin botones de filas; lo deshabilita `FormularioDePaso`. */
  soloLectura?: boolean;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(modo === "agregar" ? agregarPasoAction : actualizarPasoAction, initialState);

  const [tipoId, setTipoId] = useState(inicial.stepTypeValueId);
  const [adiciones, setAdiciones] = useState<FilaDeAdicion[]>(inicial.adiciones.map((a, i) => ({ ...a, key: i + 1 })));
  const [fines, setFines] = useState<FilaDeFin[]>(inicial.fines.map((f, i) => ({ ...f, key: i + 1 })));
  const [metas, setMetas] = useState<FilaDeMeta[]>(inicial.metas.map((m, i) => ({ ...m, key: i + 1 })));
  // Las claves de las filas nuevas empiezan en 1000: no chocan con las de las precargadas (1…n).
  const [siguienteClave, setSiguienteClave] = useState(1000);
  const nuevaClave = (): number => {
    setSiguienteClave((k) => k + 1);
    return siguienteClave;
  };

  const tipo: TipoDePaso | null = tipos.find((x) => x.id === tipoId)?.tipo ?? null;
  const ejes: readonly EjeDelPaso[] = tipo === null ? [] : EJES_POR_TIPO_DE_PASO[tipo];
  const esSecado = tipo !== null && FASE_DEL_TIPO[tipo] === "drying";
  const refs: readonly ReferenciaDelPaquete[] = tipo === null ? [] : (referencias[tipo] ?? []);
  // «Ninguno» («Sin ingrediente añadido») es un valor del catálogo, no una categoría de lo que se añade: se filtra aquí, en el selector, y el vocabulario lo conserva.
  const categoriasDeAdicion: ValorDeCatalogo[] = (tipo === "inoculation" ? [...catalogos.sustrato, ...catalogos.levadura] : catalogos.sustrato).filter(
    (c) => c.value !== "ninguno",
  );
  const esRecepcion = tipo === "reception";
  // I9 (diseño §4.5): en una recepción la meta es el Brix inicial, y sólo ésa. `variableDe` y `momentoDe` son lo que se pinta Y lo que se manda, vengan como vengan las filas guardadas.
  const variableDe = (m: FilaDeMeta): string => (esRecepcion ? "brix" : m.variable);
  const momentoDe = (m: FilaDeMeta): FilaDeMeta["moment"] => (esRecepcion ? "initial" : m.moment);

  const unidadDe = (variable: string): string => variables.find((v) => v.variable === variable)?.canonicalUnit ?? "";
  const limitesDe = (variable: string) => variables.find((v) => v.variable === variable);
  // Las 34 variables del panel «proceso de café» tienen texto en los dos idiomas (`tests/recetas/etiquetasDeVariables.test.ts` lo exige).
  const etiquetaDeVariable = (variable: string): string => t(`variable_${variable}` as "variable_ph");

  // I7: de qué catálogos ofrece valores cada eje. Son los de `CATALOGOS_DEL_EDITOR`, escritos aquí porque ese módulo lee la base y no puede entrar en un componente de cliente;
  // `componentesDelEditor.test.ts` comprueba que cada sinónimo real del paquete cae en un eje que lo enseña.
  const catalogosDelEje = (eje: EjeDelPaso): readonly string[] => {
    if (eje === "medio") return ["medio_lavado"];
    if (eje === "fuenteMicrobiana") return ["fuente_microbiana"];
    if (eje === "adiciones") return tipo === "inoculation" ? ["sustrato_anadido", "levadura_cultivo"] : ["sustrato_anadido"];
    return [];
  };
  const ayudaDeSinonimos = (eje: EjeDelPaso) => {
    const delEje = sinonimos.filter((s) => catalogosDelEje(eje).includes(s.catalogo));
    if (delEje.length === 0) return null;
    return (
      <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85em" }}>
        {t("recetaEditor_sinonimosAyuda", { lista: delEje.map((s) => `«${s.termino}» → ${s.valor}`).join(" · ") })}
      </p>
    );
  };

  const cambiarAdicion = (key: number, cambio: Partial<FilaDeAdicion>) =>
    setAdiciones((filas) => filas.map((f) => (f.key === key ? { ...f, ...cambio } : f)));
  const cambiarFin = (key: number, cambio: Partial<FilaDeFin>) => setFines((filas) => filas.map((f) => (f.key === key ? { ...f, ...cambio } : f)));
  const cambiarMeta = (key: number, cambio: Partial<FilaDeMeta>) => setMetas((filas) => filas.map((f) => (f.key === key ? { ...f, ...cambio } : f)));

  const desplegable = (nombre: string, etiqueta: string, valores: readonly ValorDeCatalogo[], idInicial: string) => (
    <div className="nn-field">
      <label htmlFor={`paso-${nombre}`}>{etiqueta}</label>
      <select id={`paso-${nombre}`} name={nombre} defaultValue={idInicial}>
        <option value="">{t("recetaEditor_sinDeclarar")}</option>
        {valores.map((v) => (
          <option key={v.id} value={v.id} title={v.definition ?? undefined}>
            {v.value}
          </option>
        ))}
      </select>
    </div>
  );

  const numero = (
    nombre: string,
    etiqueta: string,
    valorInicial: string,
    limites: { min?: number; max?: number; step: number | "any" },
  ) => (
    <div className="nn-field" style={{ flex: "1 1 140px" }}>
      <label htmlFor={`paso-${nombre}`}>{etiqueta}</label>
      <CampoNumerico
        id={`paso-${nombre}`}
        name={nombre}
        defaultValue={valorInicial}
        min={limites.min}
        max={limites.max}
        step={limites.step}
        inputMode={limites.step === "any" ? "decimal" : "numeric"}
      />
    </div>
  );

  const marcasDe = (r: ReferenciaDelPaquete): string[] => {
    const marcas: string[] = [];
    if (r.confianza === "low") marcas.push(t("recetaEditor_refBaja"));
    if (/\bNN\b/.test(r.fuente)) marcas.push(t("recetaEditor_refNN"));
    return marcas;
  };
  const confianza = { high: t("recetaEditor_confianza_high"), medium: t("recetaEditor_confianza_medium"), low: t("recetaEditor_confianza_low") };
  const caja = { border: "1px solid var(--nn-border)", borderRadius: 6, padding: "0.75rem", marginBottom: "0.75rem" } as const;
  const fila = { display: "flex", gap: "0.5rem", flexWrap: "wrap" } as const;
  const titulo = { marginTop: "1.5rem", marginBottom: "0.25rem" } as const;

  return (
    <form className="nn-form" action={formAction} style={{ maxWidth: 760 }}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="recipeVersionId" value={recipeVersionId} />
      {modo === "agregar" ? <input type="hidden" name="despuesDeSeq" value={despuesDeSeq ?? ""} /> : null}
      {modo === "editar" && stepId ? <input type="hidden" name="stepId" value={stepId} /> : null}

      <div className="nn-field">
        <label htmlFor="paso-tipo">{t("recetaEditor_tipoLabel")}</label>
        <select
          id="paso-tipo"
          name="stepTypeValueId"
          required
          value={tipoId}
          onChange={(e) => {
            const id = e.target.value;
            setTipoId(id);
            // I9: al pasar a una recepción, de las metas que hubiera sólo cabe una, y es la del Brix inicial.
            if (tipos.find((x) => x.id === id)?.tipo === "reception") {
              setMetas((filas) => filas.slice(0, 1).map((m) => ({ ...m, variable: "brix", moment: "initial", everyHours: "" })));
            }
          }}
        >
          <option value="" disabled>
            {t("recetaEditor_tipoElige")}
          </option>
          {tipos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {tipo === null ? (
        <p className="nn-muted">{t("recetaEditor_tipoPrimero")}</p>
      ) : (
        <>
          <div className="nn-field">
            <label htmlFor="paso-intencion">{t("recetaEditor_intencionLabel")}</label>
            <input id="paso-intencion" name="intencion" maxLength={300} defaultValue={inicial.intencion} />
          </div>
          <div className="nn-field">
            <label>
              <input type="checkbox" name="opcional" defaultChecked={inicial.opcional} /> {t("recetaEditor_opcionalLabel")}
            </label>
          </div>

          <h3 style={titulo}>{t("recetaEditor_ejesHeading")}</h3>
          {ejes.length === 0 ? <p className="nn-muted">{t("recetaEditor_sinEjes")}</p> : null}
          {ejes.includes("estadoFruto")
            ? desplegable("estadoFrutoValueId", t("recetaEditor_eje_estadoFruto"), catalogos.estadoFruto, inicial.estadoFrutoValueId)
            : null}
          {ejes.includes("mucilagoObjetivo") ? (
            <>
              <div className="nn-field">
                <label htmlFor="paso-mucilagoObjetivo">{t("recetaEditor_eje_mucilagoObjetivo")}</label>
                <select id="paso-mucilagoObjetivo" name="mucilagoObjetivo" defaultValue={inicial.mucilagoObjetivo}>
                  <option value="">{t("recetaEditor_sinDeclarar")}</option>
                  {TRAMOS_DE_MUCILAGO.map((pct) => (
                    <option key={pct} value={pct}>
                      {pct === 0
                        ? t("recetaEditor_mucilagoLavado")
                        : pct === 100
                          ? t("recetaEditor_mucilagoHoney")
                          : t("recetaEditor_mucilagoTramo", { pct })}
                    </option>
                  ))}
                </select>
              </div>
              <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85em" }}>
                {t("recetaEditor_mucilagoHint")}
              </p>
            </>
          ) : null}
          {ejes.includes("oxigeno") ? desplegable("oxigenoValueId", t("recetaEditor_eje_oxigeno"), catalogos.oxigeno, inicial.oxigenoValueId) : null}
          {ejes.includes("temperatura") ? (
            <>
              {desplegable("temperaturaValueId", t("recetaEditor_eje_temperatura"), catalogos.temperatura, inicial.temperaturaValueId)}
              <div style={fila}>
                {numero("temperaturaMinC", t("recetaEditor_temperaturaMin"), inicial.temperaturaMinC, { step: "any" })}
                {numero("temperaturaMaxC", t("recetaEditor_temperaturaMax"), inicial.temperaturaMaxC, { step: "any" })}
              </div>
            </>
          ) : null}
          {ejes.includes("fuenteMicrobiana") ? (
            <>
              {desplegable("fuenteMicrobianaValueId", t("recetaEditor_eje_fuenteMicrobiana"), catalogos.fuenteMicrobiana, inicial.fuenteMicrobianaValueId)}
              {ayudaDeSinonimos("fuenteMicrobiana")}
            </>
          ) : null}
          {ejes.includes("medio") ? (
            <>
              {desplegable("medioValueId", t("recetaEditor_eje_medio"), catalogos.medio, inicial.medioValueId)}
              {ayudaDeSinonimos("medio")}
            </>
          ) : null}
          {ejes.includes("fisico") ? desplegable("fisicoValueId", t("recetaEditor_eje_fisico"), catalogos.fisico, inicial.fisicoValueId) : null}
          {ejes.includes("modoSecado") ? (
            <div className="nn-field">
              <label htmlFor="paso-modoSecado">{t("recetaEditor_eje_modoSecado")}</label>
              <select id="paso-modoSecado" name="modoSecado" defaultValue={inicial.modoSecado}>
                <option value="">{t("recetaEditor_sinDeclarar")}</option>
                {modosDeSecado.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {ejes.includes("adiciones") ? (
            <>
              <h3 style={titulo}>{t("recetaEditor_adicionesHeading")}</h3>
              <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
                {t("recetaEditor_adicionesIntro")}
              </p>
              {ayudaDeSinonimos("adiciones")}
              {adiciones.map((a, i) => (
                <div key={a.key} style={caja}>
                  <div style={fila}>
                    <div className="nn-field" style={{ flex: "1 1 200px" }}>
                      <label htmlFor={`adicion-c-${a.key}`}>{t("recetaEditor_adicionCategoria")}</label>
                      <select
                        id={`adicion-c-${a.key}`}
                        name={`adiciones[${i}][categoriaValueId]`}
                        required
                        value={a.categoriaValueId}
                        onChange={(e) => cambiarAdicion(a.key, { categoriaValueId: e.target.value })}
                      >
                        <option value="" disabled>
                          {t("recetaEditor_sinDeclarar")}
                        </option>
                        {categoriasDeAdicion.map((c) => (
                          <option key={c.id} value={c.id} title={c.definition ?? undefined}>
                            {c.value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field" style={{ flex: "1 1 110px" }}>
                      <label htmlFor={`adicion-n-${a.key}`}>{t("recetaEditor_adicionCantidad")}</label>
                      <CampoNumerico
                        id={`adicion-n-${a.key}`}
                        name={`adiciones[${i}][cantidad]`}
                        step="any"
                        min={0}
                        inputMode="decimal"
                        value={a.cantidad}
                        onChange={(e) => cambiarAdicion(a.key, { cantidad: e.target.value })}
                      />
                    </div>
                    <div className="nn-field" style={{ flex: "1 1 90px" }}>
                      <label htmlFor={`adicion-u-${a.key}`}>{t("recetaEditor_adicionUnidad")}</label>
                      <input
                        id={`adicion-u-${a.key}`}
                        name={`adiciones[${i}][unidad]`}
                        maxLength={20}
                        value={a.unidad}
                        onChange={(e) => cambiarAdicion(a.key, { unidad: e.target.value })}
                      />
                    </div>
                    <div className="nn-field" style={{ flex: "1 1 150px" }}>
                      <label htmlFor={`adicion-m-${a.key}`}>{t("recetaEditor_adicionMomento")}</label>
                      <select
                        id={`adicion-m-${a.key}`}
                        name={`adiciones[${i}][momento]`}
                        value={a.momento}
                        onChange={(e) => cambiarAdicion(a.key, { momento: e.target.value === "post_green" ? "post_green" : "pre_green" })}
                      >
                        <option value="pre_green">{t("recetaEditor_momento_pre_green")}</option>
                        <option value="post_green">{t("recetaEditor_momento_post_green")}</option>
                      </select>
                    </div>
                  </div>
                  {soloLectura ? null : (
                    <button type="button" className="nn-button-quiet" onClick={() => setAdiciones((filas) => filas.filter((f) => f.key !== a.key))}>
                      {t("recipeRemoveTarget")}
                    </button>
                  )}
                </div>
              ))}
              {soloLectura ? null : (
                <button
                  type="button"
                  className="nn-button-quiet"
                  disabled={adiciones.length >= MAX_FILAS}
                  onClick={() => setAdiciones((filas) => [...filas, { key: nuevaClave(), categoriaValueId: "", cantidad: "", unidad: "", momento: "pre_green" }])}
                >
                  {t("recetaEditor_adicionAnadir")}
                </button>
              )}
            </>
          ) : null}

          <h3 style={titulo}>{t("recetaEditor_defaultsHeading")}</h3>
          <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
            {t("recetaEditor_defaultsIntro")}
          </p>
          <div style={fila}>
            {numero("horasMin", t("recetaEditor_horasMin"), inicial.horasMin, { min: 1, step: 1 })}
            {numero("horasSugeridas", t("recetaEditor_horasSugeridasLabel"), inicial.horasSugeridas, { min: 1, step: 1 })}
            {numero("horasMax", t("recetaEditor_horasMax"), inicial.horasMax, { min: 1, step: 1 })}
          </div>
          {esSecado ? (
            <div style={fila}>
              {numero("volteoCadaHoras", t("recetaEditor_volteoCada"), inicial.volteoCadaHoras, { min: 1, step: 1 })}
              {numero("humedadMinPct", t("recetaEditor_humedadMin"), inicial.humedadMinPct, { min: 0, max: 100, step: "any" })}
              {numero("humedadMaxPct", t("recetaEditor_humedadMax"), inicial.humedadMaxPct, { min: 0, max: 100, step: "any" })}
            </div>
          ) : null}

          <h3 style={titulo}>{t("recetaEditor_referenciasHeading")}</h3>
          <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
            {t("recetaEditor_referenciasIntro")}
          </p>
          {refs.length === 0 ? (
            <p className="nn-muted">{t("recetaEditor_refSinReferencias")}</p>
          ) : (
            <ul style={{ paddingLeft: "1.1rem" }}>
              {refs.map((r) => {
                const marcas = marcasDe(r);
                return (
                  <li key={r.parametro} style={{ marginBottom: "0.5rem" }}>
                    <code>{r.parametro}</code>
                    {" · "}
                    <strong>{r.valor}</strong>
                    {" · "}
                    {t("recetaEditor_refFuente")}: {r.fuente}
                    {" · "}
                    {t("recetaEditor_refConfianza")}: {confianza[r.confianza]}
                    {r.marcarVisible ? (
                      <strong className="nn-error"> — {marcas.length > 0 ? marcas.join(" · ") : t("recetaEditor_refVerificar")}</strong>
                    ) : null}
                    {r.alternativas.length > 0 ? (
                      <span className="nn-muted">
                        {" "}
                        — {t("recetaEditor_refAlternativas")}: {r.alternativas.map((a) => `${a.valor} (${a.fuente})`).join(" · ")}
                      </span>
                    ) : null}
                    {r.noPrecargar ? <span className="nn-muted"> — {t("recetaEditor_refSoloReferencia")}</span> : null}
                    {/* I6: la nota del paquete, bajo su fila. Es, a veces, la salvedad que impide leer la referencia como un hecho. */}
                    {r.nota ? (
                      <div className="nn-muted" style={{ fontSize: "0.85em" }}>
                        {t("recetaEditor_refNota")}: {r.nota}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 style={titulo}>{t("recetaEditor_finHeading")}</h3>
          <div className="nn-field">
            <label>
              <input type="checkbox" name="finPorTiempo" defaultChecked={inicial.finPorTiempo} /> {t("recetaEditor_finPorTiempo")}
            </label>
            <p className="nn-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85em" }}>
              {t("recetaEditor_finPorTiempoHint")}
            </p>
          </div>
          <div className="nn-field">
            <label htmlFor="paso-reglaDeFin">{t("recetaEditor_reglaDeFin")}</label>
            <select id="paso-reglaDeFin" name="reglaDeFin" defaultValue={inicial.reglaDeFin}>
              <option value="first">{t("recetaEditor_regla_first")}</option>
              <option value="all">{t("recetaEditor_regla_all")}</option>
            </select>
          </div>
          {fines.map((f, i) => (
            <div key={f.key} style={caja}>
              <input type="hidden" name={`fines[${i}][unidad]`} value={unidadDe(f.variable)} />
              <input type="hidden" name={`fines[${i}][desdeLecturaId]`} value={f.desdeLecturaId} />
              <div style={fila}>
                <div className="nn-field" style={{ flex: "1 1 200px" }}>
                  <label htmlFor={`fin-v-${f.key}`}>{t("recipeVariableLabel")}</label>
                  <select
                    id={`fin-v-${f.key}`}
                    name={`fines[${i}][variable]`}
                    value={f.variable}
                    // Otra variable es otra condición: la lectura de cierre de la anterior ya no la respalda.
                    onChange={(e) => cambiarFin(f.key, { variable: e.target.value, desdeLecturaId: "" })}
                  >
                    {variables.map((v) => (
                      <option key={v.variable} value={v.variable}>
                        {etiquetaDeVariable(v.variable)} ({v.canonicalUnit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nn-field" style={{ flex: "1 1 160px" }}>
                  <label htmlFor={`fin-o-${f.key}`}>{t("recetaEditor_finOperador")}</label>
                  <select
                    id={`fin-o-${f.key}`}
                    name={`fines[${i}][operador]`}
                    value={f.operador}
                    onChange={(e) => cambiarFin(f.key, { operador: e.target.value === "gte" ? "gte" : "lte" })}
                  >
                    <option value="gte">{t("recetaEditor_operador_gte")}</option>
                    <option value="lte">{t("recetaEditor_operador_lte")}</option>
                  </select>
                </div>
                <div className="nn-field" style={{ flex: "1 1 120px" }}>
                  <label htmlFor={`fin-x-${f.key}`}>{t("recetaEditor_finValor")}</label>
                  <CampoNumerico
                    id={`fin-x-${f.key}`}
                    name={`fines[${i}][valor]`}
                    step="any"
                    required
                    inputMode="decimal"
                    value={f.valor}
                    onChange={(e) => cambiarFin(f.key, { valor: e.target.value })}
                  />
                </div>
              </div>
              {soloLectura ? null : (
                <button type="button" className="nn-button-quiet" onClick={() => setFines((filas) => filas.filter((x) => x.key !== f.key))}>
                  {t("recipeRemoveTarget")}
                </button>
              )}
            </div>
          ))}
          {soloLectura ? null : (
            <button
              type="button"
              className="nn-button-quiet"
              disabled={fines.length >= MAX_FILAS}
              onClick={() =>
                setFines((filas) => [
                  ...filas,
                  { key: nuevaClave(), variable: variables.find((v) => v.variable === "ph")?.variable ?? variables[0]?.variable ?? "", operador: "lte", valor: "", desdeLecturaId: "" },
                ])
              }
            >
              {t("recetaEditor_finAnadir")}
            </button>
          )}

          <h3 style={titulo}>{t("recetaEditor_capacidadesHeading")}</h3>
          <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
            {t("recetaEditor_capacidadesIntro")}
          </p>
          {catalogos.capacidad.map((c) => (
            <label key={c.id} style={{ display: "block" }} title={c.definition ?? undefined}>
              <input type="checkbox" name="capacidadesRequeridas" value={c.id} defaultChecked={inicial.capacidadesRequeridas.includes(c.id)} /> {c.value}
            </label>
          ))}

          <h3 style={titulo}>{t("recetaEditor_metasHeading")}</h3>
          <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
            {t("recetaEditor_metasIntro")}
          </p>
          {esRecepcion ? (
            <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
              {t("recetaEditor_metasDeRecepcionAyuda")}
            </p>
          ) : null}
          {metas.map((m, i) => {
            const variableFila = variableDe(m);
            const momentoFila = momentoDe(m);
            const b = limitesDe(variableFila);
            return (
              <div key={m.key} style={caja}>
                {/* La unidad viaja con la variable y no se teclea: una meta de pH no se puede guardar en Brix. */}
                <input type="hidden" name={`metas[${i}][unit]`} value={unidadDe(variableFila)} />
                {esRecepcion ? (
                  <>
                    {/* I9: la recepción sólo compara el Brix inicial. Se manda fijo, sin desplegables. */}
                    <input type="hidden" name={`metas[${i}][variable]`} value="brix" />
                    <input type="hidden" name={`metas[${i}][moment]`} value="initial" />
                    <p style={{ margin: "0 0 0.5rem" }}>
                      <strong>{etiquetaDeVariable("brix")}</strong> · {t("moment_initial")}
                    </p>
                  </>
                ) : (
                  <div style={fila}>
                    <div className="nn-field" style={{ flex: "1 1 200px" }}>
                      <label htmlFor={`meta-v-${m.key}`}>{t("recipeVariableLabel")}</label>
                      <select
                        id={`meta-v-${m.key}`}
                        name={`metas[${i}][variable]`}
                        value={m.variable}
                        onChange={(e) => cambiarMeta(m.key, { variable: e.target.value })}
                      >
                        {variables.map((v) => (
                          <option key={v.variable} value={v.variable}>
                            {etiquetaDeVariable(v.variable)} ({v.canonicalUnit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field" style={{ flex: "1 1 150px" }}>
                      <label htmlFor={`meta-m-${m.key}`}>{t("recipeMomentLabel")}</label>
                      <select
                        id={`meta-m-${m.key}`}
                        name={`metas[${i}][moment]`}
                        value={m.moment}
                        onChange={(e) => {
                          const momento = e.target.value as FilaDeMeta["moment"];
                          cambiarMeta(m.key, momento === "during" ? { moment: momento } : { moment: momento, everyHours: "" });
                        }}
                      >
                        <option value="initial">{t("moment_initial")}</option>
                        <option value="during">{t("moment_during")}</option>
                        <option value="final">{t("moment_final")}</option>
                      </select>
                    </div>
                  </div>
                )}
                <div style={fila}>
                  <div className="nn-field" style={{ flex: "1 1 120px" }}>
                    <label htmlFor={`meta-t-${m.key}`}>{t("recipeTargetValueLabel")}</label>
                    <CampoNumerico
                      id={`meta-t-${m.key}`}
                      name={`metas[${i}][targetValue]`}
                      step="any"
                      min={b?.min}
                      max={b?.max}
                      value={m.targetValue}
                      onChange={(e) => cambiarMeta(m.key, { targetValue: e.target.value })}
                    />
                  </div>
                  <div className="nn-field" style={{ flex: "1 1 120px" }}>
                    <label htmlFor={`meta-min-${m.key}`}>{t("recipeMinLabel")}</label>
                    <CampoNumerico
                      id={`meta-min-${m.key}`}
                      name={`metas[${i}][minValue]`}
                      step="any"
                      min={b?.min}
                      max={b?.max}
                      value={m.minValue}
                      onChange={(e) => cambiarMeta(m.key, { minValue: e.target.value })}
                    />
                  </div>
                  <div className="nn-field" style={{ flex: "1 1 120px" }}>
                    <label htmlFor={`meta-max-${m.key}`}>{t("recipeMaxLabel")}</label>
                    <CampoNumerico
                      id={`meta-max-${m.key}`}
                      name={`metas[${i}][maxValue]`}
                      step="any"
                      min={b?.min}
                      max={b?.max}
                      value={m.maxValue}
                      onChange={(e) => cambiarMeta(m.key, { maxValue: e.target.value })}
                    />
                  </div>
                </div>
                {/* Sólo con `during`: un objetivo inicial o final ocurre una vez, y el servicio rechaza un ritmo ahí. Se oculta y se limpia. */}
                {momentoFila === "during" ? (
                  <div className="nn-field">
                    <label htmlFor={`meta-cada-${m.key}`}>{t("recipeEveryHoursLabel")}</label>
                    <CampoNumerico
                      id={`meta-cada-${m.key}`}
                      name={`metas[${i}][everyHours]`}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={t("recipeEveryHoursPlaceholder")}
                      value={m.everyHours}
                      onChange={(e) => cambiarMeta(m.key, { everyHours: e.target.value })}
                    />
                    <p className="nn-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85em" }}>
                      {t("recipeEveryHoursHint")}
                    </p>
                  </div>
                ) : null}
                <div className="nn-field">
                  <label htmlFor={`meta-n-${m.key}`}>{t("recipeNoteLabel")}</label>
                  <input
                    id={`meta-n-${m.key}`}
                    name={`metas[${i}][note]`}
                    maxLength={200}
                    value={m.note}
                    onChange={(e) => cambiarMeta(m.key, { note: e.target.value })}
                  />
                </div>
                {b ? (
                  <p className="nn-muted" style={{ margin: 0, fontSize: "0.85em" }}>
                    {t("recipeBoundsHint", { min: b.min, max: b.max, unit: b.canonicalUnit })}
                  </p>
                ) : null}
                {soloLectura ? null : (
                  <button type="button" className="nn-button-quiet" style={{ marginTop: "0.5rem" }} onClick={() => setMetas((filas) => filas.filter((x) => x.key !== m.key))}>
                    {t("recipeRemoveTarget")}
                  </button>
                )}
              </div>
            );
          })}
          {/* I9: una recepción tiene una sola meta, la del Brix inicial: con una ya escrita no se ofrece otra. */}
          {soloLectura || (esRecepcion && metas.length >= 1) ? null : (
            <button
              type="button"
              className="nn-button-quiet"
              disabled={metas.length >= MAX_FILAS}
              onClick={() =>
                setMetas((filas) => [
                  ...filas,
                  {
                    key: nuevaClave(),
                    variable: esRecepcion ? "brix" : "ph",
                    moment: esRecepcion ? "initial" : "during",
                    targetValue: "",
                    minValue: "",
                    maxValue: "",
                    everyHours: "",
                    note: "",
                  },
                ])
              }
            >
              {t("recipeAddTarget")}
            </button>
          )}
        </>
      )}

      {state.error ? (
        <p className="nn-error" role="alert" style={{ marginTop: "1rem" }}>
          {state.error}
        </p>
      ) : null}
      {soloLectura ? null : (
        <button type="submit" className="nn-button" disabled={pending || tipo === null} style={{ marginTop: "1rem" }}>
          {pending ? t("recipeSavingButton") : modo === "agregar" ? t("recetaEditor_anadirPaso") : t("recetaEditor_guardarPaso")}
        </button>
      )}
    </form>
  );
}

/**
 * El formulario de un paso. **De sólo lectura (`soloLectura`, F1-2 de la revisión final de la Parte 2a)** se pinta DENTRO de un `<fieldset disabled>`: un control dentro de un
 * fieldset deshabilitado está deshabilitado, sea cual sea su tipo y aunque no lleve el atributo, así que no hay campo que se pueda tocar ni nada que enviar; y el cuerpo, además,
 * no pinta ningún botón. Es como se ve un paso de una versión publicada o del historial: antes sus valores sólo existían en este formulario, que exigía un borrador.
 */
export function FormularioDePaso(props: ComponentProps<typeof CuerpoDelFormulario>) {
  const formulario = <CuerpoDelFormulario {...props} />;
  if (props.soloLectura !== true) return formulario;
  return (
    <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {formulario}
    </fieldset>
  );
}
