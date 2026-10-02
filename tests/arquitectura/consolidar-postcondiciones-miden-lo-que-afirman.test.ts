import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **Las post-condiciones de `consolidar` miden lo que afirman.**
 *
 * Son DOS defectos de la misma forma, encontrados el mismo día en el mismo bloque, y los dos
 * aparecían como un guardia estricto. Van en un archivo porque son una clase, no dos casos.
 *
 * **El primero: las asignaciones.**
 *
 * El 2026-10-02, el ensayo contra producción de la pareja real de Chris Huerbsch imprimió el plan
 * correcto y una post-condición equivocada: comparaba las asignaciones de la cuenta superviviente
 * **después** contra las **2 que se movían**, y esa igualdad sólo vale cuando la superviviente está
 * vacía. No lo estaba. `scripts/grant-platform-admin.sql` concede buscando
 * `p.email = :'email' AND ua.auth_provider = 'credentials'`, y ese correo vive en la ficha
 * DUPLICADA — así que el Platform Admin que se le concedió ese mismo día cuelga justo de la cuenta
 * que sobrevive. Con 2 movidas y 1 propia habría dicho «esperaba 2, hay 3» **sobre una
 * consolidación correcta**.
 *
 * Y lo que lo hace grave no es el número: las post-condiciones se leen **fuera de la transacción**,
 * así que un fallo ahí no deshace nada. Habría dejado el escrito confirmado en producción y un
 * error en pantalla, que es la forma exacta de «no sé si funcionó».
 *
 * Es la **tercera** de esta forma en una jornada, y las tres en guiones que escriben en producción:
 * el 89 congelado de `grant-platform-admin.sql`, su recuento de asignaciones sin filtrar por
 * ámbito, y ésta. La forma es siempre **una post-condición que mide algo distinto de lo que
 * afirma**, y las tres se leían como un guardia estricto.
 *
 * **Qué prueba esto, y qué NO.** Lee la fuente, así que prueba la FORMA: que la cifra esperada se
 * derive de una medición de la cuenta superviviente hecha antes de la transacción. **No prueba la
 * aritmética** — para eso hace falta llamar a `consolidar()` con una cuenta superviviente que ya
 * tenga asignaciones, y hoy no se puede sin refactorizar la entrada del guion (`fail()` hace
 * `process.exit` y `main()` corre al importarse). La aritmética se comprobó empíricamente volviendo
 * a correr el ensayo contra producción: imprime «N propia(s) + 2 movida(s)», y ese N es el número
 * que la versión vieja ignoraba. Si alguien refactoriza la entrada, el guardia que toca es el que
 * llama a la función con esa entrada hostil, y éste se puede retirar.
 */
const GUION = new URL("../../scripts/consolidar-persona-duplicada.ts", import.meta.url).pathname;
const fuente = () => readFileSync(GUION, "utf8");

/**
 * El cuerpo del `if` que empieza en `marca`, cerrado CONTANDO LLAVES.
 *
 * La primera versión de la prueba de abajo cortaba a 600 caracteres y se comía el `fail(` del
 * chequeo SIGUIENTE, así que marcaba como incumplidor un bloque correcto. Un recorte por número de
 * caracteres no sabe dónde acaba un bloque, y por la indentación tampoco: esta casa ya pagó ese
 * error una vez, en el guardia que cerraba un `$transaction` por el `});` de su primer `create`.
 */
function cuerpoDelIf(src: string, marca: string): string {
  const i = src.indexOf(marca);
  expect(i, `no existe el bloque ${marca}`).toBeGreaterThan(-1);
  const abre = src.indexOf("{", i);
  expect(abre, `el bloque ${marca} no abre`).toBeGreaterThan(-1);
  let nivel = 0;
  for (let k = abre; k < src.length; k += 1) {
    if (src[k] === "{") nivel += 1;
    else if (src[k] === "}") {
      nivel -= 1;
      if (nivel === 0) return src.slice(abre, k + 1);
    }
  }
  throw new Error(`el bloque ${marca} no cierra`);
}

describe("consolidar suma las asignaciones propias de la cuenta superviviente", () => {
  it("sigue siendo el guion que mueve asignaciones y comprueba después", () => {
    const src = fuente();
    expect(src.length, "el guion está vacío o no se leyó").toBeGreaterThan(2000);
    expect(src, "ya no mueve asignaciones entre cuentas").toMatch(/tx\.assignment\.updateMany/);
    expect(src, "ya no lee las asignaciones después").toMatch(/const asignacionesDespues = /);
  });

  /**
   * La medición tiene que ser de la cuenta QUE SE QUEDA y tiene que ocurrir ANTES de la
   * transacción: después ya no se distingue lo propio de lo movido, porque todo cuelga de la misma
   * cuenta. Por eso se compara la posición en el archivo y no sólo la presencia de la línea.
   */
  it("mide las asignaciones propias de la cuenta superviviente ANTES de la transacción", () => {
    const src = fuente();
    const medicion = src.search(
      /const asignacionesPropias = await prisma\.assignment\.count\(\{ where: \{ userAccountId: cuentaQueSeQueda \} \}\)/,
    );
    expect(medicion, "no mide las asignaciones propias de la cuenta que sobrevive").toBeGreaterThan(-1);
    const transaccion = src.indexOf("await prisma.$transaction(");
    expect(transaccion, "ya no hay transacción").toBeGreaterThan(-1);
    expect(medicion, "mide las propias DESPUÉS de la transacción, cuando ya no se distinguen").toBeLessThan(transaccion);
  });

  /**
   * **La aserción que caza la regresión.** La cifra esperada tiene que ser la SUMA. Si alguien
   * vuelve a comparar contra las que se mueven, esto cae.
   */
  it("la cifra esperada es la SUMA, no sólo las que se mueven", () => {
    const src = fuente();
    expect(src, "la cifra esperada no es una suma de propias + movidas").toMatch(
      /const asignacionesEsperadas = asignacionesQueSeMueven \+ asignacionesPropias;/,
    );
    const i = src.indexOf("if (asignacionesDespues !==");
    expect(i, "no existe la comprobación de las asignaciones").toBeGreaterThan(-1);
    const condicion = src.slice(i, src.indexOf("\n", i));
    expect(condicion, "la post-condición no compara contra la suma").toContain("asignacionesEsperadas");
    // Y el reverso, por si alguien deja la suma declarada y compara contra otra cosa: la
    // condición no puede comparar contra las que se mueven ni contra las propias por separado.
    expect(condicion, "compara contra las que se mueven, que es el defecto de origen").not.toMatch(
      /asignacionesDespues !== asignacionesQueSeMueven/,
    );
    expect(condicion, "compara sólo contra las propias").not.toMatch(/asignacionesDespues !== asignacionesPropias/);
  });

  /**
   * **El ensayo tiene que ENSEÑAR la cifra propia**, o un operador que lea «esa cuenta tiene 3
   * asignaciones» no puede saber si 3 es lo correcto. Un ensayo que no se distingue de la corrida
   * real es el objetivo declarado de este guion, y ese objetivo incluye poder auditar el número.
   */
  it("el plan impreso desglosa propias y movidas", () => {
    const src = fuente();
    const i = src.indexOf("Post-condiciones que se exigirán");
    expect(i, "el guion ya no imprime sus post-condiciones").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 700);
    expect(bloque, "el plan no dice cuántas son propias").toContain("asignacionesPropias");
    expect(bloque, "el plan no dice cuántas se mueven").toContain("asignacionesQueSeMueven");
  });
});

/**
 * **El segundo defecto de la misma forma: la fila de auditoría.**
 *
 * La post-condición exigía que `core.audit_event` creciera **exactamente** en 1. Esa es la tabla más
 * escrita de la aplicación —cada operación deja fila, un inicio de sesión incluido— así que la
 * afirmación sólo vale si nadie usa la aplicación durante la consolidación. El día que se escribió
 * esto se le estaba dando acceso justo a la persona que se consolida: si entra con su Google en ese
 * minuto, el total crece de más, la consolidación es CORRECTA y la post-condición grita. Y como se
 * lee fuera de la transacción, grita sobre un escrito ya confirmado.
 *
 * La operación no posee el total de esa tabla. Posee SU fila, así que se guarda su id dentro de la
 * transacción y se vuelve a leer por id desde fuera — que además prueba algo que el recuento no
 * probaba: que la transacción confirmó. El total se queda sólo para la regla de §35, que es que no
 * puede decrecer.
 *
 * **Qué prueba esto, y qué no.** La forma, como el de arriba. No prueba que el id devuelto sea el de
 * la fila correcta; para eso haría falta la prueba de conducta que hoy no se puede escribir sin
 * refactorizar la entrada del guion.
 */
describe("la post-condición de auditoría busca SU fila, no un recuento global", () => {
  it("la transacción devuelve el id de la fila que escribió", () => {
    const src = fuente();
    expect(src, "la transacción no devuelve nada").toMatch(/const idDeAuditoria = await prisma\.\$transaction\(/);
    expect(src, "no captura la fila creada").toMatch(/const fila = await tx\.auditEvent\.create\(/);
    expect(src, "no devuelve su id").toMatch(/return fila\.id;/);
  });

  it("la post-condición vuelve a leer esa fila por su id, y mira su CONTENIDO", () => {
    const src = fuente();
    expect(src, "no vuelve a leer la fila por id").toMatch(/where: \{ id: idDeAuditoria \}/);
    expect(src, "no comprueba que la fila exista").toMatch(/if \(!filaDeAuditoria\)/);
    // **Y no se queda en que exista.** Buscar por un id que acaba de devolver una transacción
    // confirmada no puede fallar nunca: es un control que no discrimina, y una revisión adversaria lo
    // marcó como tal. Lo que discrimina es que la fila diga lo que esta operación hizo.
    expect(src, "no comprueba a quién apunta la fila").toMatch(/filaDeAuditoria\.entityId !== canonicaId/);
    expect(src, "no comprueba que la fila diga qué fue").toMatch(/filaDeAuditoria\.reason\?\.includes\("consolidación"\)/);
    expect(src, "no compara las asignaciones que la fila guarda con las que se movieron").toMatch(
      /guardadas !== idsMovidos\.length/,
    );
  });

  /**
   * **La aserción que caza la regresión.** El recuento global no puede volver a ser el veredicto.
   */
  it("el total global ya no es el veredicto, sólo la regla de sólo-añadir de §35", () => {
    const src = fuente();
    expect(src, "vuelve a exigir que el total crezca EXACTAMENTE en 1").not.toMatch(/!== totalAuditoria \+ 1/);
    expect(src, "ya no comprueba que el registro no decrezca (§35)").toMatch(/totalAuditoriaDespues < totalAuditoria \+ 1/);
  });
});

/**
 * **La tercera, y de otra clase: la guarda medía la PERSONA y no la CUENTA que borra.**
 *
 * `consolidar` hace desaparecer dos cosas — una ficha de `core.person` y una `core.user_account` — y
 * durante un día midió referencias sólo a la primera. El paso 2 borra la cuenta vieja, y
 * `core.audit_event.actor_user_account_id` es `ON DELETE SET NULL`: leído en el SQL de
 * `20260809221638_init_identity`, no deducido del esquema de Prisma. Así que borrar una cuenta que
 * haya actuado **no falla** — deja sus filas de auditoría sin actor, en silencio, que es lo que §35
 * prohíbe. Y `core.external_identity` es `ON DELETE CASCADE`: su enlace con Google desaparecería.
 *
 * La cabecera del guion ya afirmaba que sobrevive la cuenta que ya actuó. Lo que faltaba era
 * comprobarlo en vez de suponerlo por el `status` de la cuenta — `invited` sugiere que no ha actuado
 * y no lo demuestra.
 *
 * **Qué prueba esto, y qué no.** Que la segunda guarda existe, que pregunta al esquema por la tabla
 * de cuentas, y que aborta. No prueba que el `ON DELETE` de la base siga siendo `SET NULL`: si
 * alguien lo cambiara a `RESTRICT`, el borrado abortaría solo y esta guarda pasaría a ser un lujo.
 * Eso lo vigila el guardia de deriva de migraciones, que es su sitio.
 */
describe("la guarda mide también la cuenta que se borra, no sólo la persona", () => {
  it("la consulta al esquema está parametrizada por tabla destino, no fijada a person", () => {
    const src = fuente();
    expect(src, "sigue existiendo la versión fijada a person").not.toMatch(/columnasQueApuntanAPersona/);
    expect(src, "la consulta no toma la tabla destino como parámetro").toMatch(
      /ccu\.table_name = \$\{tablaDestino\} and ccu\.column_name = \$\{columnaDestino\}/,
    );
  });

  it("mide las referencias a la cuenta que se borra", () => {
    const src = fuente();
    expect(src, "no pregunta por las columnas que apuntan a user_account").toMatch(
      /columnasQueApuntanA\("user_account", "id"\)/,
    );
    expect(src, "no mide las referencias a la cuenta que se va").toMatch(
      /referenciasA\(cuentaQueSeVa, \{ tabla: "user_account", columna: "id" \}\)/,
    );
  });

  /**
   * **La aserción que caza la regresión.** Medir y no abortar es el defecto del `?ok=`: extraer un
   * dato no es usarlo. Tiene que haber un `fail(` alimentado por lo que quede FUERA de las
   * asignaciones que el paso 1 mueve.
   */
  it("y ABORTA cuando queda algo fuera de las asignaciones que mueve", () => {
    const src = fuente();
    expect(src, "no excluye las asignaciones, que sí se mueven").toMatch(
      /r\.donde !== "core\.assignment\.user_account_id"/,
    );
    const i = src.indexOf("fueraDeCuenta.length > 0");
    expect(i, "no hay rama para lo que queda fuera").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 600);
    expect(bloque, "avisa en vez de abortar").toMatch(/fail\(/);
    expect(bloque, "el aborto no nombra lo que encontró").toMatch(/fueraDeCuenta\.map/);
  });
});

/**
 * **Cuatro más, de la segunda vuelta: lo que el guion hacía sin decirlo.**
 *
 * Los tres de arriba salieron del ensayo contra producción. Estos cuatro salieron de una revisión
 * adversaria de seis lentes sobre el mismo archivo, y los cuatro son silencios: cosas que pasaban sin
 * error y sin registro.
 *
 * 1. **El trío duplicado.** `core.assignment` no tiene índice único sobre
 *    (user_account_id, role_profile_id, scope_id) — medido en las migraciones, y la señal de que es a
 *    propósito es que `grant-platform-admin.sql` lo sortea con `WHERE NOT EXISTS` y no con
 *    `ON CONFLICT`. Mover las asignaciones podía dejar dos filas idénticas, y la post-condición que
 *    compara totales lo bendecía: mover no crea ni destruye filas.
 * 2. **El correo de la canónica.** Si las dos fichas tienen correo, el paso 4 sobrescribía el de la
 *    canónica, y la post-condición no podía verlo porque compara el correo final contra el de la
 *    DUPLICADA — un control que devuelve lo mismo con la respuesta contraria.
 * 3. **La historia que la guarda no puede ver.** La guarda pregunta al esquema por CLAVES AJENAS, y
 *    `core.audit_event.entity_id` no tiene ninguna. No debe abortar —§35, esas filas se quedan— pero
 *    callarlo deja filas apuntando a una persona que ya no existe sin que nadie lo sepa.
 * 4. **«Entra con Google».** La línea final lo afirmaba sin mirar el `authProvider` de la cuenta. Una
 *    frase creíble que no se sostiene es lo que `21_rubrica_veracidad.md` prohíbe.
 */
describe("los silencios del guion, dichos", () => {
  it("mide si las dos cuentas comparten (rol, ámbito) y ABORTA", () => {
    const src = fuente();
    expect(src, "no mide tríos compartidos entre las dos cuentas").toMatch(/count\(distinct a\.user_account_id\) > 1/);
    const i = src.indexOf("colisiones.length > 0");
    expect(i, "no hay rama para las colisiones").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 500);
    expect(bloque, "avisa en vez de abortar").toMatch(/fail\(/);
    expect(bloque, "el aborto no nombra lo que encontró").toMatch(/colisiones\.map/);
  });

  it("aborta si las dos fichas tienen correo y son distintos, en vez de sobrescribir", () => {
    const src = fuente();
    const i = src.indexOf("canonica.email && duplicada.email && canonica.email !== duplicada.email");
    expect(i, "no compara los dos correos").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 500);
    expect(bloque, "no aborta: sobrescribiría el de la canónica").toMatch(/fail\(/);
  });

  /**
   * Y éste al revés que los otros: tiene que CONTAR y **no** abortar. Un guardia que exigiera
   * `fail(` aquí convertiría §35 en un bloqueo, que es lo contrario de lo que §35 dice.
   */
  it("cuenta la auditoría que seguirá apuntando a la duplicada, y NO aborta por ella", () => {
    const src = fuente();
    const i = src.indexOf("const auditoriaDeLaDuplicada");
    expect(i, "no cuenta las filas sin FK").toBeGreaterThan(-1);
    expect(src.slice(i, i + 220), "no las busca por entityId de la duplicada").toMatch(/entityId: duplicadaId/);
    const bloque = cuerpoDelIf(src, "auditoriaDeLaDuplicada > 0");
    expect(bloque, "aborta por filas de auditoría, contra §35").not.toMatch(/fail\(/);
    expect(bloque, "no lo dice").toMatch(/console\.log/);
    // Control del AYUDANTE, no del código: el mismo recorte sobre un bloque que SÍ aborta tiene que
    // encontrar su `fail(`. Sin esto, un ayudante que devolviera cadena vacía dejaría pasar la
    // aserción de arriba y «no aborta» se leería igual que «no miré».
    expect(cuerpoDelIf(src, "colisiones.length > 0"), "el ayudante no ve un fail que SÍ está").toMatch(/fail\(/);
  });

  it("el registro guarda QUÉ asignaciones se movieron, no cuántas", () => {
    const src = fuente();
    expect(src, "no lee los ids antes de mover").toMatch(/idsMovidos = aMover\.map\(\(a\) => a\.id\)/);
    // **Anclado con la coma final, y lo encontró el flip-test.** Sin ella, el regex casa también con
    // `asignacionesMovidas: idsMovidos.length` — volver a guardar un número dejaba el guardia en
    // verde. Es la lección del `?ok=` otra vez: nombrar el dato no es usarlo, y un prefijo no es el
    // valor.
    expect(src, "el registro sigue guardando un número en vez de los ids").toMatch(
      /asignacionesMovidas: idsMovidos,/,
    );
    expect(src, "el registro no guarda el correo anterior de la canónica").toMatch(/correoAnteriorDeLaCanonica: canonica\.email/);
  });

  it("la línea final decide por el ENLACE externo, no por authProvider", () => {
    const src = fuente();
    expect(src, "no mira si hay contraseña").toMatch(/Boolean\(cuenta\?\.passwordHash\)/);
    // **`authProvider` no dice cómo entra esta persona.** Una cuenta `credentials` puede estar
    // enlazada con Google por una fila de `core.external_identity`, y entonces entra con Google. La
    // versión anterior de esta prueba exigía `proveedor === "google"`, o sea bendecía el defecto: una
    // revisión adversaria lo marcó, y la prueba se corrige con el código.
    expect(src, "no consulta los enlaces externos").toMatch(/externalIdentities: \{ select: \{ provider: true \} \}/);
    const i = src.indexOf("Entra con Google usando");
    expect(i, "ya no hay mensaje de Google").toBeGreaterThan(-1);
    const antes = src.slice(Math.max(0, i - 300), i);
    expect(antes, "afirma Google sin comprobar el enlace externo").toMatch(/enlaces\.includes\("google"\)/);
    expect(antes, "sigue decidiendo por authProvider").not.toMatch(/proveedor === "google"/);
  });
});

/**
 * **Cuatro de la tercera vuelta, y las cuatro dicen algo sobre los arreglos de las dos primeras.**
 *
 * Una revisión adversaria de cuatro lentes sobre el archivo YA CORREGIDO devolvió 21 hallazgos que
 * sobrevivieron a dos de tres escépticos. Agrupados, cuatro tocaban mis propios arreglos:
 *
 * 1. **La guarda de colisiones abortaba sobre código correcto.** `AssignmentStatus` tiene `revoked` y
 *    `expired`, y esas filas se quedan en la tabla. Sin filtrar, una asignación retirada hace años con
 *    el mismo (rol, ámbito) abortaba una consolidación buena — y abortar sobre código correcto es, en
 *    esta casa, peor que no tener guarda.
 * 2. **Relajé una post-condición global y dejé su gemela.** Quité el `audit_event` + 1 exacto y dejé
 *    `core.assignment` comparando totales globales por igualdad, que sólo puede fallar por la escritura
 *    de otra persona: la pérdida que decía vigilar es imposible, porque esa FK es `RESTRICT`. Tres
 *    lentes distintas lo vieron por separado. Ahora se afirma IDENTIDAD —que las filas movidas cuelgan
 *    de la cuenta superviviente y que en la vieja no queda ninguna— teniendo los ids en la mano.
 * 3. **La simetría a medias.** Añadí el aviso de la auditoría sin FK para la PERSONA y no para la
 *    CUENTA, cuando `entity_type = 'user_account'` se usa en el código.
 * 4. **Las guardas se miden fuera de la transacción.** La mayoría de las FK a cuenta y a persona son
 *    `ON DELETE SET NULL`, así que una referencia nacida entre la medición y el borrado no hace fallar
 *    nada: la acepta y pone NULL. Un `FOR UPDATE` sobre las dos filas padre al abrir la transacción lo
 *    cierra casi entero, porque PostgreSQL exige un bloqueo en la fila padre para insertar un hijo con
 *    clave ajena. Lo que queda abierto está dicho en el comentario del código en vez de disimulado.
 */
describe("los arreglos de las vueltas anteriores, corregidos", () => {
  it("la guarda de colisiones sólo cuenta asignaciones EN VIGOR", () => {
    const src = fuente();
    const i = src.indexOf("having count(distinct a.user_account_id) > 1");
    expect(i, "ya no mide tríos compartidos").toBeGreaterThan(-1);
    const consulta = src.slice(src.lastIndexOf("select a.role_profile_id", i), i);
    expect(consulta, "cuenta también las revocadas y expiradas, y abortaría sobre código correcto").toMatch(
      /and a\.status = 'active'/,
    );
    expect(consulta, "no mira la ventana de vigencia").toMatch(/a\.valid_to is null or a\.valid_to > now\(\)/);
  });

  it("las post-condiciones de asignaciones afirman IDENTIDAD, no cardinalidad global", () => {
    const src = fuente();
    expect(src, "no comprueba que las movidas cuelguen de la cuenta superviviente").toMatch(
      /id: \{ in: idsMovidos \}, userAccountId: cuentaQueSeQueda/,
    );
    expect(src, "no comprueba que en la cuenta borrada no quede ninguna").toMatch(/quedanEnLaVieja !== 0/);
    // **La que se quitó, y su ausencia es el arreglo.** El total global de `core.assignment` sólo podía
    // fallar por la escritura de otra persona. Si alguien lo repone, esto cae.
    expect(src, "vuelve a usar el total global de core.assignment como veredicto").not.toMatch(
      /totalAsignacionesDespues !== totalAsignaciones/,
    );
  });

  it("el aviso de auditoría sin FK es simétrico: persona Y cuenta", () => {
    const src = fuente();
    expect(src, "no cuenta la de la persona").toMatch(/entityType: "person", entityId: duplicadaId/);
    expect(src, "no cuenta la de la cuenta que borra").toMatch(/entityType: "user_account", entityId: cuentaQueSeVa/);
  });

  it("la transacción bloquea las dos filas padre antes de tocar nada", () => {
    const src = fuente();
    const i = src.indexOf("prisma.$transaction(async (tx)");
    expect(i, "ya no hay transacción").toBeGreaterThan(-1);
    const primerasLineas = src.slice(i, src.indexOf("tx.assignment", i));
    expect(primerasLineas, "no bloquea la ficha duplicada").toMatch(/core\.person where id = \$\{duplicadaId\}::uuid for update/);
    expect(primerasLineas, "no bloquea la cuenta que borra").toMatch(
      /core\.user_account where id = \$\{cuentaQueSeVa\}::uuid for update/,
    );
  });
});
