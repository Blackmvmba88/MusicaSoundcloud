import type {RhythmEvent} from '../domain/rhythm-event';
import type {PerformanceAnalysis,TapEvaluation} from '../domain/result';

const percent=(value:number)=>Math.max(0,Math.min(100,Math.round(value)));

export function analyzePerformance(events:RhythmEvent[],evaluations:TapEvaluation[],extraTaps:number):PerformanceAnalysis{
  const matched=evaluations.filter(item=>item.errorMs!==undefined);
  const errors=matched.map(item=>item.errorMs!);
  const expectedById=new Map(events.map(event=>[event.id,event]));
  const offbeats=evaluations.filter(item=>{const beat=expectedById.get(item.expectedEventId)?.startBeat;return beat!==undefined&&Math.abs(beat-Math.round(beat))>.001});
  const offbeatErrors=offbeats.filter(item=>item.status==='early'||item.status==='late'||item.status==='missed').length;
  const early=errors.filter(error=>error<0),missed=evaluations.length-matched.length;
  const meanAbsolute=errors.length?errors.reduce((sum,error)=>sum+Math.abs(error),0)/errors.length:0;
  const evidence=[`${matched.length} de ${evaluations.length} ataques registrados`,`${offbeatErrors} errores en entradas fuera del pulso`,`Desviación absoluta media de ${Math.round(meanAbsolute)} ms`];
  const warnings:string[]=[];
  if(offbeatErrors)warnings.push(`${offbeatErrors} contratiempo${offbeatErrors===1?'':'s'} necesitan más precisión`);
  if(early.length>=Math.max(2,matched.length/2))warnings.push(`Tiendes a adelantar: ${early.length} de ${matched.length} ataques`);
  if(extraTaps)warnings.push(`${extraTaps} pulsación${extraTaps===1?' extra':'es extra'}`);
  return{pulse:percent(100-meanAbsolute/1.8),rhythm:percent(matched.length/(evaluations.length||1)*100),continuity:percent(100-(missed+extraTaps)/(evaluations.length||1)*100),anticipation:early.length?percent(100-early.reduce((sum,error)=>sum+Math.abs(error),0)/early.length/1.8):100,reactionTimeMs:Math.round(meanAbsolute),offbeatErrors,confidence:matched.length/(evaluations.length||1),evidence,warnings,...(!matched.length&&{fallbackReason:'No hubo ataques coincidentes para calcular tendencia temporal'})};
}
