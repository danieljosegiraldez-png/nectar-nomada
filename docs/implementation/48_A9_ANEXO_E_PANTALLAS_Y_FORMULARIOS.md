# Pantallas y formularios de captura — módulo apícola

Tercera pieza del paquete, junto al brief del módulo y al plan de renumeración. Aquí se define qué ve y qué llena el operador. Ancho de referencia: 390 px.

**Nota de modelo:** donde este documento diga «sitio», léase «apiario». El nivel intermedio se eliminó al decidir que Finca 1 y Finca 2 son dos apiarios separados. Manda la secuencia de tickets.

---

## 1. La regla de los dos toques

Si hay una jornada abierta, la app entra directo en ella. Desde ahí:

```
toque 1 → colmena
toque 2 → tipo de evento
            ↓
        formulario ya con fecha, hora, sitio,
        operador y GPS resueltos
```

Nada de eso se pregunta. Si no hay jornada abierta, la primera pantalla ofrece abrirla y nada más; no compite con otras acciones.

## 2. Lista de apiarios

```
┌──────────────────────────────┐
│ Apiarios                     │
├──────────────────────────────┤
│ NN-06 TOABRE F2 · Kiva       │
│ 3 colmenas · 2 alertas       │
│ última visita hace 11 días   │
├──────────────────────────────┤
│ NN-05 TOABRE F1 · Kiva       │
│ 0 colmenas · sitio por corregir│
│ última visita hace 11 días   │
├──────────────────────────────┤
│ NN-03 Cerro Azul             │
│ 10 colmenas · al día         │
└──────────────────────────────┘
```

Orden por urgencia, no alfabético ni por código. Mapa cuando hay más de un sitio; entrada directa cuando hay uno solo. Lo vencido se ve desde aquí.

## 3. Sitio

```
┌──────────────────────────────┐
│ NN-06 TOABRE F2 · Kiva Estate│
│                              │
│ ⚠ Alimentación vencida       │
│   hace 5 semanas             │
│ ⚠ Consulta a vecinos vence   │
│   en 3 días                  │
│                              │
│ COLMENAS            3 vivas  │
│ ┌──────────────────────────┐ │
│ │ C-07  poblada            │ │
│ │ núcleo Parita · 2 sep    │ │
│ │ inspección hace 11 d     │ │
│ ├──────────────────────────┤ │
│ │ C-08  poblada            │ │
│ ├──────────────────────────┤ │
│ │ C-09  débil          ⚠   │ │
│ └──────────────────────────┘ │
│                              │
│ FLORA MELÍFERA               │
│ 4 especies · última obs 11 d │
│                              │
│ CONDICIONES DEL SITIO        │
│ FOTOS Y REPORTES             │
├──────────────────────────────┤
│    [ Registrar evento ]      │
└──────────────────────────────┘
```

Inventario primero, porque decide la acción del día. Flora después. Condiciones e historial al final, colapsados. La acción vive abajo, al alcance del pulgar.

## 4. Formularios, por tipo de evento

Cada uno se abre con fecha, hora, sitio, operador y GPS ya resueltos. Todos terminan igual: **observaciones** y **acción tomada**, que es lo único de texto libre. Todos aceptan foto, audio y video en cualquier punto.

**Inspección** (por colmena). Cuadros cubiertos de abejas. Cría presente y calidad del patrón. Reina vista o evidencia de postura. Reservas de miel. Reservas de polen. Varroa. Polilla. Hormigas. Celdas reales o señales de enjambrazón. Temperamento. Estado resultante de la colmena, que actualiza el inventario.

**Alimentación.** Producto y concentración. Cantidad. Método — en Toabré, bolsa de jarabe sobre los cabezales. **Autonomía estimada en semanas**: este campo genera la alerta de la próxima visita y es el que faltaba en julio.

**Tratamiento sanitario.** Producto, dosis, motivo. Periodo de carencia y fecha en que se puede volver a cosechar: sin eso, una cosecha posterior queda comprometida y nadie se entera.

**Cosecha.** Alzas y cuadros retirados. Peso. Humedad si se midió. Destino, enlazado al lote de miel.

**Instalación o retiro de colmena.** Origen del núcleo o enjambre — Santa Fe, Parita, silvestre —, tipo de caja, especie o línea, estado de la reina. Da de alta o de baja en el inventario.

**Observación de floración.** Especie, fase fenológica, abundancia, recurso que aporta. Pensado para anotar varias especies seguidas sin salir del formulario.

**Incidente.** Tipo: deriva de agroquímico, hormigas, saqueo, animal, vandalismo, clima. Descripción y foto obligatoria.

**Consulta a fincas vecinas.** Finca, cultivo, aplicación prevista y fecha, quién informó. Es protocolo mensual, no una nota, y el sistema lo reclama solo.

## 5. Cierre de jornada

Una jornada abierta es visible en todas las pantallas hasta que se cierra. Al cerrarla: resumen de lo registrado, lo que quedó pendiente, y de ahí sale el reporte técnico al cliente — página web con enlace y opción de generar el PDF, sin almacenarlo.

Si la jornada lleva más de un día abierta, la app lo reclama. Hoy hay una del 13 de septiembre con cero eventos y sin cerrar, y nada la persigue.

## 6. Vocabulario

Un solo término para el vacío en toda la app. «Sin registrar» describe un dato que nadie anotó, no una opción que alguien elige: sácalo de las listas desplegables y déjalo solo como estado. Elimina «— elegir —».

Los textos de ayuda van colapsados y reescritos para apicultura. Los actuales hablan de fósforo Bray contra Mehlich y de perfiles de suelo compactado: no tienen nada que decirle a quien está abriendo una colmena.

## 7. Lo que se termina fuera del campo

En el patio: la lista de chequeo, lo que exige el protocolo de la actividad, y observaciones o acciones. Todo lo demás —redacción del reporte, análisis, atribución de costos, revisión de fotos— se hace después, en teléfono o laptop. Que los formularios no pidan en el patio lo que puede esperar a la casa.

## 8. Traslado de colmenas

La operación central de la apicultura migratoria: mover un grupo de colmenas de un apiario a otro en un solo gesto, no una por una.

```
┌──────────────────────────────┐
│ Trasladar colmenas           │
│ desde NN-01 Santa Fe         │
├──────────────────────────────┤
│ ☑ C-01 poblada               │
│ ☑ C-02 poblada               │
│ ☐ C-03 débil            ⚠    │
│ ☑ C-04 poblada               │
│   ...                        │
│ [ todas ] [ solo pobladas ]  │
├──────────────────────────────┤
│ Destino    ▾ NN-08 Sandía    │
│ Fecha      13 sep 2026       │
│ Motivo     ▾ polinización    │
│ Piqueras cerradas   ○ sí ○ no│
├──────────────────────────────┤
│ Santa Fe: 12 → 9             │
│ NN-08:     0 → 3             │
│      [ Confirmar traslado ]  │
└──────────────────────────────┘
```

Selección múltiple con atajos, porque nadie toca veinte casillas con guante. Motivos: polinización, corrección del emplazamiento, consolidación, rescate.

El traslado cierra la vigencia de cada colmena en el apiario de origen y abre la del destino en la misma operación. Nunca deja una colmena en dos lugares ni en ninguno. El conteo antes y después se muestra en ambos apiarios antes de confirmar, porque es el único control contra un traslado a medias.

Si el destino tiene aplicaciones previstas o un periodo de carencia corriendo, la pantalla lo advierte antes de confirmar. Meter colmenas a un cultivo que va a ser aspersado en tres días es el error que este módulo existe para evitar.

## 9. Emplazamiento temporal

Un servicio de polinización tiene apertura, vida y cierre propios, distintos de los del apiario.

**Al abrirlo:** parcela y cultivo, cliente, hectáreas, ventana de floración estimada, meta de colmenas por hectárea, colmenas comprometidas y referencia al contrato. Con eso el sistema ya sabe cuántas faltan y para cuándo.

**Durante:** colmenas presentes contra la meta, calendario de aplicaciones del cultivo con quién lo informó, carencias corriendo, inspecciones de la ventana. Dos alertas propias: que se acerque la floración con la meta incompleta, y que se acerque una aspersión anunciada.

**Al cerrarlo:** el retiro dispara el traslado de vuelta, y el reporte se genera con el alcance de la ventana —no de la vida del apiario— con las colmenas que estuvieron, los días efectivos y lo observado.

El mismo mecanismo sirve para Toabré: allí el emplazamiento simplemente no tiene fecha de cierre.
