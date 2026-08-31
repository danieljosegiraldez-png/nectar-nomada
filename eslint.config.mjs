import nextConfig from "eslint-config-next";

/**
 * `app/**` no toca un cliente de base de datos directamente.
 *
 * El acceso a datos vive en `lib/<dominio>/`, donde están los guardias
 * (`requireLotAccess` y compañía). Una página o una acción que importe el
 * cliente se salta ese sitio sin que nada lo diga — que es exactamente lo que
 * este proyecto quiere que deje de poder pasar en silencio.
 *
 * Las cinco excepciones vigentes están inventariadas, con una razón por
 * entrada, en `docs/arquitectura/acceso-a-datos.allowlist.json`, y
 * `tests/arquitectura/acceso-a-datos.test.ts` impide que crezcan.
 *
 * Esto NO demuestra que la autorización sea correcta. Demuestra que un camino
 * de acceso crudo nuevo desde `app/**` no aparece sin que alguien lo vea.
 */
const prohibirClienteDesdeApp = {
  files: ["app/**/*.ts", "app/**/*.tsx"],
  ignores: [
    "app/actions/auth.ts",
    "app/actions/bookings.ts",
    "app/actions/checkout.ts",
    "app/actions/locale.ts",
    "app/my-nectar/page.tsx",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/lib/db", "**/lib/ai/db", "@/lib/db", "@/lib/ai/db"],
            message:
              "app/** no importa un cliente de base de datos. Usa un servicio de lib/<dominio>/, que es donde viven los guardias. Si de verdad hace falta, justifícalo en docs/arquitectura/acceso-a-datos.allowlist.json y añádelo a las excepciones de eslint.config.mjs.",
          },
        ],
      },
    ],
  },
};

const config = [
  ...nextConfig,
  {
    ignores: ["generated/**", ".next/**", "node_modules/**"],
  },
  prohibirClienteDesdeApp,
];

export default config;
