// Provider/framework independent: a successful local copy is not cloud delivery.
export function backupHealth(status,{now=new Date(),maxAgeHours=36,checksumMatches=false,source}={}){
 const timestamp=Date.parse(status?.finished_at),ageHours=(new Date(now).getTime()-timestamp)/3600000;
 const reasons=[];
 if(!status?.completed)reasons.push('last_run_incomplete');
 if(!Number.isFinite(ageHours)||ageHours<0)reasons.push('invalid_timestamp');
 else if(ageHours>maxAgeHours)reasons.push('backup_stale');
 if(!checksumMatches)reasons.push('local_checksum_unverified');
 if(source&&status?.source!==source)reasons.push('source_changed_since_backup');
 return {healthy:reasons.length===0,reasons,age_hours:Number.isFinite(ageHours)?Math.round(ageHours*100)/100:null,maximum_age_hours:maxAgeHours,local_checksum_verified:checksumMatches,mounted_drive_copy_verified:status?.completed===true&&Boolean(status.drive_file),cloud_upload_verified:false,scheduler_execution_verified:false,scope:'Local status only; cloud delivery and scheduler execution require independent evidence.'};
}
