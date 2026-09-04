import type { RhythmEvent } from './rhythm-event';
export interface RhythmExercise { id:string; title:string; meterNumerator:number; meterDenominator:number; bpm:number; events:RhythmEvent[]; totalBeats?:number }
export interface Level { id:string; title:string; description:string; durations:string[]; enabled:boolean; patterns:PatternEvent[][]; patternTitles?:string[]; beatsPerExercise?:number; tempoRange?:{min:number;max:number;step:number;default:number} }
export type PatternEvent = Omit<RhythmEvent,'id'|'startBeat'>;
