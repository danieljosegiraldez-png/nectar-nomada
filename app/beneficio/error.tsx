"use client";

import { PantallaDeError, type PropsDeError } from "../components/PantallaDeError";

/** R1 (ADR-197): ver `app/components/PantallaDeError.tsx`. */
export default function ErrorDeLaSeccion(props: PropsDeError) {
  return <PantallaDeError {...props} />;
}
