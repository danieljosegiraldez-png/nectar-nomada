# Programa de biochar de Finca Rosina

**Fecha:** 2026-09-16 · **Camino:** arquitectónico · **Responsable del programa:**
Bob Huerbsch (`rjhuerbsch@gmail.com`)

Diseño acordado con Daniel el 2026-09-16, a partir de lo que él contó en campo. **Casi
todo lo que decide este documento salió de preguntarle**, y donde sus números no cuadran
se dice cuál es la contradicción en vez de ajustarla en silencio.

---

## 1. Qué es esto, y por qué no cabe en lo que ya hay

El biochar de Finca Rosina no es un insumo que se compra: **se fabrica en la finca**, en
dos norias, con una receta que ha cambiado —las cargas anteriores no llevaban melaza— y
va a seguir cambiando. Eso pide tres cosas que hoy no existen juntas:

1. **La noria como recurso con capacidad.** Sin noria no se puede inocular; es
   infraestructura, no un accesorio.
2. **La receta como objeto versionado**, para poder decir «el biochar del Lote 4 salió
   de la receta v2, la que llevaba melaza» tres años después.
3. **El rastro hasta la taza**: qué carga de biochar tocó qué parcela, qué plantas hay
   en esa parcela, qué lote salió de ellas y cómo se cató.

---

## 2. Lo que Daniel contó, y la aritmética que no cuadra

**Éstos son sus números literales, y las contradicciones son del cálculo, no de él.**

### Las dos norias

| | Noria I | Noria II |
|---|---|---|
| Medidas | 10 × 10 ft, 16″ de hondo | 12 × 15 ft, 16″ de hondo |
| Área | 100 pie² | 180 pie² |
| **Volumen calculado** | **997 gal** (3.775 L) | **1.795 gal** (6.795 L) |
| Salida declarada | 170 cargas × 4,5 gal = **765 gal** | 255 cargas × 4,5 gal = **1.148 gal** |
| Rendimiento | 77 % del volumen | 64 % del volumen |

**La primera contradicción:** la Noria II es **1,80×** la I en área y volumen, pero su
salida declarada es sólo **1,50×**. Con el rendimiento de la I, la II debería dar **306
cargas**, no 255. Una de las dos cifras describe algo distinto —otro nivel de llenado,
otra receta, u otra manera de contar las cargas— y hay que medirlo, no promediarlo.

### La receta de 2026 (Noria I)

Para los plantones nuevos de Caturra, Pink Bourbon y Geisha:

| Ingrediente | Cantidad declarada | Unidad real |
|---|---|---|
| Gallinaza | 28 quintales (1 qq = 100 lb) = **2.800 lb = 1.270 kg** | masa |
| Hojarasca | 28 sacos de 40 gal = **1.120 gal = 150 pie³** | volumen |
| Melaza | 15 gal | volumen |
| Agua | «hasta completar» | **sin calcular** |
| Bolsas demo | 2, del doble que las de quintal | sin definir |

**La segunda contradicción, y es la que manda:** la hojarasca sola son **1.120 galones**
y la Noria I tiene **997**. El material de entrada no cabe en el recipiente **antes** de
añadir gallinaza y agua.

**Daniel lo explicó el 2026-09-16: el material se compacta al mezclar.** Suelto ocupa
mucho más; mojado con melaza y agua y revuelto, se asienta. O sea que **el volumen de
entrada y el volumen de la noria llena no son la misma magnitud**, y tratarlos como si
lo fueran es el error de cálculo. Ese factor de asentamiento **no está medido**.

**Y el «50-50» no se puede comprobar como está escrito**, porque un lado está en masa y
el otro en volumen. Con densidad de gallinaza de 35 lb/pie³ la proporción sale 0,53 a 1;
con 20 lb/pie³, 0,93 a 1. **El resultado cambia el doble según un número que nadie ha
medido.** Por eso el programa empieza pesando.

---

## 3. Lo que ya existe y NO se reconstruye — MEDIDO el 2026-09-16

| Pieza | Estado |
|---|---|
| `BiocharBatch` | existe: código propio, ubicación de producción, materia prima, trazabilidad. **Cero filas hoy** |
| `ProcessRecipe` + `ProcessRecipeVersion` | existen, **versionadas e inmutables** — su comentario dice «cambiar una receta significa una versión nueva, nunca una edición». Pero su contenido son **rangos objetivo** (`ProcessTarget`), no una lista de ingredientes |
| `Equipment` | existe: tipo, formato, `isFixedInPlace`, ciclo de vida, aviso de revisión. **No tiene capacidad** |
| `MaterialConsumptionEntry` | existe y cuelga de una ubicación: material, lote del material, cantidad, unidad, operario |
| `TreatmentBatch` + `applyAmendment()` | existen y aplican biochar a una ubicación — **pero exigen un protocolo de investigación** |
| `VariableCatalog` | la maquinaria de vocabularios controlados, ya usada para cultivar y alimentación |

**Ausente, medido:** aplicar un lote de biochar a una parcela **fuera** de un protocolo
de investigación no tiene modelo. Y `Equipment` no puede declarar cuántos galones cabe.

---

## 4. Sección A — La noria es equipo, no instalación

`Equipment` con `kind` de noria, `isFixedInPlace: true`, y **capacidad propia**.

Va como equipo y no como `Location` por una razón concreta: una noria **se usa por
cargas, tiene capacidad y su estado importa** —si está en mantenimiento no se puede
inocular—. `Equipment` ya trae ciclo de vida y aviso de revisión; `Location` no.

**Capacidad: tres columnas, no una.**

```
lengthCm / widthCm / depthCm
```

Y el volumen se **deriva al leer**, nunca se guarda. Porque las medidas son lo que
alguien midió con una cinta y el volumen es una consecuencia: guardarlo permitiría que
los dos dejaran de cuadrar en silencio. Es la misma regla que el envejecimiento del
biochar, que también se deriva.

**Lo que NO hace:** no intenta modelar el nivel de llenado ni el asentamiento. Eso es
una medición de cada carga, no una propiedad de la noria (§C).

---

## 5. Sección B — La receta, versionada, con ingredientes

**No se reutiliza `ProcessRecipeVersion`**, y conviene decir por qué, porque el patrón sí
se copia. Esa tabla guarda **rangos objetivo** —«el pH debe estar entre 3,8 y 4,5»— y
está atada a corridas de fermentación y tueste. Una receta de biochar es una **lista de
ingredientes con cantidades**: otra forma, otro contenido. Forzarla ahí obligaría a que
un `ProcessTarget` significara dos cosas distintas según quién lo lea.

Lo que sí se copia entero es **la regla que la hace útil: una receta no se edita, se
versiona.** Sin eso, «el biochar del Lote 4» dejaría de significar nada en cuanto alguien
corrigiera la receta.

**`BiocharRecipe`** — el nombre y a qué organización pertenece.

**`BiocharRecipeVersion`** — inmutable. Una versión por cambio, con su fecha y su autor.
La de 2026 lleva melaza; las anteriores no, y **ésa es exactamente la diferencia que hay
que poder consultar**.

**`BiocharRecipeIngredient`** — por versión: material, cantidad, unidad, y **opcional a
propósito**. El agua de esta receta es «hasta completar» y no tiene número: se registra
el ingrediente con cantidad nula y su nota, en vez de inventar un volumen o de omitirlo
y fingir que no lleva agua.

**Las unidades no se normalizan.** La gallinaza se compra en quintales y la hojarasca en
sacos; convertir todo a kilos al guardar perdería la unidad en la que la finca de verdad
trabaja, y es la que el operario va a teclear. La conversión se hace al comparar, con la
densidad declarada, y **si falta la densidad la comparación no se hace: se declara la
limitación**. Es la misma doctrina de avisar y no callar.

---

## 6. Sección C — La carga: donde el plan se encuentra con la realidad

Una **carga de noria** es una ejecución de una receta en una noria concreta.

```
BiocharRun:  noria (Equipment) + receta (BiocharRecipeVersion)
             + fecha + operario
             + cargas producidas  (170, 255…)
             + tamaño de la carga (4,5 gal)
             → produce un BiocharBatch
```

**Y aquí van las dos mediciones que hoy faltan**, cada una en su sitio:

- **El nivel de llenado**, porque la receta no cabe suelta y sí compactada. Se mide en la
  carga, no en la receta: la misma receta se asienta distinto según la humedad y el
  revuelto.
- **La densidad de cada material**, sin la cual el «50-50» no significa nada.

**Un `BiocharRun` sin esos datos es válido.** Registra lo que se sabe y declara lo que
falta —`SIN_DENSIDAD`, `SIN_NIVEL_DE_LLENADO`— igual que el secado declara
`SIN_INSTRUMENTO_DECLARADO`. Bloquear el registro hasta tener la báscula significaría
que la carga del martes no queda escrita en ninguna parte.

---

## 7. Sección D — Del biochar a la taza

La cadena que Daniel pidió —«plant specimen, microparcel micro lot, lot to cupping»—
existe **a trozos**, y el biochar sólo tiene que engancharse en el primero:

```
BiocharBatch → aplicación a una PARCELA → PlantingCohort de esa parcela
             → lote de café de esa parcela → sesión de catación
```

**El eslabón que falta es el primero**, y ya está medido: aplicar biochar a una parcela
fuera de un protocolo de investigación no tiene modelo. Hoy se registra como
`MaterialConsumptionEntry` enlazado **por código** en `batchLabel`, porque la clave
foránea no existe (ver `scripts/p1-biochar-2023.ts`). El programa la necesita de verdad:
sin clave foránea, «qué parcelas recibieron la carga de 2023» es una búsqueda por texto.

**Lo que NO hace este diseño:** no toca la catación ni el lote. Esos eslabones existen y
funcionan; lo que falta es engancharse a ellos, no rehacerlos.

---

## 8. La sesión de campo — martes 22 o miércoles 23 de septiembre de 2026

**Daniel quiere estar presente para documentarlo.** Esto no es una nota de agenda: el
spec se escribe sabiendo que estos números llegan, y por eso los deja como huecos
nombrados en vez de inventarlos.

**Qué hay que medir, y por qué cada uno:**

| Medir | Por qué |
|---|---|
| **Altura real de cada noria**, del fondo al borde | Las 16″ pueden ser la capa de trabajo y no el recipiente. Cambia los dos volúmenes |
| **Peso de un saco de hojarasca lleno**, y su volumen | Da la densidad, sin la cual el «50-50» no es comprobable |
| **Peso y volumen de un quintal de gallinaza** | Lo mismo por el otro lado |
| **Altura de la mezcla en la noria, antes y después de revolver** | El factor de asentamiento: la diferencia entre 1.120 gal de entrada y 997 de recipiente |
| **Galones de agua que entran de verdad** | Hoy es «hasta completar» |
| **Volumen de una bolsa demo** | «El doble que las de quintal» es una razón, no una medida |
| **Cargas reales que salieron**, contadas | Para cerrar la contradicción 1,80× / 1,50× |

---

## 9. Decisiones abiertas — de Daniel, no mías

1. **Las recetas anteriores sin melaza.** Él dijo «hay que revisar esto». ¿Se registran
   como versiones anteriores de la misma receta —lo que permitiría comparar impacto— o
   como otra receta distinta?
2. **Quién puede crear y versionar una receta.** El programa lo gestiona Bob, que es
   `Farm Manager`. ¿Basta con eso o la receta merece su propio permiso, como pasó con
   `lot:release`?
3. **Si el programa cubre las dos norias como una sola cosa** o cada noria lleva su
   propia línea de recetas.

---

## 10. Fuera de alcance

- **La catación y el lote de café.** Existen; esto se engancha a ellos.
- **El inventario de materiales.** `MaterialConsumptionEntry` registra lo que se
  consume, no lo que queda. Saber si hay gallinaza suficiente es otro trabajo.
- **La aplicación de enmienda dentro de un protocolo de investigación.** Ya existe
  (`applyAmendment`), y este programa es la vía de faena, no la de ensayo.
