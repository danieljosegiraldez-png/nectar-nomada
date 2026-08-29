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
