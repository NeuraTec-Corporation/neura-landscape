"use client";
import {useId,useState} from "react";
import Image from "next/image";
export type LocatedAddress={line1:string;line2:string;city:string;region:string;postal_code:string;country:string;latitude:number|null;longitude:number|null;place_id:string};
/** Reusable selection control; provider credentials and account budgets stay on the server. */
export function GoogleAddressSearch({onSelect}:{onSelect:(address:LocatedAddress)=>void}){
 const id=useId(),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[suggestions,setSuggestions]=useState<{id:string;label:string}[]>([]),[note,setNote]=useState("");
 async function search(){setBusy(true);setNote("");setSuggestions([]);try{
  const r=await fetch(`/api/addresses?q=${encodeURIComponent(query.trim())}`,{cache:"no-store"}),data=await r.json();if(!r.ok)throw Error(data.error);setSuggestions(data.suggestions??[]);setNote(data.enabled===false?"Google Places no está disponible. Completa la dirección manualmente.":data.suggestions?.length?"Selecciona la dirección y revisa sus datos antes de guardar.":"Sin resultados. Prueba con calle, ciudad y estado.");
 }catch(e){setNote(e instanceof Error?e.message:"No se pudo buscar la dirección.");}finally{setBusy(false);}}
 async function select(place:string){setBusy(true);setNote("");try{
  const r=await fetch(`/api/addresses?place=${encodeURIComponent(place)}`,{cache:"no-store"}),data=await r.json();if(!r.ok)throw Error(data.error);onSelect(data.address);setSuggestions([]);setQuery("");setNote("Dirección y coordenadas seleccionadas. Revisa los campos y guarda la ficha.");
 }catch(e){setNote(e instanceof Error?e.message:"No se pudo obtener la dirección.");}finally{setBusy(false);}}
 return <div className="address-lookup"><label htmlFor={id}>Buscar dirección con Google<input id={id} value={query} disabled={busy} maxLength={200} onChange={e=>{setQuery(e.target.value);setSuggestions([]);setNote("");}} placeholder="Calle, ciudad y estado"/></label><button type="button" disabled={busy||query.trim().length<4} onClick={search}>{busy?"Consultando…":"Buscar dirección"}</button>{note?<p role="status">{note}</p>:null}{suggestions.length?<><ul aria-label="Direcciones sugeridas">{suggestions.map(s=><li key={s.id}><button type="button" disabled={busy} onClick={()=>select(s.id)}>{s.label}</button></li>)}</ul><Image unoptimized src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" width={144} height={18}/></>:null}</div>;
}
