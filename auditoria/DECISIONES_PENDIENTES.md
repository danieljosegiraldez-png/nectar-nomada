# Decisiones pendientes de la auditoría

Lo que un hallazgo necesita y el kit prohíbe tocar sin aprobación de Daniel.
**Un hallazgo que aparece aquí no está corregido**, y aparece aquí precisamente
para que no se corrija por inercia.

---

## D-F2-01 · Qué forma tiene `MIXED` — viene de F2-001

**Qué falta decidir.** Un lote fusionado a partir de padres con orígenes distintos
no puede seguir diciendo que viene de uno de ellos. El criterio 7 pide que *«todo
atributo no idéntico entre padres se vuelva `MIXED` con su composición»*, y este
repositorio no tiene esa noción. Hay tres formas y cuestan distinto:

| forma | qué permite | qué cuesta |
|---|---|---|
| **columna anulable** (`locationId` a `null` + una marca) | decir «mezclado» y no mentir | lo más barato; **pierde la composición** — no contesta «¿qué proporción vino de dónde?» |
| **tabla de composición** (`LotOriginComposition`: lote, origen, proporción) | contesta la proporción, que es lo que una ficha honesta necesita | una tabla y su migración; es lo que el propio esquema ya anticipa en `schema.prisma:3244` para cultivares, sin construir |
| **valor de catálogo** `MIXED` en cada eje | uniforme con el resto del vocabulario | un valor de catálogo no lleva proporciones; acaba necesitando la tabla igual |

**Recomendación, y es de las que dejan de ser gratis pronto:** la tabla de
composición, porque el esquema ya la tiene prevista para cultivar y construir dos
mecanismos distintos —uno para cultivar, otro para origen— es la divergencia que
`README.md` avisa. Hoy ninguno de los dos existe, así que plegarlos cuesta cero.

**Lo que NO depende de esta decisión y se puede corregir ya:** el `orderBy`
ausente y la ausencia de guardia entre sitios distintos. Que el origen lo elija el
orden de recorrido de un índice no necesita aprobación de nadie.

---

## D-F2-02 · Qué cuenta como «transición destructiva» — viene del criterio 17

**Qué falta decidir.** El criterio pide que ninguna transición destructiva ocurra
sin confirmación humana, y antes de medirlo hay que saber cuáles son. Candidatas
que este repositorio ya tiene: `disposal`, `sale`, `loss`, cerrar un proceso,
sacar un lote de secado antes de su objetivo, y dividir un lote al 100 %.

**No se propone una lista**: quién decide qué es irreversible en un beneficio es
el dueño, y una lista inventada convertiría el criterio en una comprobación que
se cumple sola.

---

## D-F2-03 · Si un lote dividido al 100 % se cierra o sólo se avisa — viene de F2-003

**Qué falta decidir.** El criterio 4 dice «queda cerrado» y pide que el sistema lo
impida de verdad. Pero la decisión §7.1 de Daniel sobre instrumentos fue
justamente la contraria —**degradar, nunca bloquear**, porque bloquear se esquiva
en el patio y el sistema acaba sabiendo menos— y conviene preguntarle si esa misma
regla aplica aquí o si ésta es la excepción.

Son dos mundos distintos: una lectura tomada con un instrumento vencido sigue
siendo un hecho ocurrido; una lectura contra un lote que ya no está en ningún
tanque es, casi seguro, una equivocación de a qué lote se apuntó. **La segunda
parece caso de bloquear.** Pero es su criterio, no el mío.
