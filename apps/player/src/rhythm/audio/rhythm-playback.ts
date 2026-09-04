import { metronome } from './metronome';
export async function playTimes(times:number[]){await metronome.resume();const ctx=metronome.audio,start=ctx.currentTime+.08;times.forEach(ms=>metronome.click(start+ms/1000,true));return Math.max(...times,0)+120}
