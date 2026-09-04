export type RhythmDuration = 'whole' | 'half' | 'quarter' | 'eighth';
export interface RhythmEvent { id:string; kind:'note'|'rest'; startBeat:number; durationBeats:number; dotted?:boolean; tieToNext?:boolean; midiNote?:number }
