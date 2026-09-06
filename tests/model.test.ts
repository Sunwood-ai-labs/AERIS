import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSort,escapeHtml,chartPoints,uptime,bytes,type ProcessRow} from '../ui/model';
const rows:ProcessRow[]=[{pid:3,name:'Chrome.exe',cpu:12,memory:1048576,startTime:1,path:null,protected:false},{pid:20,name:'Code.exe',cpu:2,memory:5242880,startTime:1,path:null,protected:false}];
test('filters names without case sensitivity and exact PID fragments',()=>{assert.equal(filterSort(rows,'CHROME','cpu',true)[0].pid,3);assert.equal(filterSort(rows,'20','cpu',true)[0].name,'Code.exe');assert.equal(filterSort(rows,'absent','cpu',true).length,0);});
test('sorts numerically instead of formatted strings without changing source order',()=>{assert.equal(filterSort(rows,'','memory',true)[0].pid,20);assert.equal(filterSort(rows,'','cpu',true)[0].pid,3);assert.equal(filterSort(rows,'','cpu',false)[0].pid,20);assert.equal(rows[0].pid,3);});
test('process names and paths cannot introduce markup',()=>assert.equal(escapeHtml('<img src=x onerror="bad()">'),'&lt;img src=x onerror=&quot;bad()&quot;&gt;'));
test('charts use elapsed timestamps for intervals and clamp samples',()=>{assert.equal(chartPoints([{time:0,cpu:150,memory:0,download:0,upload:0},{time:30000,cpu:-1,memory:0,download:0,upload:0},{time:60000,cpu:50,memory:0,download:0,upload:0}],'cpu',800,200,100,60000),'0.0,0.0 400.0,200.0 800.0,100.0');});
test('formats uptime and memory consistently',()=>{assert.equal(uptime(90061),'1日 01:01:01');assert.equal(bytes(1073741824),'1.0 GB');});
