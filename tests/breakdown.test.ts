import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateApps,breakdown,appColor,renderBreakdown,memoryCapacity} from '../ui/breakdown';import type{ProcessRow}from '../ui/model';
const row=(name:string,cpu:number,memory:number)=>({name,cpu,memory}) as ProcessRow;
test('capacity bar preserves physical used/free even when shared process memory exceeds capacity',()=>{
 const apps=aggregateApps([row('a',1,800),row('b',1,1200)]);
 const bar=memoryCapacity(apps,400,1000);
 assert.equal(bar.usedPercent,40);
 assert.ok(bar.html.includes('width:60%'));assert.ok(bar.html.includes('width:40%'));
 assert.ok(bar.html.includes('物理RAM占有量ではありません'));
 assert.equal(memoryCapacity(apps,400,0).usedPercent,0);
 assert.equal(memoryCapacity(apps,1200,1000).usedPercent,100);
 assert.ok(memoryCapacity([],400,1000).html.includes('内訳を取得できません'));
});
test('same executable groups case-insensitively and keeps its color across resources and ordering',()=>{
 const rows=[row('Chrome.exe',5,200),row('chrome.exe',3,300),row('Code.exe',9,100)];const apps=aggregateApps(rows);const chrome=apps.find(a=>a.key==='chrome.exe')!;
 assert.equal(chrome.cpu,8);assert.equal(chrome.memory,500);assert.equal(chrome.count,2);assert.equal(chrome.color,appColor('chrome.exe'));
 assert.equal(aggregateApps([...rows].reverse()).find(a=>a.key===chrome.key)?.color,chrome.color);
 assert.equal(breakdown(apps,'cpu').segments[1].color,breakdown(apps,'memory').segments[0].color);
});
test('stacked segments including Other conserve the observed total without treating resident sums as physical memory',()=>{
 const apps=aggregateApps([row('a',8,800),row('b',4,400),row('c',2,200),row('d',1,100)]);
 const result=breakdown(apps,'memory',2);assert.equal(result.total,1500);assert.equal(result.segments.length,3);
 assert.equal(result.segments.at(-1)?.value,300);assert.equal(result.segments.at(-1)?.key,null);
 assert.ok(Math.abs(result.segments.reduce((s,x)=>s+x.share,0)-100)<1e-9);
 assert.equal(result.segments.reduce((s,x)=>s+x.value,0),result.total);
});
test('missing, idle and invalid counters never create invented usage or executable markup',()=>{
 assert.deepEqual(breakdown(aggregateApps([row('idle',0,0),row('bad',NaN,-1)]),'cpu'),{total:0,segments:[]});
 const html=renderBreakdown(aggregateApps([row('<script>',1,1)]),'cpu');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
