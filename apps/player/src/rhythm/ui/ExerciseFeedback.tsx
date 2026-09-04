import {useEffect} from 'react';
import type {RhythmExercise} from '../domain/exercise';
import type {ExerciseResult,UserTap} from '../domain/result';
import {RhythmStaff} from '../notation/RhythmStaff';
import {playTimes} from '../audio/rhythm-playback';
import {hasMelody,playMelody} from '../audio/melody-playback';
import {analyzePerformance} from '../engine/performance-analysis';
import './feedback.css';
import './keyboard-hint.css';
import './exit-exercise.css';
import './analysis.css';

export function ExerciseFeedback({exercise,result,taps,index,onRepeat,onNext,onExit}:{exercise:RhythmExercise;result:ExerciseResult;taps:UserTap[];index:number;onRepeat:()=>void;onNext:()=>void;onExit:()=>void}){
  const expected=exercise.events.filter(event=>event.kind==='note').map(event=>event.startBeat*60000/exercise.bpm);
  const analysis=analyzePerformance(exercise.events,result.evaluations,result.extraTaps);
  useEffect(()=>{const advance=(event:KeyboardEvent)=>{if((event.code==='Space'||event.code==='Enter')&&!event.repeat){event.preventDefault();onNext()}};addEventListener('keydown',advance);return()=>removeEventListener('keydown',advance)},[onNext]);
  return <main className="page center feedback-page"><p className="eyebrow">RESULTADO</p><h1>{result.accuracy>=90?'¡Casi perfecto!':result.accuracy>=70?'¡Buen trabajo!':'Sigue el pulso'}</h1><div className="feedback-staff"><RhythmStaff exercise={exercise} evaluations={result.evaluations}/></div><div className="feedback-legend"><span className="perfect">✓ Perfecto</span><span className="correct">✓ Correcto</span><span className="early">← Adelantado</span><span className="late">→ Atrasado</span><span className="missed">○ Faltante</span></div><div className="play-row"><button onClick={()=>hasMelody(exercise.events)?playMelody(exercise.events,exercise.bpm):playTimes(expected)}>▶ Ejercicio</button><button onClick={()=>playTimes(taps.map(tap=>tap.relativeTimeMs))}>▶ Mi respuesta</button></div><div className="stats"><div><b>{result.score}</b><span>/ 500 puntos</span></div><div><b>{result.accuracy}%</b><span>Precisión</span></div><div><b>{result.averageErrorMs} ms</b><span>Desviación media</span></div></div>{exercise.totalBeats===8&&<section className="analysis-panel"><div><span>Pulso</span><b>{analysis.pulse}%</b></div><div><span>Ritmo</span><b>{analysis.rhythm}%</b></div><div><span>Continuidad</span><b>{analysis.continuity}%</b></div><div><span>Anticipación</span><b>{analysis.anticipation}%</b></div><p>{analysis.warnings[0]??`Contratiempos estables · confianza ${Math.round(analysis.confidence*100)}%`}</p></section>}<p className="keyboard-hint">Espacio o Enter · {index===9?'ver resumen':'siguiente tarea'}</p><div className="footer-actions"><button className="exit-exercise" onClick={onExit}>← Salir</button><span>{index+1}/10</span><button className="secondary" onClick={onRepeat}>↻ Repetir</button><button className="primary" onClick={onNext}>{index===9?'Ver resumen':'Siguiente →'}</button></div></main>;
}
