"use client";
import { useEffect, useRef, useState } from "react";
type Location={id:string;property_name:string;latitude:number|null;longitude:number|null};
type MapInstance={fitBounds:(bounds:unknown)=>void};
type Overlay={setMap:(map:null)=>void;addListener:(event:string,callback:()=>void)=>void};
type MapsSDK={Map:new(node:HTMLElement,options:object)=>MapInstance;Circle:new(options:object)=>Overlay;LatLngBounds:new()=>{extend:(point:object)=>void};InfoWindow:new(options:object)=>{open:(options:object)=>void;close:()=>void}};
type MapsWindow=Window&{google?:{maps:MapsSDK};landscapeMapReady?:()=>void};
let sdkPromise:Promise<MapsSDK>|null=null;
function loadSDK(key:string){
 if(!sdkPromise)sdkPromise=new Promise<MapsSDK>((resolve,reject)=>{
  const w=window as MapsWindow;if(w.google?.maps){resolve(w.google.maps);return;}
  const script=document.createElement("script");script.async=true;
  w.landscapeMapReady=()=>{delete w.landscapeMapReady;if(w.google?.maps)resolve(w.google.maps);else reject(Error("No se pudo cargar Google Maps."));};
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=landscapeMapReady&v=quarterly&language=es`;
  script.onerror=()=>{sdkPromise=null;script.remove();delete w.landscapeMapReady;reject(Error("No se pudo cargar Google Maps. Comprueba la conexión."));};
  document.head.append(script);
 });
 return sdkPromise;
}
export function GoogleRouteMap({stops,configured}:{stops:Location[];configured:boolean}){
 const host=useRef<HTMLDivElement>(null),map=useRef<MapInstance|null>(null),sdk=useRef<MapsSDK|null>(null),alive=useRef(true);
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState("");
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!ready||!map.current||!sdk.current)return;
  const api=sdk.current,bounds=new api.LatLngBounds(),overlays:Overlay[]=[],windows:{close:()=>void}[]=[];
  for(const stop of stops){if(stop.latitude===null||stop.longitude===null)continue;const center={lat:stop.latitude,lng:stop.longitude};bounds.extend(center);
   const dot=new api.Circle({map:map.current,center,radius:30,fillColor:"#b9d578",fillOpacity:1,strokeColor:"#163d30",strokeWeight:3});
   const label=document.createElement("strong");label.textContent=stop.property_name;
   const info=new api.InfoWindow({content:label,position:center});dot.addListener("click",()=>{for(const w of windows)w.close();info.open({map:map.current});});overlays.push(dot);windows.push(info);
  }
  if(overlays.length)map.current.fitBounds(bounds);
  return()=>{for(const dot of overlays)dot.setMap(null);for(const info of windows)info.close();};
 },[stops,ready]);
 async function activate(){setBusy(true);setError("");try{
  const r=await fetch("/api/routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"load_map"})}),data=await r.json();if(!r.ok)throw Error(data.error);
  const api=await loadSDK(data.key);if(!alive.current||!host.current)return;sdk.current=api;host.current.hidden=false;map.current=new api.Map(host.current,{center:{lat:40.88,lng:-74.08},zoom:12,maxZoom:19,streetViewControl:false,clickableIcons:false,mapTypeControl:true,fullscreenControl:true});setReady(true);
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:"No se pudo abrir el mapa.");}finally{if(alive.current)setBusy(false);}}
 return <section className="panel"><h2>Mapa de las paradas</h2><p>Selecciona una cuadrilla. Pulsa cada punto para identificar la localidad. Puedes cambiar entre mapa y satélite.</p>{!ready?<button type="button" disabled={!configured||busy||!stops.length} onClick={activate}>{busy?"Cargando mapa…":"Abrir mapa interactivo"}</button>:null}{!configured?<p>Google Maps pendiente de configuración.</p>:null}{error?<p role="alert" className="notice error">{error}</p>:null}<div ref={host} className="road-map" hidden={!ready}/>{ready?<small>Solo posiciones de localidades; no muestra ubicación en vivo de empleados o vehículos.</small>:null}</section>;
}
