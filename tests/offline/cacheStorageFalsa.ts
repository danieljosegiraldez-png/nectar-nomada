/**
 * Una CacheStorage en memoria con lo que usan `public/sw.js` y
 * `lib/offline/paginasGuardadas.ts`, y nada más.
 *
 * Como la de verdad, `put` LEE el cuerpo de la respuesta, y `match` devuelve
 * una copia nueva cada vez. Las claves se resuelven contra el origen, así que
 * `"/offline.html"` y `"https://nn.test/offline.html"` son la misma entrada.
 *
 * `esperar()` existe porque `sw.js` guarda sin esperar (no bloquea la
 * navegación mientras escribe la caché): una prueba que mira la caché justo
 * después tiene que dejar terminar esas escrituras primero.
 */

type Clave = string | { url: string };

interface Guardada {
  cuerpo: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
}

export class CacheFalsa {
  private readonly entradas = new Map<string, Guardada>();

  constructor(
    private readonly almacen: CacheStorageFalsa,
    private readonly origen: string,
  ) {}

  private url(clave: Clave): string {
    return new URL(typeof clave === "string" ? clave : clave.url, this.origen).href;
  }

  put(clave: Clave, respuesta: Response): Promise<void> {
    const url = this.url(clave);
    const escritura = respuesta.arrayBuffer().then((cuerpo) => {
      this.entradas.set(url, {
        cuerpo,
        status: respuesta.status,
        statusText: respuesta.statusText,
        headers: [...respuesta.headers.entries()],
      });
    });
    this.almacen.pendientes.push(escritura);
    return escritura;
  }

  async addAll(claves: Clave[]): Promise<void> {
    for (const clave of claves) await this.put(clave, await this.almacen.descargar(this.url(clave)));
  }

  async match(clave: Clave): Promise<Response | undefined> {
    const g = this.entradas.get(this.url(clave));
    return g ? new Response(g.cuerpo.slice(0), { status: g.status, statusText: g.statusText, headers: g.headers }) : undefined;
  }

  async delete(clave: Clave): Promise<boolean> {
    return this.entradas.delete(this.url(clave));
  }

  rutas(): string[] {
    return [...this.entradas.keys()].map((u) => new URL(u).pathname);
  }
}

export class CacheStorageFalsa {
  readonly pendientes: Promise<unknown>[] = [];
  private readonly almacenes = new Map<string, CacheFalsa>();

  constructor(
    private readonly origen = "https://nn.test",
    readonly descargar: (url: string) => Promise<Response> = async (url) => new Response(`página ${new URL(url).pathname}`),
  ) {}

  async open(nombre: string): Promise<CacheFalsa> {
    let cache = this.almacenes.get(nombre);
    if (!cache) {
      cache = new CacheFalsa(this, this.origen);
      this.almacenes.set(nombre, cache);
    }
    return cache;
  }

  async has(nombre: string): Promise<boolean> {
    return this.almacenes.has(nombre);
  }

  async delete(nombre: string): Promise<boolean> {
    return this.almacenes.delete(nombre);
  }

  async keys(): Promise<string[]> {
    return [...this.almacenes.keys()];
  }

  async match(clave: Clave, opciones: { cacheName?: string } = {}): Promise<Response | undefined> {
    const nombres = opciones.cacheName ? [opciones.cacheName] : [...this.almacenes.keys()];
    for (const nombre of nombres) {
      const r = await this.almacenes.get(nombre)?.match(clave);
      if (r) return r;
    }
    return undefined;
  }

  /** Deja terminar las escrituras que `sw.js` lanzó sin esperar. */
  async esperar(): Promise<void> {
    while (this.pendientes.length) await this.pendientes.shift();
  }

  /** Las rutas guardadas en `nombre`, o `[]` si esa caché no existe. */
  async urlsDe(nombre: string): Promise<string[]> {
    return this.almacenes.get(nombre)?.rutas() ?? [];
  }
}
