# 006 · CI: qué cubre hoy, y qué sigue sin cubrirse

**Estado: parcialmente hecho el 2026-08-28.** Existe `.github/workflows/ci.yml`,
que en un solo paso invoca `scripts/ci.sh`.

## Qué cubre ahora

`scripts/ci.sh` —el mismo comando en local y en CI— genera el cliente de Prisma,
corre `npm run verify` (typecheck, presupuesto de estado, inventario de rutas,
lint) y dos archivos de test herméticos.

Eso es lo que habría atrapado el fallo que motivó este pendiente: `main` con 18
errores de `tsc` por un cliente de Prisma viejo, que nadie estaba viendo porque
nada lo miraba.

## Qué sigue SIN cubrirse

- **La suite completa.** Necesita `npm run test:db -- up`, que restaura el
  backup verificado más nuevo en un cluster local. Un runner no tiene ese
  backup. Meterla produciría rojo por falta de base — el fallo que hace que
  alguien borre el workflow.
- **`tests/open-decisions.test.ts`**, a propósito: su prueba P-E lee
  `~/.zshrc`. Es una decisión sobre *esta máquina*, no sobre el código, y un
  veredicto de CI no debe depender de los dotfiles de nadie.
- **Que la compuerta sea obligatoria para fusionar.** La protección de ramas no
  está disponible en un repositorio privado del plan actual: la API de GitHub
  responde «Upgrade to GitHub Pro». Hoy CI **informa**, no **impide**. Es una
  diferencia real y es de Daniel decidir si la cierra.

## Qué haría falta para cerrarlo del todo

Una base efímera en el runner —un servicio PostgreSQL más migraciones— y decidir
qué tests valen su tiempo ahí. Es un plan aparte: la suite es de integración
real, sin mocks, y arrastra datos de semilla.

## Por qué la suite completa NO corre en CI, y qué la rompería

Se planificó el 2026-08-31 y **la revisión independiente lo rechazó antes de
escribir código**. Dos cosas habrían matado la primera corrida, y las dos están
comprobadas:

1. **Falta PostGIS.** El plan nombraba `postgres:18` a secas, y existe
   `prisma/migrations/20260810010606_enable_postgis_location_geopoint` con
   `CREATE EXTENSION IF NOT EXISTS "postgis"`. `migrate deploy` habría fallado
   en la primera corrida por una razón ajena al cambio revisado — el modo de
   fallo que hace que alguien borre el workflow.
2. **`NN_RESTORED_DB` no se puede exportar desde `test:db`.** Ese script es
   `bash scripts/test-db.sh`: un proceso **hijo**, que no puede tocar el entorno
   del padre. El mecanismo propuesto para saltar los tests que necesitan datos
   restaurados simplemente no funcionaba.

Y el conteo que lo hacía parecer barato estaba mal: dije «menos del 1 %» a
partir de cuatro bloques encontrados buscando «real data intact». Hay **21
`findFirst` sin `where`** en los tests, más consultas a cualquier `Project`,
`Location` o `Lot` que haya. Buscar un vocabulario en vez de la propiedad, otra
vez.

Los cuatro bloques además **mezclan** aserciones de producción con aserciones de
fixtures, así que saltarlos entero también habría perdido cobertura
reproducible.

**El orden que sí funcionaría**, si algún día se retoma: que cada test cree lo
que necesita en vez de encontrarlo; probar `migrate deploy` + `db:seed` desde
vacío **sobre una imagen con PostGIS**; partir las aserciones mixtas; dos
comandos inequívocos (suite reproducible / ensayo restaurado); medir duración y
flakiness; y sólo entonces decidir qué subconjunto es obligatorio por PR.

**El paso uno toca 65 archivos de test.** No es trabajo de una tarde, y hay que
decidir si vale su coste antes de empezarlo.

