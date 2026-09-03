---
name: project-status
description: Use when the user asks for a status check, wants to know what's currently built/working, or asks "what's next." Runs the diagnostics this repository actually uses today, pulled from the real repository state — not from memory, not from what architecture docs claim, and not from a list someone maintains by hand.
---

# Project Status Check

**El primer paso no es un diagnóstico: es mirar qué decisiones esperan a
Daniel.** Está así en `CLAUDE.md` — se le llevan antes de proponer trabajo, no
después de haber trabajado.

## 1. Decisiones que sólo Daniel puede tomar

```bash
bash scripts/open-decisions.sh
```

Cada decisión se **prueba con un comando**, no se lee de una lista. Salidas:
`0` abierta, `1` cerrada, `2` indeterminada, y cualquier otra cosa es **ROTA** —
una orden mal escrita sale 127, y antes eso se contaba como «cerrada» y la
decisión desaparecía sin dejar rastro. Un `rotas>0` invalida el conteo entero:
arreglar la prueba antes de creerse el resumen.

## 2. La compuerta

```bash
bash scripts/ci.sh
```

Es el mismo comando en local y en CI: genera el cliente de Prisma, corre
`npm run verify` (typecheck, presupuesto de estado, inventario de rutas, lint) y
los tests herméticos.

**Leer el código de salida, no la última línea.** Nunca canalizarlo: el estado
de salida de una tubería es el del último comando, así que `ci.sh | tail` puede
decir 0 sobre una suite en rojo.

**La lista de tests herméticos está escrita a mano en `ci.sh`.** Un archivo de
test nuevo que nadie añada ahí **no corre**, y la compuerta sale verde igual:
pasó con once pruebas de backup que existieron diez días sin ejecutarse. Si el
recuento de pruebas no sube al añadir un archivo, es esto. Ver
`PENDING_IMPLEMENTATIONS/008`.

## 3. Estado del árbol y de la sesión

```bash
bash scripts/cierre-de-sesion.sh --rapido
```

Sirve igual para abrir que para cerrar: dice en qué rama estás —**no basta con
que el SHA coincida con `origin/main`**; una rama ajena que apunte al mismo
commit no es `main`, y un `pull` ahí mueve la rama de otra sesión—, si hay
cambios sin commitear, si otros worktrees tienen trabajo sin empujar, el
presupuesto del estado y el disco libre.

## 4. Base de datos

```bash
npx prisma migrate status
```

La suite **no** corre contra producción: `tests/setup.ts` rechaza una base
remota salvo `ALLOW_REMOTE_TEST_DB=1`. Para la suite completa hace falta
`npm run test:db -- up`, que restaura el backup verificado más nuevo en un
cluster local. Un runner no tiene ese backup — por eso CI sólo corre el
subconjunto hermético (`PENDING_IMPLEMENTATIONS/006`, con la cobertura medida).

## 5. Despliegue

```bash
npx vercel ls
```

**Un despliegue que dice «success» dice que la subida funcionó, no que la página
funcione.** Cargar el artefacto vivo y comprobar que el cambio está ahí.

## 6. Credenciales

Sólo presencia o ausencia, **nunca imprimir valores**. Comparar local contra lo
configurado en Vercel y señalar diferencias.

## 7. Qué está abierto de verdad

`SESSION_STATE.md` §1 y §3 son los bloqueos vigentes. `docs/PENDIENTES.md` es
histórico y **ya tuvo entradas falsas**: no se cita sin comprobar contra el
árbol. Lo aplazado a propósito está en `PENDING_IMPLEMENTATIONS/`, cada uno con
por qué y con qué lo desbloquearía. Lo que **no** se vuelve a proponer, en
`SESSION_STATE.md` §4.

## Cómo se reporta

Decir el estado real, separando **VERIFICADO** de **ASUMIDO**. No presentar lo
que afirma un documento de arquitectura como estado de construcción sin haberlo
comprobado contra el repositorio.

Y decir qué **no** se comprobó, en vez de dejarlo implícito: un informe que
calla sus huecos se lee como si no los tuviera.
