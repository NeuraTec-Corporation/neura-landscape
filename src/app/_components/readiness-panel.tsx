"use client";
import { useEffect,useState } from "react";
type Check={key:string;label:string;status:string;detail:string};
export function ReadinessPanel(){
 const [data,setData]=useState<{checked_at:string;commercialReady:boolean;checks:Check[]}|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();fetch("/api/readiness",{cache:"no-store",signal:controller.signal}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);setData(v);}).catch(e=>{if(e.name!=="AbortError")setError(e.message);});return()=>controller.abort();},[]);
 const labels:Record<string,string>={configured:"Configurado",evaluation:"Evaluación",pending:"Pendiente",attention:"Requiere atención"};
 return <section className="panel"><h2>Control de preparación operativa</h2><p>Estado calculado para la empresa seleccionada. Configurado indica que existe la función o configuración; no certifica que sus datos estén completos ni autoriza uso comercial.</p>{error?<p role="alert">{error}</p>:null}{data?<><p>Consulta: {new Date(data.checked_at).toLocaleString("es-US")} · Preparación comercial pendiente.</p><div className="manage-card-grid">{data.checks.map(c=><article key={c.key} className="panel"><span className="status-tag">{labels[c.status]}</span><h3>{c.label}</h3><p>{c.detail}</p></article>)}</div></>:<p role="status">Consultando controles…</p>}</section>;
}
