# 005 · Probar la frontera de RBAC, no sólo el router

**Estado: sigue abierto**, y a propósito. Lo que se construyó el 2026-08-28 es
un control de **higiene del router**, que es una propiedad distinta y más
modesta que la que pide este pendiente.

## Lo que ya existe, y qué prueba

- `scripts/rutas-declaradas.mjs` — las 50 entradas del router, **declaradas**
  con su clase y su razón. La clasificación no se infiere.
- `scripts/check:rutas` (`scripts/inventario-de-rutas.mjs`) — falla si aparece
  una ruta sin declarar, si el manifiesto nombra una que ya no existe, o si el
  código contradice lo declarado. Corre dentro de `npm run verify`.
- `tools/browser-checks/respuesta-anonima.mjs` — observa qué contesta el
  despliegue a un anónimo en las **26 rutas estáticas** y lo contrasta con la
  declaración. Dice en su salida de cuántas se pronuncia y de cuántas no.

**Prueba:** que toda entrada del router está clasificada, y que ni el código ni
el edge contradicen la clasificación.

**No prueba:** que los datos estén protegidos. La frontera de autorización es el
servicio único de RBAC (`SECURITY.md` §2), no la ruta. `proxy.ts` sólo gatea
`/my-nectar` y dice de sí mismo que es una conveniencia de interfaz.

## Lo que falta para cerrar este pendiente

Demostrar que **toda lectura o escritura de datos gobernados por RBAC atraviesa
el servicio compartido**. Eso no se ve desde el router: se ve desde el acceso a
datos. Haría falta algo como un ayudante obligatorio que combine autorización y
acceso al contexto, detectable estructuralmente, de modo que saltárselo sea un
error de compilación y no una omisión invisible — como ya se hizo en ADR-062 con
la puerta de clasificación, que pasó de ser una convención a ser un error de
tipos.

## Límites conocidos del control actual, escritos para que nadie los descubra creyendo otra cosa

- El contraste es **sintáctico** sobre el archivo sin comentarios. Atrapa una
  señal que quedó sólo en un comentario —hay un test que lo demuestra— pero
  **no** atrapa una rama muerta ni una comprobación cuyo resultado no controla
  la respuesta.
- **23 rutas dinámicas no se comprueban en vivo.** No se fabrican slugs: un slug
  inventado devuelve 404, y leer ese 404 como «protegida» sería inventarse un
  veredicto.
- El **404 se trata como ambiguo**, nunca como éxito: puede significar «no
  existe» tanto como «no te lo doy».

Todo esto salió de la revisión independiente del plan (compuerta 2), que
concluyó que construir lo que decía el plan original habría producido «un
guardia útil para disciplina de archivos, pero demasiado fácil de interpretar
como control de seguridad». La adjudicación completa está en
`docs/plans/2026-08-28-inventario-de-rutas-privilegiadas.md`.
