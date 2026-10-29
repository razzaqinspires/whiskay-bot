/** Explicit module-scoped telemetry bridge; no globalThis mutation. */
let chronosSnapshot=null;
export function publishChronosSnapshot(snapshot){chronosSnapshot=snapshot&&typeof snapshot==='object'?JSON.parse(JSON.stringify(snapshot)):null;}
export function getChronosSnapshot(){return chronosSnapshot?JSON.parse(JSON.stringify(chronosSnapshot)):{registered:0,running:0,concurrency:0,success:0,failed:0,skipped:0,jobs:[]};}
