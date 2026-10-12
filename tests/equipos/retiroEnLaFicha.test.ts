import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Los formularios de Retirar y Reactivar de la ficha (`/equipos/[id]`) sólo se montan para quien gestiona el equipo
 * (`puedeGestionar`, que sale de `puedeGestionarEquipo`) y sólo en el estado que les corresponde: «Retirar» mientras el
 * equipo está activo, «Reactivar» mientras está retirado. Regla de Daniel del 2026-09-27: «si no tengo un permiso, no
 * debería mostrarme botones o opciones que no debería tener». El servicio rechaza igual (`forbidden`), pero un botón que el
 * servidor va a negar es justo lo que esa regla prohíbe.
 *
 * **Y los avisos `?ok=` de las dos acciones se leen en la ficha.** `confirmacion-que-se-lee.test.ts` NO ve estas dos
 * redirecciones (las acciones de este archivo redirigen con `redirect(destino)`, no con la cadena pegada al `redirect(`),
 * y por su propia cabecera tampoco comprueba el código concreto: una confirmación sin rama en la ficha sería silenciosa.
 * El `it` de los avisos exige la PAREJA, pegada y en ese orden: `sp.ok === "<código>" ? ( <p …>{t("<clave>")}` (como el `it`
 * de los errores, que lo hace con `codigoError`). Comprobar el código y la clave por separado dejaba pasar a la ficha con las
 * dos claves intercambiadas entre sus ramas: retirar un equipo mostraba «reactivado» y la prueba seguía en verde.
 *
 * **Y los tres códigos de error nuevos tienen su rama de texto en la ficha, y el aviso «Retirado el …» se pinta.** La cadena de
 * errores de la ficha es un ternario encadenado: un código sin su rama cae a `errorModeloGenerico` («No se pudo completar:
 * equipo_en_uso»), que un operario no sabe leer. Ninguna otra guardia lo ve: `claves-de-traduccion-existen` comprueba que
 * cada `t("clave")` que la ficha pide EXISTA en los dos idiomas, no que haya una rama que la pida. El último `it` busca, para cada
 * código, la pareja `codigoError === "<código>"` seguida de su `t("<clave>")` (adyacentes: una rama que compara un código y
 * pinta el texto de otro también cae), y el aviso `{equipo.lifecycleStatus === "retired" ? …` con su `t("equipoRetiradoEl")`
 * detrás de la guarda `equipo.retiredAt` —una fila `retired` anterior al CHECK puede no tener fecha, y `mostrarFecha(null)` no
 * lanza: pinta la época en la zona del sitio, «Retirado el 1969-12-31» en Panamá, una fecha FALSA— y su texto de respaldo
 * `equipoRetiradoSinFecha`. Son expresiones con `\s*` entre las piezas: aguantan que el formateador
 * reparta la cadena en otras líneas, y no aguantan que alguien quite la rama.
 *
 * **Su límite, dicho:** comprueba que el formulario esté DENTRO de la condición, no que la condición sea la correcta; eso lo
 * sostiene el texto de la página. Hermético: sólo lee dos archivos.
 *
 * **El detector tiene su control** (el primer `it`, con fuentes sintéticas que sí y que no cumplen) y se prueba también
 * contra un formulario real que ya estaba condicionado (el de editar datos): sin eso, un cambio de formato lo dejaría
 * midiendo nada y pasando.
 */
const FICHA = "app/equipos/[id]/page.tsx";

/** La última `{puedeGestionar…` abierta antes del formulario, y si su condición se cerró (`) : null}`) antes de llegar a él. */
function condicionDelFormulario(fuente: string, accion: string): { condicion: string; cerrada: boolean } | null {
  const i = fuente.indexOf(`<form action={${accion}}`);
  if (i < 0) return null;
  const antes = fuente.slice(0, i);
  const c = antes.lastIndexOf("{puedeGestionar");
  if (c < 0) return null;
  const tramo = antes.slice(c);
  return { condicion: (tramo.split("\n")[0] ?? "").trim(), cerrada: tramo.includes(") : null}") };
}

const fuente = readFileSync(FICHA, "utf8");
const acciones = readFileSync("app/actions/equipos.ts", "utf8");

describe("los formularios de retiro de la ficha", () => {
  it("el detector distingue un formulario condicionado de uno que no lo está (control con fuentes sintéticas)", () => {
    const condicionado = "{puedeGestionar && x ? (\n<details>\n<form action={a}>";
    const suelto = "{puedeGestionar ? (\n<p>x</p>\n) : null}\n<form action={a}>";
    expect(condicionDelFormulario(condicionado, "a")).toEqual({ condicion: "{puedeGestionar && x ? (", cerrada: false });
    expect(condicionDelFormulario(suelto, "a")?.cerrada).toBe(true);
    expect(condicionDelFormulario("<form action={a}>", "a")).toBeNull();
    expect(condicionDelFormulario("{puedeGestionar ? (", "a")).toBeNull();
  });

  it("el formulario de editar datos, que ya estaba condicionado, sale condicionado (control sobre la fuente real)", () => {
    const r = condicionDelFormulario(fuente, "editarDatosDeEquipoFormAction");
    expect(r, "el detector no encontró el formulario de editar datos: ya no mide nada").not.toBeNull();
    expect(r!.cerrada).toBe(false);
  });

  it("el formulario de retirar sólo se monta para quien gestiona y mientras el equipo está activo", () => {
    const r = condicionDelFormulario(fuente, "retirarEquipoFormAction");
    expect(r, "la ficha no monta el formulario de retirar").not.toBeNull();
    expect(r!.condicion).toContain('puedeGestionar && equipo.lifecycleStatus === "active"');
    expect(r!.cerrada, "el formulario quedó FUERA de la condición de permiso").toBe(false);
  });

  it("el formulario de reactivar sólo se monta para quien gestiona y mientras el equipo está retirado", () => {
    const r = condicionDelFormulario(fuente, "reactivarEquipoFormAction");
    expect(r, "la ficha no monta el formulario de reactivar").not.toBeNull();
    expect(r!.condicion).toContain('puedeGestionar && equipo.lifecycleStatus === "retired"');
    expect(r!.cerrada, "el formulario quedó FUERA de la condición de permiso").toBe(false);
  });

  it("los avisos ?ok= de las dos acciones se leen en la ficha y se pintan con su propio texto", () => {
    for (const [codigo, clave] of [
      ["equipo_retirado", "okEquipoRetirado"],
      ["equipo_reactivado", "okEquipoReactivado"],
    ] as const) {
      expect(acciones, `la acción ya no redirige con ?ok=${codigo}`).toContain(`?ok=${codigo}`);
      // La pareja, en ese orden y pegada: `sp.ok === "<código>"` y, dentro de SU rama, `<p …>{t("<clave>")}`.
      const pareja = new RegExp(`sp\\.ok === "${codigo}"\\s*\\?\\s*\\(\\s*<p[^>]*>\\s*\\{t\\("${clave}"\\)\\s*\\}`);
      expect(fuente, `la ficha no pinta ${clave} dentro de su propia rama sp.ok === "${codigo}"`).toMatch(pareja);
    }
  });

  it("la ficha traduce los tres códigos de error del retiro, cada uno con su texto, y pinta el aviso «Retirado el …»", () => {
    for (const [codigo, clave] of [
      ["equipo_en_uso", "errorEquipoEnUso"],
      ["equipo_ya_retirado", "errorEquipoYaRetirado"],
      ["equipo_no_retirado", "errorEquipoNoRetirado"],
    ] as const) {
      // La pareja, en ese orden y pegada: `codigoError === "<código>"` y a continuación `? t("<clave>")`.
      const pareja = new RegExp(`codigoError === "${codigo}"\\s*\\?\\s*t\\("${clave}"\\)`);
      expect(fuente, `la ficha no traduce ?error=${codigo} con t("${clave}") pegado a su comparación`).toMatch(pareja);
    }
    // El aviso: dentro de `equipo.lifecycleStatus === "retired"`, con la fecha detrás de la guarda `equipo.retiredAt`...
    expect(
      fuente,
      'el aviso «Retirado el …» no está dentro de {equipo.lifecycleStatus === "retired" ? ( … {equipo.retiredAt ? t("equipoRetiradoEl")',
    ).toMatch(/\{equipo\.lifecycleStatus === "retired" \? \(\s*<p[^>]*>\s*<strong>\s*\{equipo\.retiredAt\s*\?\s*t\("equipoRetiradoEl"/);
    expect(fuente, "el aviso no formatea la fecha con mostrarFecha(equipo.retiredAt, …)").toMatch(/mostrarFecha\(equipo\.retiredAt,/);
    // ...y su respaldo para la fila que no tiene fecha (anterior al CHECK).
    expect(fuente, 'a la fila retirada sin fecha le falta su texto de respaldo `: t("equipoRetiradoSinFecha")`').toMatch(/:\s*t\("equipoRetiradoSinFecha"\)/);
  });
});
