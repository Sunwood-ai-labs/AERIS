import test from 'node:test';
import assert from 'node:assert/strict';
import {percentage,usageLeaders,usageLevel} from '../ui/usage';
import type {ProcessRow} from '../ui/model';
const row=(pid:number,cpu:number,memory:number)=>({pid,cpu,memory}) as ProcessRow;
test('CPU and memory leaders are independent, deterministic and exclude unknown/idle values',()=>{
 const rows=[row(4,25,100),row(2,25,200),row(3,10,900),row(1,NaN,0)];
 const leaders=usageLeaders(rows);assert.equal(leaders.cpu?.pid,2);assert.equal(leaders.memory?.pid,3);
 assert.deepEqual(usageLeaders([row(1,0,0)]),{cpu:null,memory:null});assert.equal(rows[0].pid,4);
});
test('bar scale distinguishes process comparison from physical memory share and handles missing capacity',()=>{
 assert.equal(percentage(2,8),25);assert.equal(percentage(2,32),6.25);
 for(const [value,total] of [[1,0],[NaN,2],[-1,2],[1,Infinity]])assert.equal(percentage(value,total),0);
 assert.equal(percentage(120,100),100);
});
test('warnings use absolute load, so a small top process is not falsely alarming',()=>{
 assert.equal(usageLevel(5,'cpu','process'),'normal');assert.equal(usageLevel(25,'cpu','process'),'high');
 assert.equal(usageLevel(20,'memory','process'),'critical');assert.equal(usageLevel(70,'memory'),'high');assert.equal(usageLevel(90,'cpu'),'critical');
});
