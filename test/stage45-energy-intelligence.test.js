import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateWorkload,applyEnergySaver,getWorkloadShard} from '../src/core/WorkloadCortex.js';

test('free commands stay zero energy but receive saver cooldown multiplier below threshold',()=>{
 const free=estimateWorkload({command:'menu',plugin:{energyMode:'free',energyCost:0,cooldown:1000}});
 assert.equal(free.cost,0);
 const saver=applyEnergySaver(free.cost,{enabled:true,energy:12,workload:free});
 assert.equal(saver.cost,0);
 assert.equal(saver.saverCooldownApplied,true);
 assert.equal(saver.cooldownMultiplier,1.5);
});

test('dynamic workload differentiates network, AI and heavy workloads',()=>{
 const plain=estimateWorkload({command:'profile',plugin:{cooldown:1000}});
 const net=estimateWorkload({command:'weather',plugin:{cooldown:1000}});
 const ai=estimateWorkload({command:'ask',args:['explain','this'],plugin:{cooldown:1000}});
 const heavy=estimateWorkload({command:'render',plugin:{cooldown:1000}});
 assert.ok(net.cost>plain.cost);assert.ok(ai.cost>plain.cost);assert.ok(heavy.cost>plain.cost);
});

test('saver reduces energy cost and increases cooldown by workload class',()=>{
 const w=estimateWorkload({command:'youtube',plugin:{cooldown:1000}});
 const normal=applyEnergySaver(w.cost,{enabled:false,energy:10,workload:w});
 const saver=applyEnergySaver(w.cost,{enabled:true,energy:10,workload:w});
 assert.ok(saver.cost<normal.cost);assert.ok(saver.savingPercent>0);assert.ok(saver.cooldownMultiplier>1);
});

test('saver locks at or above 20 percent',()=>{
 const w=estimateWorkload({command:'ask',plugin:{cooldown:1000}});
 const result=applyEnergySaver(w.cost,{enabled:true,energy:20,workload:w});
 assert.equal(result.saverApplied,false);assert.equal(result.unlocked,false);assert.equal(result.cooldownMultiplier,1);
});

test('workload shard reacts to event loop delay and queue pressure',()=>{
 const state=getWorkloadShard({cpuPercent:2,heapUsedMB:10,heapTotalMB:100,queueDepth:20,eventLoopDelayMs:70});
 assert.ok(state.score>=80);assert.ok(['HIGH','CRITICAL'].includes(state.state));
});
