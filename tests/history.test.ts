import test from 'node:test';
import assert from 'node:assert/strict';
import {AppHistory,users} from '../ui/history';
import type {Snapshot,ProcessRow} from '../ui/model';
const process=(startTime=1,cpuTime=100):ProcessRow=>({pid:50,name:'app',cpu:3,memory:1024,startTime,path:null,protected:false,user:'person',cpuTime});
const snap=(processes:ProcessRow[],time=1000)=>({sample:{time},processes}) as Snapshot;
test('history excludes CPU used before observation and survives process exit',()=>{const h=new AppHistory();h.update(snap([process()]));h.update(snap([process(1,350)],2000));h.update(snap([],3000));assert.equal(h.list()[0].cpuMs,250);assert.equal(h.list()[0].active,false);h.reset(snap([process(1,500)]));assert.equal(h.list()[0].cpuMs,0);});
test('PID reuse creates separate history and never subtracts unrelated CPU counters',()=>{const h=new AppHistory();h.update(snap([process()]));h.update(snap([process(2,5)]));assert.equal(h.rows.size,2);assert.equal(h.list().reduce((s,r)=>s+r.cpuMs,0),0);});
test('owner groups account for unknown owners without merging into a real user',()=>{const a=process();const groups=users([a,{...a,pid:51},{...a,pid:52,user:null}]);assert.equal(groups[0].name,'person');assert.equal(groups[0].count,2);assert.equal(groups[0].memory,2048);assert.equal(groups[1].name,'取得不可');});
