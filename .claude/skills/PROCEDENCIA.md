# Procedencia de las skills de dominio — revisadas el 2026-10-06

Las siete `coffee-*` y `nn-*` de este directorio llegaron en un paquete que Daniel entregó el
2026-10-06. Una skill **carga instrucciones en cada sesión**, así que se lee entera antes de
instalarla y lo revisado se anota aquí, para que la siguiente sesión no tenga que repetirlo ni
fiarse. Ésa es la regla de `~/.claude/CLAUDE.md`, y este archivo existe para cumplirla.

| | |
|---|---|
| paquete | `nectar-nomada-skills_1.zip`, 147 KB, 68 entradas |
| `sha256` | `88a773f461d8bcda00a1d4d2db4720c8d07647ccc2f8a27dfd447cc22215fcdd` |
| copiado | **48** archivos en siete directorios. `INSTALL.md` **no** se copió: son instrucciones de instalación, no una skill |
| licencia | ninguna declarada. Es material del propio proyecto, no de un tercero público |
| decisión | Daniel, 2026-10-06: instalar las siete con las dos líneas falsas corregidas |

## Qué se revisó, y qué NO

**Leído entero:** los **siete** `SKILL.md` y el `INSTALL.md`.

**Barrido, no leído línea por línea:** los seis guiones de Python.

**NO leído:** los ~20 archivos de `references/` ni los 12 CSV del catálogo de levaduras (unos
250 KB). Se dice en vez de dar a entender que sí.

## Lo que se midió, con su resultado

**Nada se ejecuta solo.** Cero `plugin.json`, cero `hooks`, cero `*.sh`, cero `settings*.json` en el
paquete. Eso importa porque un hook de skill corre sin que nadie lo invoque.

**Los guiones de Python no salen de su propio directorio.** Medido buscando `socket`, `requests`,
`urllib`, `subprocess`, `eval(`, `exec(`, `os.system`, `pip install`, `curl`, `DATABASE_URL` y
`os.environ`: **cero aciertos en los seis**. Los únicos usos de `os` son `os.path.dirname` /
`abspath` para `sys.path`, y en `pi_logger.py` un `os.makedirs` + `open(..., "a")` que escribe su
CSV diario en el directorio que se le pase. Control: `def ` sale entre 5 y 12 veces por archivo, así
que el barrido leía los archivos.

**Las afirmaciones que las skills hacen sobre este repositorio se verificaron una por una:**

| afirmación | medido |
|---|---|
| las 11 rutas del repositorio que citan | **11 de 11 existen** |
| `bash scripts/ci.sh`, `bash scripts/open-decisions.sh`, `npm run check:rutas` | existen los tres |
| «14 documentos normativos en `docs/beneficio/`» | **14** |
| «9 skills `prisma-*` en `.claude/skills`» | **9** |
| «`skills-lock.json` rastrea las de `prisma/skills`» | cierto: **9** referencias a esa ruta dentro del archivo |
| el umbral «2,0 pp/día por debajo del 25 % de humedad» | coincide con el código: `lib/beneficio/secado.ts` → `maxDailyRatePp: 2.0` |
| «el guardia de intacto prohíbe insertar en medio del `CLAUDE.md`» | cierto: `scripts/check-claude-md-intact.mjs` exige que el archivo anterior aparezca **verbatim** dentro del actual, así que sólo deja añadir antes o después. **Ninguna compuerta lo corre**: es manual |

**Su orden de autoridad respeta ADR-181.** `coffee-processing` pone `docs/beneficio/` en primer lugar
y dice «lee el archivo del repositorio cuando la pregunta toque un umbral, porque el repositorio es
más nuevo que esta skill». Su sección «Do not» prohíbe sustituir los umbrales de la plataforma por
genéricos y copiar los de cannabis o cacao al café.

**Coste fijo:** los siete `name` + `description` suman **5017 caracteres ≈ 1254 tokens** en cada
sesión. Para comparar, `superpowers` 6.3.0 cuesta ~584 tokens fijos.

## El defecto que se corrigió al instalar, y por qué era peligroso

**Dos skills decían que `scripts/ci.sh` corre las pruebas de una lista escrita a mano y que un
archivo nuevo hay que añadirlo ahí.** Está del revés. Las líneas 48-49 de ese guion usan
`scripts/pruebas-por-compuerta.txt` como lista de **exclusión**:

```bash
EXCLUIDAS="$(... grep -vE '^\s*(#|$)' scripts/pruebas-por-compuerta.txt)"
A_CORRER="$(... find tests -name '*.test.ts' | sort | grep -vxF "$EXCLUIDAS")"
```

Seguir la instrucción falsa **saca** una prueba hermética nueva del carril, que es exactamente el
defecto de `PENDING_IMPLEMENTATIONS/008`. Corregido en las dos —`nn-backend-architect` y
`nn-mcp-builder`— con una nota que **cita el texto viejo**, para que se vea qué cambió. Esas dos
citas son la razón por la que un `grep` de «hand-written» todavía encuentra algo aquí.

Era una sola clase con dos instancias, y se buscaron las dos antes de dar el arreglo por hecho:
`grep -riE 'hand-written|hand written'` sobre las siete devolvía exactamente esas dos líneas.

## Lo que queda abierto, y es de Daniel

- **Las cifras del catálogo de levaduras no están verificadas**, y lo dice el propio `INSTALL.md`:
  «catalog figures come from fetch summaries and need checking against the linked pages». Son 27
  estudios y cuatro proveedores. Importa más aquí que en otro repositorio, porque la regla de la casa
  prohíbe publicar una cifra sobre un tercero que no esté en una fuente.
- **Las plantillas de ESP32 y Pi 5 no se han probado en hardware**, y las cuatro `nn-*` son
  borradores que su `INSTALL.md` marca «draft, not exercised».
- **Lo que el paquete lista como pendiente de Daniel:** el ancho interior del cuarto (12 ft contra
  casi 14), la lista v1 de acciones drásticas y de acciones protectoras tras 24 h, los límites de HR
  y temperatura por proceso, el plazo y el presupuesto, el rango del medidor en cereza entera, y si
  estas skills se parten o se quedan como están.
