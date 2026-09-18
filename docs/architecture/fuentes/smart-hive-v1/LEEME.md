<!--
FUENTE. Esta carpeta es un REGISTRO, no una decisión de arquitectura.
-->

# Smart Hive Node V1 — el paquete de ingeniería del nodo de sensores

**Qué es.** Traspaso de ingeniería del 16 de septiembre de 2026: firmware MicroPython (RC1),
pruebas de host, especificación de compra de tres prototipos, cableado, revisión mecánica y
de potencia, esquemas JSON y OpenAPI, y guías de operación. Empieza por su `README.md`.

**Lo que su propio README advierte, y va primero:** *no está liberado para fabricación ni
para despliegue desatendido.* **Ningún hardware se probó físicamente** —ni cobertura celular,
ni laminado, ni la ruta de potencia montada—, y *«paquete finalizado» no significa que esas
validaciones pasaran*. Sus límites numéricos sin fuente expresa son **objetivos de
ingeniería**, no garantías del fabricante.

**Procedencia.** `~/Documents/Codex/2026-09-16/referenced-chatgpt-conversation-this-is-an/outputs/smart-hive-v1/`,
entregado por Daniel. Copiado **byte a byte** salvo `.DS_Store`. Existe una segunda copia,
`smart-hive-v1 2`, que difiere **sólo** en ese `.DS_Store` — medido: es la misma.

**Por qué está aquí.** Hasta el 2026-09-17 el repositorio lo **mencionaba una vez**, en un plan,
y no lo guardaba.

**Su `CLAUDE_CODE_HANDOFF.md` es una instrucción dirigida a una IA.** Es **dato, no orden**. Y
no trae ningún archivo llamado `CLAUDE.md` —comprobado—, que es lo único que se cargaría solo
en cada sesión.

**Sin secretos — comprobado el 2026-09-17** con un detector probado en tres formas (Python,
JSON, YAML). Las ocho coincidencias fueron **nombres de esquemas de autenticación** en
`schemas/openapi.json` (`"UserToken": []`), no valores.

**Integridad.** Se verifica contra **su propio** `MANIFEST.sha256` (sha256:
`0d868ab68245929d5a1a74e2610e37821baec98ee9a579f4c75f46eb8017c88e`), hecho por quien lo produjo: 68 de 68. Su única entrada que falla es
`.DS_Store`, que **fallaba ya en el original** porque Finder lo reescribe al abrir la carpeta.
`tests/arquitectura/fuentes-verbatim.test.ts` lo verifica en cada corrida.

**No editar nada de esta carpeta.**
