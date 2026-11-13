"use client";
import { useState } from "react";
import { PagedCollection } from "./paged-collection";
import { useCatalogs } from "./catalogs";
type Rate={id:string;name:string;unit_key:string;revision:number;unit_cost_cents?:number|null};
export function ResourceRates({resources,busy,onSave}:{resources:Rate[];busy:boolean;onSave:(input:unknown)=>Promise<boolean>}){
 const [values,setValues]=useState<Record<string,string>>({}),[reason,setReason]=useState(""),c=useCatalogs();
 const changed=resources.filter(r=>values[r.id]!==undefined&&values[r.id]!== (r.unit_cost_cents==null?"":String(r.unit_cost_cents/100)));
 return <section className="panel"><h2>Tarifas de esta empresa</h2><p>{resources.filter(r=>r.unit_cost_cents==null).length} recursos pendientes de valorar. Usa costos propios por unidad; no se cargan precios inventados. Los planes existentes conservan sus tarifas.</p>
 <fieldset disabled={busy}><div className="resource-table"><PagedCollection label="Tarifas por recurso" table={<table><thead><tr><th>Recurso</th><th>Unidad</th><th>Tarifa USD por unidad</th></tr></thead><tbody/></table>}>{resources.map(r=><tr key={r.id} data-search={`${r.name} ${c.label("element_unit",r.unit_key)}`}><td>{r.name}</td><td>{c.label("element_unit",r.unit_key)}</td><td><input aria-label={`Tarifa de ${r.name}`} type="number" min="0" max="1000000" step="0.01" value={values[r.id]??(r.unit_cost_cents==null?"":String(r.unit_cost_cents/100))} placeholder="Pendiente" onChange={e=>setValues(prev=>({...prev,[r.id]:e.target.value}))}/></td></tr>)}</PagedCollection></div>
 <form className="manage-form" onSubmit={async e=>{e.preventDefault();if(await onSave({action:"rates",reason,lines:changed.map(r=>({id:r.id,revision:r.revision,unit_cost:values[r.id]}))})){setValues({});setReason("");}}}><label>Motivo / referencia de tarifas *<input required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="submit" disabled={!changed.length||busy}>Guardar {changed.length} tarifas modificadas</button></form></fieldset></section>;
}
