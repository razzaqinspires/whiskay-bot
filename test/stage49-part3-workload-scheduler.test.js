import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkloadScheduler} from '../src/core/WorkloadScheduler.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('scheduler enforces global and per-lane concurrency',async()=>{
 const s=new WorkloadScheduler({concurrency:2,perLaneConcurrency:1,minIntervalMs:0});let active=0,max=0,laneActive=0,laneMax=0;
 const jobs=Array.from({length:5},(_,i)=>s.enqueue({lane:i<3?'group-a':'group-b',run:async()=>{active++;max=Math.max(max,active);if(i<3){laneActive++;laneMax=Math.max(laneMax,laneActive);}await tick();if(i<3)laneActive--;active--;return i;}}));
 assert.deepEqual(await Promise.all(jobs),[0,1,2,3,4]);assert.ok(max<=2);assert.equal(laneMax,1);assert.equal(s.stats().completed,5);
});
test('queue is bounded and rejects overflow',async()=>{const s=new WorkloadScheduler({concurrency:1,minIntervalMs:0,maxQueue:1});let release;const hold=s.enqueue({run:()=>new Promise(r=>release=r)});await tick();const queued=s.enqueue({run:async()=>2});await assert.rejects(s.enqueue({run:async()=>3}),/queue is full/);release(1);assert.equal(await hold,1);assert.equal(await queued,2);});
test('pause holds pending work and resume drains it',async()=>{const s=new WorkloadScheduler({concurrency:1,minIntervalMs:0});s.pause();let ran=false;const p=s.enqueue({run:async()=>{ran=true;return true;}});await tick();assert.equal(ran,false);s.resume();assert.equal(await p,true);});
test('close rejects pending work',async()=>{const s=new WorkloadScheduler({concurrency:1,minIntervalMs:0});s.pause();const p=s.enqueue({run:async()=>1});await s.close();await assert.rejects(p,/closed/i);});
