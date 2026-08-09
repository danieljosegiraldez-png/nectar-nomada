import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["generated/**", ".next/**", "node_modules/**"],
  },
];

export default config;
