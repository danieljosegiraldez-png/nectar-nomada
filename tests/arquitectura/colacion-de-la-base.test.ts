/**
 * La base de pruebas tiene que plegar mayúsculas acentuadas como PRODUCCIÓN.
 *
 * **Por qué existe.** El 2026-09-27 una prueba de `tests/equipos/proveedores.test.ts` pasó siete
 * veces en un Mac y cayó al primer contacto con CI. No era el código: era la colación. Producción
 * (Neon) es `C.UTF-8` y pliega —medido ese día con una consulta de sólo lectura—; CI también; y el
 * clúster local lo creaba `scripts/test-db.sh` con `initdb --encoding=UTF8` y **sin `--locale`**, así
 * que heredaba el del entorno, `C` a secas, donde `lower('Í')` devuelve `'Í'`.
 *
 * **Qué cambia exactamente, medido el 2026-09-27 contra producción y no razonado:** el PLEGADO DE
 * CAJA, no el orden. `lower('ÁÉÍÓÚÑÜ')` y `upper('áéíóúñü')` difieren entre `C` y `C.UTF-8`; un
 * `ORDER BY` con acentos da lo MISMO en las dos, porque ambas ordenan por bytes. Así que lo que se
 * rompe es todo lo que compara sin distinguir mayúsculas: los índices `lower(btrim(name))`, los
 * `mode: "insensitive"` de Prisma (que son `ILIKE`), y cualquier `lower(a) = lower(b)`.
 *
 * Sobre el proveedor `builtin C.UTF-8` que usa `scripts/test-db.sh`: **coincidió con producción en
 * las cuatro medidas comparadas** —`lower('ÁÉÍÓÚÑÜ')`, `upper('áéíóúñü')`, un `ORDER BY` con acentos
 * y este caso—. Eso NO es «equivalente a producción» en general, y no se afirma: son proveedores
 * distintos —builtin usa conversión Unicode simple; libc depende de su biblioteca— y Postgres no
 * promete equivalencia entre ellos. Lo que se garantiza es lo que esta prueba mide (hallazgo 1 de
 * Codex, que tenía razón: una coincidencia de `lower('Í')` no es una garantía de equivalencia).
 *
 * **Por qué falla en vez de avisar.** Un aviso en una salida de 2.000 pruebas no se lee. Y el arreglo
 * es una orden: recrear la base. Si esto te acaba de romper, tu base no representaba producción y las
 * pruebas que venías leyendo en verde tampoco.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

describe("la colación de la base de pruebas", () => {
  it("pliega las mayúsculas acentuadas, como producción", async () => {
    // `datcollate` NO sirve para diagnosticar esto y por poco lo uso: con el proveedor `builtin`
    // sigue diciendo 'C' aunque la base pliegue — el locale real vive en `datlocale`. Medido el
    // 2026-09-27: una base builtin C.UTF-8 y una libc C dan las dos `datcollate = C`, y sólo una
    // pliega. Por eso la aserción es sobre el PLEGADO y el diagnóstico imprime las tres columnas.
    const [m] = await prisma.$queryRawUnsafe<
      { bajado: string; pliega: boolean; colacion: string; proveedor: string; locale: string }[]
    >(
      `SELECT lower('FERRETERÍA') AS bajado,
              lower(btrim('  FERRETERÍA EL PUENTE  ')) = lower(btrim('Ferretería El Puente')) AS pliega,
              d.datcollate AS colacion,
              d.datlocprovider::text AS proveedor,
              COALESCE(d.datlocale, '(ninguno)') AS locale
         FROM pg_database d WHERE d.datname = current_database()`,
    );

    // Control positivo, y va PRIMERO: si el ASCII no plegara, el resultado de abajo no diría nada
    // sobre acentos — diría que la consulta no mide lo que cree.
    const [ascii] = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      "SELECT lower('FERRETERIA') = 'ferreteria' AS ok",
    );
    expect(ascii!.ok, "el instrumento no mide: ni el ASCII se pliega").toBe(true);

    // El contrato exacto, no sólo «los dos lados son iguales»: si `lower` devolviera otra cosa que
    // resultara igual por ambos lados, la comparación de abajo pasaría y esta aserción no.
    expect(m!.bajado, "lower('FERRETERÍA') no da el valor que da producción").toBe("ferretería");

    expect(
      m!.pliega,
      [
        "",
        `Esta base NO pliega las mayúsculas acentuadas: lower('FERRETERÍA') = '${m!.bajado}'.`,
        `provider='${m!.proveedor}' datlocale='${m!.locale}' datcollate='${m!.colacion}'.`,
        "Producción es C.UTF-8 y pliega (medido el 2026-09-27, consulta de sólo lectura).",
        "Ojo: datcollate dice 'C' también en una base builtin CORRECTA; mira el plegado, no esa columna.",
        "",
        "Cualquier prueba sobre unicidad u orden de texto puede pasar aquí y caer en CI.",
        "",
        "Para la base compartida — OJO, `up` NO sirve: si tiene datos la deja como está y",
        "volverías aquí. Hay que recrearla, y eso BORRA lo que tenga dentro:",
        "",
        "  npm run test:db -- reset",
        "",
        "Para una base privada tuya, recréala con la colación de producción:",
        "",
        "  createdb -h 127.0.0.1 -p 55433 -U postgres --template=template0 \\",
        "    --locale-provider=builtin --builtin-locale=C.UTF-8 --encoding=UTF8 <nombre>",
        "",
      ].join("\n"),
    ).toBe(true);
  });
});
