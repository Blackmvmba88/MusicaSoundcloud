import {describe,expect,it} from 'vitest';
import {analyzePerformance} from '../rhythm/engine/performance-analysis';

const events=[{id:'a',kind:'note' as const,startBeat:.5,durationBeats:.5},{id:'b',kind:'note' as const,startBeat:1,durationBeats:1}];

describe('performance analysis',()=>{
  it('reports explainable offbeat and anticipation evidence',()=>{const analysis=analyzePerformance(events,[{expectedEventId:'a',expectedTimeMs:375,actualTimeMs:295,errorMs:-80,status:'early'},{expectedEventId:'b',expectedTimeMs:750,actualTimeMs:750,errorMs:0,status:'perfect'}],0);expect(analysis.offbeatErrors).toBe(1);expect(analysis.anticipation).toBeLessThan(100);expect(analysis.confidence).toBe(1);expect(analysis.evidence).toHaveLength(3)});
  it('returns a fallback reason without matching attacks',()=>{const analysis=analyzePerformance(events,[{expectedEventId:'a',expectedTimeMs:375,status:'missed'}],0);expect(analysis.confidence).toBe(0);expect(analysis.fallbackReason).toBeTruthy()});
});
