/** Bounded, fair scheduler for outbound/network jobs.
 * This is a reliability and policy limiter, not an anti-detection mechanism.
 * Jobs are intentionally in-memory: closures cannot be safely restored after restart.
 */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
export class WorkloadScheduler {
  constructor({concurrency=3, perLaneConcurrency=1, minIntervalMs=1200, maxQueue=500, now=()=>Date.now(), sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
    this.concurrency=clamp(concurrency,1,16); this.perLaneConcurrency=clamp(perLaneConcurrency,1,4);
    this.minIntervalMs=clamp(minIntervalMs,0,60000); this.maxQueue=clamp(maxQueue,1,10000);
    this.now=now; this.sleep=sleep; this.lanes=new Map(); this.active=0; this.lastStartedAt=0;
    this.paused=false; this.closed=false; this.sequence=0; this.pumping=false;
    this.statsData={accepted:0,completed:0,failed:0,rejected:0,cancelled:0};
  }
  enqueue({lane='default',kind='network',run,signal,metadata=null}={}) {
    if(typeof run!=='function') return Promise.reject(new TypeError('Job run must be a function'));
    if(this.closed) return Promise.reject(new Error('Scheduler closed'));
    const depth=this.queueDepth;
    if(depth>=this.maxQueue){this.statsData.rejected++;return Promise.reject(new Error('Workload queue is full'));}
    if(signal?.aborted){this.statsData.cancelled++;return Promise.reject(signal.reason||new Error('Job aborted'));}
    const key=String(lane||'default'); let q=this.lanes.get(key); if(!q){q={items:[],active:0};this.lanes.set(key,q);}
    const id=++this.sequence;
    const promise=new Promise((resolve,reject)=>q.items.push({id,run,resolve,reject,kind,signal,metadata,queuedAt:this.now()}));
    this.statsData.accepted++; this.#pump(); return promise;
  }
  get queueDepth(){let n=0;for(const q of this.lanes.values())n+=q.items.length;return n;}
  pause(){this.paused=true;return this.stats();}
  resume(){if(!this.closed){this.paused=false;this.#pump();}return this.stats();}
  async close({cancelPending=true}={}){this.closed=true;if(cancelPending){for(const q of this.lanes.values()){for(const j of q.items.splice(0)){this.statsData.cancelled++;j.reject(new Error('Scheduler closed'));}}}return this.stats();}
  stats(){return {paused:this.paused,closed:this.closed,concurrency:this.concurrency,active:this.active,queueDepth:this.queueDepth,lanes:[...this.lanes].map(([name,q])=>({name,active:q.active,queued:q.items.length})),...this.statsData};}
  async #pump(){if(this.pumping||this.paused||this.closed)return;this.pumping=true;try{
    while(!this.paused&&!this.closed&&this.active<this.concurrency){
      const entries=[...this.lanes.entries()];let chosen=null;
      for(const [name,q] of entries){if(q.items.length&&q.active<this.perLaneConcurrency){chosen={name,q};break;}}
      if(!chosen)break;
      const job=chosen.q.items.shift(); if(job.signal?.aborted){this.statsData.cancelled++;job.reject(job.signal.reason||new Error('Job aborted'));continue;}
      const wait=Math.max(0,this.minIntervalMs-(this.now()-this.lastStartedAt));
      if(wait) await this.sleep(wait);
      if(this.paused||this.closed){chosen.q.items.unshift(job);break;}
      this.lastStartedAt=this.now();this.active++;chosen.q.active++;
      this.#execute(chosen.name,chosen.q,job);
    }
  } finally {this.pumping=false;}
  }
  async #execute(lane,q,job){try{if(job.signal?.aborted)throw job.signal.reason||new Error('Job aborted');const result=await job.run({id:job.id,lane,kind:job.kind,metadata:job.metadata,queuedMs:Math.max(0,this.now()-job.queuedAt)});this.statsData.completed++;job.resolve(result);}catch(error){this.statsData.failed++;job.reject(error);}finally{this.active--;q.active--;if(!q.items.length&&!q.active)this.lanes.delete(lane);this.#pump();}}
}
export const workloadScheduler=new WorkloadScheduler({
 concurrency:process.env.WHISKAY_WORKER_CONCURRENCY||3,
 perLaneConcurrency:process.env.WHISKAY_WORKER_LANE_CONCURRENCY||1,
 minIntervalMs:process.env.WHISKAY_WORKER_MIN_INTERVAL_MS||1200,
 maxQueue:process.env.WHISKAY_WORKER_MAX_QUEUE||500
});
