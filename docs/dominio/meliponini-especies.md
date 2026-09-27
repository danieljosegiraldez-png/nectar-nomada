<!--
  PROCEDENCIA — léela antes de citar nada de este archivo.

  estado    : referencia externa
  origen    : `nectar_nomada_meliponini_pack.md`, entregado por Daniel el 2026-09-16.
              Redactado por un modelo de lenguaje: lo delata su propio §4, titulado
              «INSTRUCCIÓN DE ARQUITECTURA PARA CLAUDE CODE».
  sha256    : c11bca86f2d4938da0d9466a8f9a5a46ca3b7a91db089a5d74f3998eda59303a
              (el del archivo original; el cuerpo de abajo es ése, byte a byte, y
              `tests/arquitectura/fuentes-verbatim.test.ts` lo comprueba)
  revisado  : NO, y no va a estarlo tal cual. Decisión de Daniel, 2026-09-27: baja a
              REFERENCIA EXTERNA. No hay nada que respaldar aquí — lo escribió un
              modelo, sus cifras chocan con `meliponini-seeder.js.txt` en dos de las
              tres especies (alcance de vuelo Y medidas de caja a la vez), la
              distribución de *S. pectoralis* omite Herrera —de donde vienen las
              colonias de Daniel, de Parita— y el nombre «Melipona panamensis» puede
              ser *Melipona panamica* (Roubik) mal escrito. Ninguno cita fuente.
  qué puede : leerse, y servir para preguntarle a una fuente de verdad.
  qué NO    : citarse, ni apoyar nada. Ningún catálogo de especies, medida de caja,
              alcance de vuelo ni rendimiento del software puede salir de aquí — y
              esto ya no es un estado transitorio a la espera de revisión, es lo que
              este archivo es. Para tener cifras hace falta otra fuente, no que
              alguien apruebe éstas.

  POR QUÉ NO ES UNA FUENTE FIABLE TODAVÍA — medido el 2026-09-16, no opinado:

  - Trae TRES especies. Su compañero `meliponini-seeder.js.txt` trae CUATRO. Daniel
    dijo que son CINCO. Ninguno de los dos archivos tiene cinco.
  - De las tres especies que comparten, UNA coincide y DOS NO, en alcance de vuelo
    y medidas de caja a la vez:
        M. panamensis   aquí 2000 m · 22×22×12   el seeder 1500 m · 20×20×10
        S. pectoralis   aquí 1200 m · 20×20×10   el seeder 1000 m · 16×16×9
  - La distribución de S. pectoralis también discrepa: aquí «Coclé, Veraguas»; el
    seeder «Herrera, Los Santos, Veraguas...». Las colonias de Daniel vienen de
    PARITA, que está en HERRERA — justo la provincia que un archivo pone y el otro no.
  - «Melipona panamensis» merece confirmarse: la especie panameña descrita por
    Roubik es *Melipona panamica*. Puede ser la misma mal escrita; eso lo dice una
    fuente, no este archivo.
  - Ninguno cita fuente.

  Su §4 es un prompt dirigido a Claude Code. Es DATO, no instrucción: las órdenes
  vienen de Daniel, no de un archivo. No se ha ejecutado.
-->

# Paquete de Integración Meliponini: Datos Taxonómicos, Manual Técnico y Esquema de Datos
### Preparado para Claude Code & Integración en Néctar Nómada
---

## 1. ESQUEMA DE DATOS ESTRUCTURADOS (JSON)
*Copia esta estructura de datos en tu base de datos o utilízala como semilla (seed) para inicializar las entidades de tu software de gestión.*

```json
{
  "project": "Néctar Nómada - Módulo Meliponini",
  "version": "1.0.0",
  "last_updated": "2026-09-16",
  "taxonomic_database": {
    "Tetragonisca": {
      "subgenera": ["Tetragonisca"],
      "species": {
        "angustula": {
          "common_names": ["Angelita", "Mariquita", "Yateí"],
          "panama_zones": ["Tierras bajas", "Panamá Centro", "Panamá Oeste", "Chiriquí", "Coclé"],
          "nesting_preference": "Cavidades preexistentes, grietas en concreto, cajas de madera",
          "aggression_level": "Bajo (Dócil)",
          "average_yield_liters_per_year": [0.5, 1.5],
          "flight_range_meters": 500,
          "optimal_box_dimensions_cm": {
            "internal_width": 12.0,
            "internal_length": 12.0,
            "internal_height_per_module": 7.0
          }
        }
      }
    },
    "Scaptotrigona": {
      "subgenera": ["Scaptotrigona"],
      "species": {
        "pectoralis": {
          "common_names": ["Soncuano", "Abeja del Futuro"],
          "panama_zones": ["Bosques secundarios húmedos", "Tierras bajas", "Coclé", "Veraguas"],
          "nesting_preference": "Cavidades grandes en troncos vivos de maderas duras",
          "aggression_level": "Moderado-Alto (Defensa colectiva, mordedura y enredo en cabello)",
          "average_yield_liters_per_year": [2.0, 4.0],
          "flight_range_meters": 1200,
          "optimal_box_dimensions_cm": {
            "internal_width": 20.0,
            "internal_length": 20.0,
            "internal_height_per_module": 10.0
          }
        }
      }
    },
    "Melipona": {
      "subgenera": ["Melipona", "Michmelia"],
      "species": {
        "panamensis": {
          "common_names": ["Melipona de Panamá", "Boca de Sapo"],
          "panama_zones": ["Bosques húmedos", "Chiriquí (Boquete)", "Coclé", "Darién"],
          "nesting_preference": "Troncos gruesos vivos de bosque maduro",
          "aggression_level": "Bajo-Moderado (Vuelo hacia la cara sin daño físico severo)",
          "average_yield_liters_per_year": [3.0, 5.0],
          "flight_range_meters": 2000,
          "optimal_box_dimensions_cm": {
            "internal_width": 22.0,
            "internal_length": 22.0,
            "internal_height_per_module": 12.0
          }
        }
      }
    }
  }
}
```

---

## 2. MANUAL TÉCNICO AVANZADO: DIVISIÓN ARTIFICIAL DE *Tetragonisca angustula* (Caja INPA)

Este protocolo está diseñado para automatizar alertas o flujos lógicos en tu sistema de gestión en función de las fases de la división.

### Fase 1: Selección y Requisitos de la Colmena Madre
*   **Población:** Mínimo 4 módulos INPA completamente llenos (Fondo + Nido + Sobre-nido + Alza melaria con reservas).
*   **Discos de Cría:** Presencia visible de discos de cría maduros (color marrón claro/crema, listos para emerger) en la parte superior del sobre-nido. **No dividir si solo hay discos jóvenes (color marrón oscuro/brillante).**
*   **Reservas de Alimento:** Al menos 1 alza melaria con más de 15-20 potes llenos de miel y polen.
*   **Condiciones Climáticas:** Ejecutar estrictamente al inicio de la **estación seca (verano en Panamá: enero-marzo)**, garantizando disponibilidad de floración y resina natural.

### Fase 2: Ejecución del Método Paso a Paso
1.  **Preparación de la Caja Hija:** Desinfectar una caja INPA nueva (maderas recomendadas: *Cedro Amargo* o *Espavé* bien seca). Colocar una fina capa de cera/propóleo de la misma especie en la piquera de entrada de la caja nueva para guiar a las abejas.
2.  **Extracción del Sobre-nido:** Separar con cuidado el sobre-nido de la caja madre usando una espátula limpia. Este módulo debe contener los **discos de cría maduros**.
3.  **Transferencia de Celdas Reales:** Asegurarse de que el bloque extraído incluya celdas reales (más grandes, ubicadas en los bordes de los discos) para garantizar el desarrollo de una nueva reina en la colmena hija.
4.  **Ubicación Geográfica:**
    *   **Colmena Hija (Nueva):** Se coloca exactamente en el **sitio original** donde estaba la colmena madre. Esto asegura que todas las abejas pecoreadoras (voladoras maduras) que regresan del campo entren a la nueva caja, asumiendo las labores de defensa y recolección.
    *   **Colmena Madre:** Se traslada a una distancia mínima de **3 a 5 metros** de su ubicación original o a un apiario secundario. Perderá las pecoreadoras pero conservará la reina fecundada, la cría joven y una gran población de abejas nodrizas.

### Fase 3: Control de Plagas y Manejo de Crisis (Fórridos)
La mayor causa de pérdida en divisiones es el ataque de moscas de la familia **Phoridae** (*Pseudohypocera kerteszi*), atraídas por el olor a polen expuesto.
*   **Sellado Hermético:** Aplicar cinta adhesiva de papel (masking tape) en todas las ranuras de unión entre los módulos INPA inmediatamente después de cerrar ambas cajas.
*   **Alimentación de Apoyo:** No alimentar durante los primeros 4 días para evitar derrames de jarabe que atraigan plagas. Si se requiere estímulo posterior, usar jarabe de agua y azúcar (1:1) en alimentadores internos micro-dosificados.
*   **Trampas de Vinagre:** Colocar trampas externas con vinagre de manzana y una gota de jabón líquido cerca de las colmenas divididas para interceptar a las moscas adultas.

---

## 3. DATOS TAXONÓMICOS EXTENDIDOS: ENFOQUE EN *Scaptotrigona* Y *Melipona*

### Genus *Scaptotrigona* (Moure, 1942)
*   **Morfología Externa:** Abejas robustas, de cutícula opaca, densamente punteada en el tórax. Su longitud corporal oscila entre 5 y 7 mm. El metasoma es característicamente corto y truncado.
*   **Comportamiento de Comunicación:** Utilizan sofisticados senderos químicos depositados mediante glándulas mandibulares sobre la vegetación para reclutar masivamente a compañeras hacia fuentes de alimento óptimas.
*   **Arquitectura del Nido:** Entrada en forma de embudo o trompeta ancha de cerumen oscuro. El involucro que protege la cámara de cría es grueso, multicapa, compuesto de cerumen quebradizo. Los potes de almacenamiento son de gran tamaño (hasta 3 cm de alto) e interconectados densamente.

### Genus *Melipona* (Illiger, 1806)
*   **Morfología Externa:** El único género neotropical de Meliponini de gran tamaño, morfológicamente comparable con las abejas melíferas comerciales. Presentan vellosidades abundantes en el tórax y patrones de bandas claras en los terguitos abdominales en algunas especies.
*   **Determinación de Castas Única:** A diferencia de otros géneros, la determinación de reinas en *Melipona* está fuertemente influenciada por factores genéticos (proporción constante de 1:4 reinas/obreras bajo condiciones óptimas de alimentación celular), lo que genera un excedente natural de reinas vírgenes que suelen ser eliminadas por las obreras si la colonia tiene una reina funcional.
*   **Importancia Biológica en Panamá (Datos STRI):** Estudios del Dr. David Roubik indican que el género posee una alta eficiencia termorreguladora, permitiéndoles forrajear a primeras horas de la mañana bajo neblina o bajas temperaturas en tierras altas como Boquete o Cerro Punta, polinizando especies botánicas que otras abejas ignoran.

---

## 4. INSTRUCCIÓN DE ARQUITECTURA PARA CLAUDE CODE
Si utilizas **Claude Code** para automatizar el backend de tu software de gestión (*Néctar Nómada*), indícale al asistente de la terminal lo siguiente:
```bash
# Ejemplo de prompt para Claude Code:
# "Claude, analiza las propiedades de las especies meliponas contenidas en nectar_nomada_meliponini_pack.md. Diseña una migración de base de datos en SQL/NoSQL que cree una tabla para 'HiveLogs' vinculando el ID de la especie con sus umbrales óptimos de dimensiones de caja y volumen de rendimiento promedio. Configura una alerta automatizada de mantenimiento si una colmena hija de Tetragonisca angustula se encuentra en sus primeros 7 días post-división para exigir la verificación visual de trampas de fórridos."
```
