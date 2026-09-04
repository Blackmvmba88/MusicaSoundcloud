export type EvaluationStatus='perfect'|'correct'|'early'|'late'|'missed';
export interface UserTap { timestampMs:number; relativeTimeMs:number }
export interface TapEvaluation { expectedEventId:string; expectedTimeMs:number; actualTimeMs?:number; errorMs?:number; status:EvaluationStatus }
export interface ExerciseResult { score:number; accuracy:number; averageErrorMs:number; extraTaps:number; evaluations:TapEvaluation[] }
export interface PerformanceAnalysis { pulse:number; rhythm:number; continuity:number; anticipation:number; reactionTimeMs:number; offbeatErrors:number; confidence:number; evidence:string[]; warnings:string[]; fallbackReason?:string }
export interface StoredResult extends ExerciseResult { exerciseId:string; levelId:string; completedAt:string }
