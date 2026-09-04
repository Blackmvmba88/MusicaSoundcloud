import {useCallback,useEffect,useRef,useState} from 'react';
import './global-tap.css';import './start-hint.css';import './player-order.css';import './song-exercise.css';import './tap-marks.css';import './player-layout.css';import './playhead.css';
import type {RhythmExercise} from '../domain/exercise';
import type {ExerciseResult,UserTap} from '../domain/result';
import {metronome} from '../audio/metronome';
import {hasMelody,playMelody} from '../audio/melody-playback';
import {evaluateTaps} from '../engine/evaluator';
import {scoreEvaluations} from '../engine/scoring';
import {RhythmStaff} from '../notation/RhythmStaff';
import {MetronomeVisual} from './MetronomeVisual';
import {MeasurePlayhead} from './MeasurePlayhead';

export function ExercisePlayer({exercise,index,onComplete}:{exercise:RhythmExercise;index:number;onComplete:(result:ExerciseResult,taps:UserTap[])=>void}){
  const[phase,setPhase]=useState<'ready'|'waiting'|'play'>('ready'),[beat,setBeat]=useState(0),[visualStart,setVisualStart]=useState(0),[taps,setTaps]=useState<UserTap[]>([]);
  const exerciseStart=useRef(0),done=useRef<number|undefined>(undefined),starting=useRef(false);
  const measureMs=(exercise.totalBeats??4)*60000/exercise.bpm;
  const firstAttackMs=(exercise.events.find(event=>event.kind==='note')?.startBeat??0)*60000/exercise.bpm;
  const finish=useCallback((all:UserTap[])=>{metronome.stop();const raw=evaluateTaps(exercise.events,all,exercise.bpm);onComplete(scoreEvaluations(raw.evaluations,raw.extraTaps),all)},[exercise,onComplete]);
  const scheduleFinish=(all:UserTap[],elapsed=0)=>{if(done.current)clearTimeout(done.current);done.current=window.setTimeout(()=>finish(all),Math.max(0,measureMs-elapsed+250))};
  const begin=async()=>{if(starting.current||phase!=='ready')return;starting.current=true;await metronome.resume();setPhase('waiting');setTaps([]);const train=metronome.startPulseTrain(exercise.bpm,setBeat);setVisualStart(train.startWallTime)};
  const tap=useCallback(()=>{if(phase==='ready')return;metronome.tapFeedback();const now=performance.now();if(phase==='waiting'){exerciseStart.current=now-firstAttackMs;if(hasMelody(exercise.events))void playMelody(exercise.events,exercise.bpm,0);const first={timestampMs:Date.now(),relativeTimeMs:firstAttackMs};setPhase('play');setTaps([first]);scheduleFinish([first],firstAttackMs);return}const entry={timestampMs:Date.now(),relativeTimeMs:now-exerciseStart.current};if(entry.relativeTimeMs>measureMs+180)return;setTaps(old=>{const next=[...old,entry];scheduleFinish(next,entry.relativeTimeMs);return next})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,finish,measureMs,firstAttackMs]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.code==='Space'||event.code==='Enter')&&!event.repeat){event.preventDefault();if(phase==='ready')void begin();else tap()}};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,tap]);
  useEffect(()=>()=>{if(done.current)clearTimeout(done.current);metronome.stop()},[]);
  return <main className="page player global-tap" onPointerDown={event=>{event.preventDefault();if(phase==='ready')void begin();else tap()}}><header><span>Tarea {index+1} de 10</span><div className="progress"><i style={{width:`${(index+1)*10}%`}}/></div><span>{exercise.bpm} BPM</span></header><p className="exercise-source-title">{exercise.title}</p><section className="exercise-card"><div className="staff-stage"><RhythmStaff exercise={exercise}/><MeasurePlayhead startTimeMs={phase==='play'?exerciseStart.current:visualStart} durationMs={measureMs} loop={phase==='waiting'}/></div><div className="tap-marks" aria-label={`${taps.length} pulsaciones registradas`}>{taps.map((item,value)=><i key={`${item.timestampMs}-${value}`} style={{left:`${Math.min(100,item.relativeTimeMs/measureMs*100)}%`}} title={`${Math.round(item.relativeTimeMs)} ms`}/>)}</div><p className="count-label">{phase==='ready'?'Observa los dos compases y prepárate':phase==='waiting'?'El metrónomo está listo · pulsa en la primera nota':'Partida en curso · sigue el ritmo'}</p></section><MetronomeVisual bpm={exercise.bpm} startTimeMs={visualStart} beat={beat} active={phase!=='ready'}/>{phase==='ready'?<div className="global-start-hint"><strong>Haz clic en cualquier parte para activar el metrónomo</strong><small>También puedes usar Espacio o Enter</small></div>:<div className="global-tap-hint"><strong>Haz clic o toca en cualquier parte</strong><small>También puedes usar Espacio o Enter</small></div>}<p className="tap-count">{taps.length} pulsaciones registradas</p></main>;
}
