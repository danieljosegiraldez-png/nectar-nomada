# Prompt maestro — péguelo primero, una sola vez

> Copie todo lo que está debajo de la línea. Claude Code no debe auditar nada todavía: este prompt solo levanta el inventario y propone el plan. Usted aprueba antes de que toque una línea de código.

---

Vas a auditar el módulo de café de punta a punta: cosecha, selección, creación de lote, procesos, divisiones y fusiones de lote, tratamientos, muestreo, secado, reposo, tueste de muestra, perfil de tueste, catación, valorización, registro y reporting.

Lee primero, en este orden: `CLAUDE.md`, `docs/00_conventions.md`, `docs/01_lot_lifecycle.md`, `docs/02_calibration.md`, `docs/03_public_api.md`, `docs/20_modelo_ciclo_completo.md`, `docs/21_rubrica_veracidad.md`, `docs/22_rubrica_pedagogica.md`.

La auditoría tiene **tres ejes simultáneos**, y cada hallazgo pertenece a uno:

- **FUNCIONAL** — ¿hace lo que dice que hace? ¿Están los invariantes protegidos por pruebas?
- **VERAZ** — ¿toda cifra que el sistema emite se sostiene? Rúbrica en `docs/21`.
- **PEDAGÓGICO** — ¿la herramienta forma criterio, o solo registra? Rúbrica en `docs/22`.

Un módulo que pasa el eje funcional y falla el pedagógico no está aprobado. Los tres pesan igual.

## Reglas de trabajo — vinculantes

**Ramas y commits.** Cada fase trabaja en su propia rama `auditoria/fase-N`, nunca sobre `main`. Un commit por hallazgo, con el ID del hallazgo en el mensaje: `fix(fase-2): F2-007 fusión hereda puntaje de taza del padre mayoritario`. No agrupes correcciones no relacionadas.

**Orden obligatorio dentro de cada hallazgo.** Primero la prueba que falla, en su propio commit. Después la corrección, en el siguiente. Nunca al revés: una corrección sin prueba previa que falle no demuestra que había algo roto.

**Nunca hagas pasar una prueba modificándola.** Si una prueba existente estorba, es un hallazgo: repórtalo y detente. No la borres, no la relajes, no la marques `skip`.

**Lo que NO tocas sin mi aprobación** — si un hallazgo requiere cambiar alguna de estas cosas, no lo corrijas: escríbelo en `auditoria/DECISIONES_PENDIENTES.md` y sigue con lo demás.

- Umbrales de dominio y cualquier valor marcado `[PROVISIONAL]`
- Criterios sensoriales, de taza o de calidad
- Textos de marca, nombres comerciales, descripciones de producto
- Precios, márgenes y cualquier parámetro económico
- Migraciones que borren o reescriban datos existentes
- El contrato de pruebas en `tests/test_processing_spec.py` y `tests/fixtures/test_vectors.json`

**Ante una contradicción entre documentos, o entre un documento y el código: detente y pregúntame.** No la resuelvas por tu cuenta ni elijas la interpretación que te resulte más cómoda de implementar.

**Si no encuentras algo, dilo.** «No existe» y «no lo encontré» son hallazgos distintos y quiero saber cuál es.

## Lo que haces ahora — y solo esto

1. **Inventario.** Recorre el repositorio y levanta qué existe realmente de cada etapa del ciclo: modelo de datos, lógica, pruebas, pantallas y contenido guía. Para cada etapa marca uno de: `COMPLETO` · `PARCIAL` · `AUSENTE` · `NO ENCONTRADO`. Distingue lo que está implementado de lo que solo está documentado — es exactamente la brecha que produjo los defectos de la versión 2.x.

2. **Cobertura de los tres ejes.** Para cada etapa presente, di si tiene pruebas, si sus cifras tienen procedencia, y en qué nivel de `docs/22` está su contenido guía.

3. **Escribe `auditoria/INVENTARIO.md`** con esa tabla y un párrafo de lectura general: dónde está más sólido el sistema y dónde más frágil.

4. **Propón el plan**: qué fase de las seis conviene correr primero y por qué, qué esperas encontrar, y qué necesitas de mí antes de empezar.

**Detente ahí.** No audites, no escribas pruebas y no corrijas nada hasta que yo apruebe el plan.
