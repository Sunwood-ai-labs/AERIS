import test from 'node:test';import assert from 'node:assert/strict';
import {renderGadgetSummary,splitBar} from '../ui/gadget';import type {Snapshot} from '../ui/model';
const snapshot=():Snapshot=>({sample:{time:0,cpu:20,memory:40,download:300,upload:100},processes:[],usedMemory:400,totalMemory:1000,history:[],cpuName:'Test CPU',cores:4,uptime:0,host:'Test',os:'Test',paused:false,ready:true,error:null,settings:{interval:2,pinned:true,mini:false,wallpaper:'none',wallpaperInterval:30,glassOpacity:70,imageOpacity:24}});
test('network directions normalize independently from capacity and idle counters stay empty',()=>{
 const bar=splitBar([{name:'RX',value:300,color:'#fff'},{name:'TX',value:100,color:'#aaa'}],'traffic');
 assert.ok(bar.includes('width:75%'));assert.ok(bar.includes('width:25%'));
 assert.ok(!splitBar([{name:'idle',value:0,color:'#fff'},{name:'bad',value:NaN,color:'#aaa'}],'idle').includes('g-summary-segment'));
 const s=snapshot();s.sample.download=s.sample.upload=0;const html=renderGadgetSummary(s);
 assert.ok(html.includes('通信なし'));assert.ok(html.includes('ストレージ情報を取得できません'));
});
test('each storage volume keeps its own capacity scale and mount names cannot inject markup',()=>{
 const s=snapshot();s.performance={cpus:[],totalSwap:0,usedSwap:0,interfaces:[],disks:[
 {name:'SSD',mount:'<C>',kind:'SSD',filesystem:'NTFS',total:1000,available:250,read:0,write:0},
 {name:'USB',mount:'D:',kind:'SSD',filesystem:'NTFS',total:100,available:100,read:0,write:0}]};
 const html=renderGadgetSummary(s);assert.ok(html.includes('&lt;C&gt;'));assert.ok(!html.includes('<C>'));
 assert.ok(html.includes('width:75%'));assert.ok(html.includes('width:25%'));assert.ok(html.includes('width:100%'));
 assert.equal((html.match(/class="g-summary-disk"/g)||[]).length,2);
});
