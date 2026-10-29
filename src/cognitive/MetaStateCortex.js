/** Operational meta-state score, not a consciousness/biological/emotional measurement. */
export function computeMetaState({workload={},chronos={},memory={},aiConfidence=1}={}){
 const cpu=Math.max(0,Math.min(100,Number(workload.cpuPercent)||0)),heap=Math.max(0,Math.min(100,Number(workload.heapPercent)||0));
 const total=Math.max(0,Number(chronos.success)||0)+Math.max(0,Number(chronos.failed)||0),failRate=total?Math.max(0,Number(chronos.failed)||0)/total:0;
 const memoryLoad=Math.max(0,Math.min(1,(Number(memory.sessions)||0)/Math.max(1,Number(memory.maxUsers)||2000)));
 const confidence=Math.max(0,Math.min(1,Number(aiConfidence)||0));
 const health=Math.round(Math.max(0,Math.min(100,100-(cpu*.22)-(heap*.28)-(failRate*25)-(memoryLoad*10)-((1-confidence)*8)))*10)/10;
 return {healthIndex:health,operationalEntropy:Math.round((100-health)*10)/10,state:health<35||workload.state==='CRITICAL'?'CRITICAL':health<60||workload.state==='HIGH'?'DEGRADED':'STABLE',components:{cpuPercent:cpu,heapPercent:heap,jobFailureRate:Math.round(failRate*1000)/1000,memoryLoad:Math.round(memoryLoad*1000)/1000,aiConfidence:Math.round(confidence*100)/100},notice:'Indeks operasional heuristik; bukan ukuran kesadaran, kortisol, emosi, atau jiwa biologis.'};
}
