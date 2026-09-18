<!--
  PROCEDENCIA — léela antes de citar nada de este archivo.

  estado    : referencia externa
  origen    : Gerardo Gennari, «Manejo racional de las abejas nativas sin aguijón
              (ANSA)». INTA, Centro Regional Tucumán – Santiago del Estero, Estación
              Experimental Agropecuaria Famaillá, Argentina, 2019. 48 páginas.
              Entregado por Daniel el 2026-09-15 como «súper importante».
  sha256    : 25c480a269a4516eec0290d6e6aee381db183940cbcb156878feacd1ac0c9a7d
              (el del PDF, 7.120.302 bytes). Los datos de arriba se extrajeron DEL
              PROPIO PDF —portada, página 2 y metadatos—, no de memoria.
  revisado  : es una obra publicada por un instituto técnico, con autor y fecha.
  qué puede : servir de referencia técnica para el meliponario, citando página.
  qué NO    : trasladar sus medidas y calendarios a Panamá sin comprobar la especie.

  ESTO ES UNA FICHA, NO EL LIBRO. El PDF es una obra publicada y no se versiona
  aquí. Vive en el ordenador de Daniel; si él decide que el repositorio lo guarde,
  se añade entonces con su sha, que es el de arriba.
-->

# Ficha — Manejo racional de las abejas nativas sin aguijón (ANSA)

## La advertencia que va primero: es de Tucumán, no de Panamá

**Los géneros coinciden con los de Daniel; las especies, no.** Medido en el texto del
PDF, las especies que nombra y cuántas veces:

| especie del libro | menciones | género panameño equivalente de Daniel |
|---|---|---|
| *Tetragonisca fiebrigi* | 10 | *Tetragonisca angustula* (angelita) |
| *Scaptotrigona jujuyensis* | 6 | *Scaptotrigona pectoralis* |
| *Geotrigona argentina* | 4 | — |
| *Melipona baeri* | 2 | *Melipona* sp. panameña |

Así que **las medidas de caja, los calendarios y los tiempos de división del libro son
para especies argentinas en clima subtropical**. Sirven como método y como punto de
partida; no como cifra para una especie de Panamá sin comprobarla.

## Qué cubre, por página

Índice reconstruido de los encabezados del PDF (no trae índice embebido):

| pág. | sección |
|---|---|
| 5 | Presentación |
| 6 | Biodiversidad: las abejas del mundo |
| 9 | Meliponas, trigonas y lestrimelitas |
| 11 | Meliponas |
| 15 | La colonia y su funcionamiento |
| 21 | Meliponicultura |
| 23 | El meliponario |
| 24 | Cámara de cría |
| 27 | Multiplicación de las colonias |
| 32 | Plagas y predadores |
| 40 | Cosechar y acondicionar miel, polen, propóleos y cera |
| 41 | Parámetros (de la miel) |
| 46 | Propóleos |
| 47 | Calendario de manejo |

## Lo que de él ya sostiene decisiones del repositorio

- **El meliponario como sitio propio** (ADR-145): el libro describe la caja **FO-INTA**
  —techo, cámara de cría, alza melaria— con **medidas que cambian por especie**, que es
  vocabulario distinto del Langstroth de las Apis. Por eso un meliponario no es un
  apiario con otro nombre.
- **La revisión no es la misma**: potes en vez de cuadros, **mosca fórida** en vez de
  varroa, matriz, pillaje. Es la razón de que el catálogo de especies tenga que impedir
  que una melipona herede varroa y cuadros — la mitad del meliponario que sigue
  bloqueada en los cinco nombres de Daniel.

## Y lo que contradice

`docs/dominio/meliponini-especies.md` y `meliponini-seeder.js.txt` dan medidas de caja
por especie **sin citar fuente, y discrepan entre sí**. Este libro es la única fuente
publicada del lote. Cuando se construya el catálogo de especies, las medidas salen de
aquí —o de otra obra citada— con su página al lado, no de aquellos dos.
