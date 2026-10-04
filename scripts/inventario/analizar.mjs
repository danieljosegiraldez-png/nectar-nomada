/**
 * El detector del inventario de acceso, **puro**: recibe las fuentes y la lista
 * de modelos, y devuelve una fila por operación que toca la base. Sin `fs`, sin
 * `process`, sin `RAIZ`.
 *
 * **Por qué está partido del CLI, que es lo único nuevo aquí.** El guardia que
 * importa es el que llama al detector con **entrada hostil** —un método de clase
 * inventado, un comentario que nombra un guardia— y hasta el 2026-10-04 eso era
 * imposible: el guion recorría `app/` y `lib/` del disco, así que lo único
 * comprobable era el árbol que ya existe. Un corpus prueba lo que contiene, no
 * lo que alguien escribirá mañana. El patrón ya es de la casa:
 * `tests/arquitectura/proceso-por-el-resolvedor.test.ts` alimenta a su detector
 * con fragmentos literales.
 *
 * **Lo que NO hace, y es el límite de siempre:** reconoce *formas escritas*, no
 * propiedades. Un guardia con el permiso equivocado se cuenta como guardia; un
 * acotado por construcción que filtre por asignaciones se ve como «sin guardia».
 * Por eso la salida separa lo que sabe de lo que no, en vez de dar un número.
 */

export const GUARDIAS = /\b(require[A-Z]\w*(?:Access|Admin|Override)|can|resolvedPermissionKeys|permissionKeysAnywhere)\s*\(/g;

/**
 * Los métodos se enumeran, y por eso hay que enumerarlos **enteros**.
 *
 * La primera versión listaba `findUnique` con `\b` detrás, y `findUniqueOrThrow`
 * no tiene frontera de palabra ahí: 13 archivos usaban esa variante y sus
 * operaciones **desaparecían del inventario**, no quedaban «sin clasificar».
 * `app/actions/checkout.ts` y `app/actions/bookings.ts` salían con cero
 * operaciones teniendo una consulta cada uno. El sufijo va antes del `\b`.
 *
 * El SQL crudo no tiene modelo que capturar —`prisma.$queryRaw` no lleva
 * `.modelo.`— y es justo el que más importa ver, porque se salta la capa de
 * modelos entera. Se registra con el modelo `SQL-crudo` para que exista como
 * operación y haya que explicarla como cualquier otra.
 */
const METODOS =
  "findMany|findFirstOrThrow|findFirst|findUniqueOrThrow|findUnique|createManyAndReturn|createMany|create|updateManyAndReturn|updateMany|update|upsert|deleteMany|delete|count|aggregate|groupBy";
const MODELOS = new RegExp(
  // El cliente puede no ser un identificador. `lib/audit.ts` escribe
  // `(tx ?? prisma).auditEvent.create(...)`, y un nombre suelto no lo ve: el
  // archivo entero salía con cero operaciones. Se acepta también un `)`.
  String.raw`(?:\b(?:prisma|aiPrisma|tx|client)|\))\.(\w+)\.(?:${METODOS})\b`,
  "g"
);
const CRUDO = /\b(?:prisma|aiPrisma|tx|client)\.\$(?:query|execute)Raw(?:Unsafe)?\b/g;

/**
 * Trocea un archivo en funciones exportadas y su cuerpo.
 *
 * El corte va hasta la siguiente declaración de nivel superior — exportada o
 * no. Una primera versión cortaba en el siguiente `export`, y por eso atribuía
 * a `slugify()` las consultas del `uniqueSlug()` **no exportado** que vive
 * justo debajo.
 *
 * `export default async function` faltaba, y su omisión no dejaba un hueco:
 * dejaba una **identidad falsa**. En `app/my-nectar/page.tsx` la declaración
 * anterior es `export const dynamic = "force-dynamic"`, que absorbía el resto
 * del archivo, así que las tres consultas de `MyNectarPage()` se inventariaban
 * bajo el nombre `dynamic` — una constante de configuración.
 */
function declaraciones(archivo, src) {
  const decl = /^(?:export )?(?:default )?(?:async )?(?:function|const) (\w+)/gm;
  const todas = [...src.matchAll(decl)];
  return todas.map((m, i) => ({
    archivo,
    nombre: m[1],
    exportada: /^export /.test(m[0]),
    cuerpo: src.slice(m.index ?? 0, i + 1 < todas.length ? todas[i + 1].index : src.length),
  }));
}

/**
 * Una consulta delegada a un ayudante **no exportado** desaparecía entera.
 *
 * Lo encontró la revisión independiente del 2026-08-31 y se comprobó por
 * mutación. Ahora el cuerpo de una operación exportada **absorbe** el de los
 * ayudantes privados que llama, transitivamente. Y un ayudante privado con
 * acceso al que no llega ninguna exportada se emite como operación propia, para
 * que tampoco ése pueda esconderse.
 */
function operaciones(archivo, src) {
  const todas = declaraciones(archivo, src);
  const privadas = new Map(todas.filter((d) => !d.exportada).map((d) => [d.nombre, d]));

  const absorber = (d) => {
    let cuerpo = d.cuerpo;
    const alcanza = new Set([d.nombre]);
    for (let cambio = true; cambio; ) {
      cambio = false;
      for (const [nombre, ayudante] of privadas) {
        if (alcanza.has(nombre)) continue;
        if (!new RegExp(`\\b${nombre}\\s*\\(`).test(cuerpo)) continue;
        cuerpo += "\n" + ayudante.cuerpo;
        alcanza.add(nombre);
        cambio = true;
      }
    }
    return { archivo, nombre: d.nombre, cuerpo, alcanza };
  };

  const exportadas = todas.filter((d) => d.exportada).map(absorber);
  const alcanzadas = new Set(exportadas.flatMap((o) => [...o.alcanza]));
  const huerfanas = todas
    .filter((d) => !d.exportada && !alcanzadas.has(d.nombre))
    .map(absorber);

  return [...exportadas, ...huerfanas].map(({ alcanza, ...o }) => o);
}

const CUALQUIER_FN = /^(?:export )?(?:default )?(?:async )?(?:function|const) (\w+)/gm;

/**
 * Qué nombres entran en cada archivo por un `import`. Un guardia de otro
 * archivo cuenta **si está importado aquí**; si no, es una homonimia y no
 * guarda nada. Sin esto, limitarse al propio archivo degradaba a
 * `getLotReport()`, que delega en `getLotDetail()` importado de `./lots`.
 */
function resolver(fuentes, archivoOrigen, especificador) {
  if (!especificador.startsWith(".")) return null;
  const partes = archivoOrigen.split("/").slice(0, -1);
  for (const seg of especificador.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  const base = partes.join("/");
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fuentes.has(cand)) return cand;
  }
  return null;
}

/**
 * `fuentes` es un `Map<ruta, texto>`; `modelos` el `Set` que devuelve
 * `modelosDelEsquema`. Devuelve una fila por operación con acceso, con los ocho
 * campos que consume el resto del sistema — de los cuales las tres compuertas
 * leen cinco: `archivo`, `nombre`, `clase`, `acotado` y `guardias`.
 */
export function analizar(fuentes, modelos) {
  const TODOS = [...fuentes.keys()];
  const ops = TODOS.flatMap((f) => operaciones(f, fuentes.get(f) ?? ""));

  const importados = new Map();
  for (const [archivo, src] of fuentes) {
    const deDonde = new Map();
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
      const destino = resolver(fuentes, archivo, m[2]);
      if (!destino) continue;
      for (const parte of m[1].split(",")) {
        const nombre = parte.trim().split(/\s+as\s+/).pop()?.trim();
        if (nombre) deDonde.set(nombre, destino);
      }
    }
    importados.set(archivo, deDonde);
  }

  /**
   * Qué funciones guardan de verdad — exportadas **o no**, y **por archivo, no
   * global**. Era un `Set` de nombres sueltos de todo el árbol, así que una
   * función llamada como un guardia de cualquier otro archivo promovía la
   * operación a «guardia directo» sin que nada resolviera el símbolo. Un
   * guardia local guarda en **su** archivo.
   */
  const guardanPorArchivo = new Map();
  for (const [archivo, src] of fuentes) {
    const decl = [...src.matchAll(CUALQUIER_FN)];
    const aqui = new Set();
    guardanPorArchivo.set(archivo, aqui);
    for (let i = 0; i < decl.length; i++) {
      const ini = decl[i].index ?? 0;
      const fin = i + 1 < decl.length ? decl[i + 1].index : src.length;
      if (GUARDIAS.test(src.slice(ini, fin))) aqui.add(decl[i][1]);
      GUARDIAS.lastIndex = 0;
    }
  }

  /** Los guardias visibles desde un archivo: los que declara y los que importa. */
  const guardanVisiblesEn = (archivo) => {
    const propios = guardanPorArchivo.get(archivo) ?? new Set();
    // Un nombre importado cuenta sólo si guarda **en el archivo del que viene**.
    const traidos = [...(importados.get(archivo) ?? new Map())]
      .filter(([nombre, destino]) => (guardanPorArchivo.get(destino) ?? new Set()).has(nombre))
      .map(([nombre]) => nombre);
    return new Set([...propios, ...traidos]);
  };

  return ops
    .map((o) => {
      // El filtro por `modelos` sustituye a «cualquier identificador detrás del
      // cliente». Medido el 2026-10-04: de los 183 nombres que el inventario
      // reporta, CERO faltan en los 205 del esquema, así que no quita nada hoy
      // — y evita que mañana un `cache.user.create` cuente como acceso.
      const modelosVistos = [
        ...new Set([...o.cuerpo.matchAll(MODELOS)].map((m) => m[1]).filter((n) => modelos.has(n))),
      ];
      if (CRUDO.test(o.cuerpo)) modelosVistos.push("SQL-crudo");
      CRUDO.lastIndex = 0;
      if (modelosVistos.length === 0) return null;
      const propios = [...new Set((o.cuerpo.match(GUARDIAS) ?? []).map((g) => g.replace(/\s*\($/, "")))];
      const locales = [...guardanVisiblesEn(o.archivo)].filter(
        (n) => n !== o.nombre && new RegExp(`\\b${n}\\s*\\(`).test(o.cuerpo)
      );
      const guardias = [...new Set([...propios, ...locales])];
      const principal = /\buserAccountId\b/.test(o.cuerpo);
      // Un salto: ¿llama a alguna función que sí guarda?
      const transitivo = [...guardanVisiblesEn(o.archivo)].filter(
        (n) => n !== o.nombre && new RegExp(`\\b${n}\\s*\\(`).test(o.cuerpo)
      );
      /**
       * Acotado por construcción: la consulta filtra por el propio principal.
       * **Sólo cuenta dentro de un `where`.** Hubo una segunda regla que casaba
       * cualquier línea terminada en `userAccountId,` — y eso son sobre todo
       * **sellos de actor**. Firmar una escritura no es filtrar una lectura.
       * Medido el 2026-09-21: 14 operaciones eran «acotadas» sólo por esa regla
       * y **ninguna** filtraba por el principal.
       */
      const acotado = /where:\s*\{[^}]*userAccountId/s.test(o.cuerpo ?? "");
      /** Resolutor de visibilidad: el `where` se construye desde el alcance. */
      const resolutor = /\bresolve\w*Visibility\s*\(/.test(o.cuerpo ?? "");
      /** Sin principal y sin guardia: la autorización, si existe, la hace quien llama. */
      const dependeDelLlamador = !o.cuerpo?.includes("userAccountId");
      const publica = /discover\/service/.test(o.archivo);
      // `lib/auth/config.ts` es el flujo de autenticación en sí: corre **antes**
      // de que exista sesión, así que no hay principal contra el que autorizar.
      const preSesion = /actions\/auth|lib\/auth\/config/.test(o.archivo);
      const firma = /webhooks/.test(o.archivo);

      let clase;
      if (guardias.length) clase = "guardia directo";
      else if (transitivo.length) clase = "guardia transitivo";
      else if (acotado || resolutor) clase = "acotado por construcción";
      else if (publica) clase = "público por diseño";
      else if (preSesion) clase = "previo a la sesión";
      else if (firma) clase = "firma";
      else if (principal) clase = "recibe principal, sin guardia visible";
      else if (dependeDelLlamador) clase = "depende del llamador (verificar a mano)";
      else clase = "SIN CLASIFICAR";
      return {
        ...o,
        cuerpo: undefined,
        modelos: modelosVistos,
        guardias,
        principal,
        transitivo,
        acotado: acotado || resolutor,
        clase,
      };
    })
    .filter(Boolean);
}
