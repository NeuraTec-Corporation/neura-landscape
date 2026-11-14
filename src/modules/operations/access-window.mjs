import { planningDay, planningZone } from "./daily-capacity.mjs";
const minutes = t => Number(t.slice(0,2))*60+Number(t.slice(3,5));
/** Only an unambiguous daily interval is machine-readable. Never infer hours from prose. */
export function accessWindow(value) {
 const match=String(value||"").trim().match(/^([01]\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]\d|2[0-3]):([0-5]\d)$/u);
 if(!match)return null;
 const start=Number(match[1])*60+Number(match[2]),end=Number(match[3])*60+Number(match[4]);
 return end>start?{start,end}:null;
}
export function fitsAccess(scheduled, duration, value) {
 const window=accessWindow(value);if(!window)return false;
 const time=new Date(scheduled).toLocaleTimeString("en-GB",{timeZone:planningZone,hourCycle:"h23",hour:"2-digit",minute:"2-digit"});
 return minutes(time)>=window.start&&minutes(time)+duration<=window.end;
}
/** Resolve civil New York time including DST; reject nonexistent civil instants. */
export function planningInstant(day, minute) {
 const base=Date.parse(`${day}T00:00:00Z`)+minute*60000;
 let instant=base;
 for(let i=0;i<3;i++){
  const d=new Date(instant),civil=`${planningDay(d)}T${d.toLocaleTimeString("en-GB",{timeZone:planningZone,hourCycle:"h23",hour:"2-digit",minute:"2-digit",second:"2-digit"})}Z`;
  const delta=base-Date.parse(civil);if(!delta)return d.toISOString();instant+=delta;
 }
 return null;
}
