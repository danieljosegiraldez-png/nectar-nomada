"use client";

import { useEffect, useMemo, useState } from "react";

type Nodo = {
  id: string;
  parentId: string | null;
  level: "family" | "subfamily" | "descriptor";
  termOriginal: string;
  termEs: string | null;
  color: string | null;
  detail: { definition: string; sourceReference: string; license: string | null } | null;
  references: { id: string; modality: string; reference: string; preparation: string | null; intensity: unknown; sourceReference: string; license: string | null }[];
};

const niveles = ["family", "subfamily", "descriptor"] as const;

function polar(cx: number, cy: number, radio: number, angulo: number) {
  const a = ((angulo - 90) * Math.PI) / 180;
  return { x: cx + radio * Math.cos(a), y: cy + radio * Math.sin(a) };
}

function sector(desde: number, hasta: number, interior: number, exterior: number) {
  const a = polar(250, 250, exterior, hasta);
  const b = polar(250, 250, exterior, desde);
  const c = polar(250, 250, interior, desde);
  const d = polar(250, 250, interior, hasta);
  const grande = hasta - desde <= 180 ? 0 : 1;
  return `M ${a.x} ${a.y} A ${exterior} ${exterior} 0 ${grande} 0 ${b.x} ${b.y} L ${c.x} ${c.y} A ${interior} ${interior} 0 ${grande} 1 ${d.x} ${d.y} Z`;
}

export function RuedaInteractiva({ nodos, textos }: { nodos: Nodo[]; textos: Record<string, string> }) {
  const [modo, setModo] = useState<"circular" | "capas">("circular");
  const [seleccionado, setSeleccionado] = useState<string | null>(nodos[0]?.id ?? null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const guardado = localStorage.getItem("nn-rueda-modo");
      if (guardado === "circular" || guardado === "capas") setModo(guardado);
      else if (matchMedia("(max-width: 48rem)").matches) setModo("capas");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const cambiarModo = (nuevo: "circular" | "capas") => {
    setModo(nuevo);
    localStorage.setItem("nn-rueda-modo", nuevo);
  };
  const actual = nodos.find((n) => n.id === seleccionado) ?? null;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase();
    return q ? nodos.filter((n) => `${n.termOriginal} ${n.termEs ?? ""}`.toLocaleLowerCase().includes(q)) : nodos;
  }, [busqueda, nodos]);

  return <div className="nn-wheel-layout">
    <div>
      <div className="nn-wheel-controls">
        <label>{textos.search}<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
        <div role="group" aria-label={textos.mode}>
          <button type="button" aria-pressed={modo === "circular"} onClick={() => cambiarModo("circular")}>{textos.circular}</button>
          <button type="button" aria-pressed={modo === "capas"} onClick={() => cambiarModo("capas")}>{textos.layers}</button>
        </div>
      </div>
      {modo === "circular" ? <svg className="nn-wheel" viewBox="0 0 500 500" role="group" aria-label={textos.wheel}>
        {niveles.flatMap((nivel, indice) => {
          const delNivel = visibles.filter((n) => n.level === nivel);
          return delNivel.map((n, i) => {
            const paso = 360 / Math.max(delNivel.length, 1);
            const desde = i * paso;
            const hasta = (i + 1) * paso;
            const interior = 35 + indice * 68;
            const exterior = interior + 64;
            const medio = polar(250, 250, (interior + exterior) / 2, desde + paso / 2);
            return <g key={n.id} role="button" tabIndex={0} aria-label={n.termOriginal}
              onClick={() => setSeleccionado(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSeleccionado(n.id); }}>
              <path d={sector(desde, hasta, interior, exterior)} fill={n.color ?? "#d8c9ae"} stroke="white" strokeWidth="2" />
              {paso >= 18 ? <text x={medio.x} y={medio.y} textAnchor="middle" dominantBaseline="middle" fontSize="10">{n.termOriginal.slice(0, 18)}</text> : null}
            </g>;
          });
        })}
      </svg> : <div className="nn-wheel-layers">
        {niveles.map((nivel) => <section key={nivel}><h2>{textos[nivel]}</h2><div className="nn-chips">
          {visibles.filter((n) => n.level === nivel).map((n) => <button key={n.id} type="button" className="nn-chip" onClick={() => setSeleccionado(n.id)}>{n.termOriginal}</button>)}
        </div></section>)}
      </div>}
    </div>
    <aside className="nn-card" aria-live="polite">
      {actual ? <>
        <span className="nn-badge">{textos[actual.level]}</span>
        <h2>{actual.termOriginal}</h2>
        {actual.termEs ? <p>{actual.termEs}</p> : null}
        <p>{actual.detail?.definition ?? textos.noData}</p>
        <h3>{textos.references}</h3>
        {actual.references.length ? <ul>{actual.references.map((r) => <li key={r.id}>
          <strong>{r.reference}</strong> · {r.modality}{r.intensity == null ? "" : ` · ${textos.intensity} ${String(r.intensity)}`}
          <br />{r.preparation ?? textos.noData}
        </li>)}</ul> : <p>{textos.noData}</p>}
        <p className="nn-muted">{textos.source}: {actual.detail?.sourceReference ?? textos.noData}<br />{textos.license}: {actual.detail?.license ?? textos.noData}</p>
      </> : <p>{textos.choose}</p>}
    </aside>
  </div>;
}
