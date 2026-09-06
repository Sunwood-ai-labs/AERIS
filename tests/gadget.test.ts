import test from 'node:test';import assert from 'node:assert/strict';
import {activityApps,renderGadgetSummary,splitBar} from '../ui/gadget';import type {Snapshot,ProcessRow} from '../ui/model';
const snapshot=():Snapshot=>({sample:{time:0,cpu:20,memory:40,download:300,upload:100},processes:[],usedMemory:400,totalMemory:1000,history:[],cpuName:'Test CPU',cores:4,uptime:0,host:'Test',os:'Test',paused:false,ready:true,error:null,settings:{interval:2,pinned:true,mini:false,wallpaper:'none',wallpaperInterval:30,glassOpacity:70,imageOpacity:24}});
test('stacked proportions handle invalid counters and unavailable data is not called idle',()=>{
 const bar=splitBar([{name:'RX',value:300,color:'#fff'},{name:'TX',value:100,color:'#aaa'}],'traffic');
 assert.ok(bar.includes('width:75%'));assert.ok(bar.includes('width:25%'));
 assert.ok(!splitBar([{name:'idle',value:0,color:'#fff'},{name:'bad',value:NaN,color:'#aaa'}],'idle').includes('g-summary-segment'));
 const s=snapshot();s.sample.download=s.sample.upload=0;const html=renderGadgetSummary(s);
 assert.ok(html.includes('接続元情報を取得できません'));assert.ok(html.includes('ストレージ情報を取得できません'));
});
test('disk I/O stays separate from process I/O and mount names cannot inject markup',()=>{
 const s=snapshot();s.performance={cpus:[],totalSwap:0,usedSwap:0,interfaces:[],disks:[
 {name:'SSD',mount:'<C>',kind:'SSD',filesystem:'NTFS',total:1000,available:250,read:0,write:0},
 {name:'USB',mount:'D:',kind:'SSD',filesystem:'NTFS',total:100,available:100,read:0,write:0}]};
 const html=renderGadgetSummary(s);assert.ok(html.includes('&lt;C&gt;'));assert.ok(!html.includes('<C>'));
 assert.ok(html.includes('ディスクI/O'));assert.ok(html.includes('プロセスI/O'));
 assert.equal((html.match(/class="g-summary-disk"/g)||[]).length,2);
});
const process=(pid:number,name:string,extra:Partial<ProcessRow>={}):ProcessRow=>({pid,name,cpu:1,memory:1024,startTime:0,path:null,protected:false,...extra});
test('visible app rows group memory and I/O, and network ownership never invents a byte rate',()=>{
 const s=snapshot();s.os='Windows 11';s.processes=[process(1,'Browser.exe',{memory:2048,read:1024,write:2048}),process(2,'browser.EXE',{memory:4096,read:2048,write:NaN}),process(3,'<unsafe>',{read:-1})];
 s.performance={cpus:[],totalSwap:0,usedSwap:0,disks:[],interfaces:[],networkOwners:{owners:[{pid:1,tcp:2,udp:1},{pid:2,tcp:1,udp:3},{pid:999,tcp:1,udp:0}],error:null}};
 const io=activityApps(s,'io');assert.equal(io.length,1);assert.equal(io[0].read,3072);assert.equal(io[0].write,2048);
 const net=activityApps(s,'network');assert.equal(net[0].tcp,3);assert.equal(net[0].udp,4);assert.equal(net[0].value,7);assert.match(net[1].name,/PID 999/);
 assert.equal(net[0].color,io[0].color);assert.ok(!net[0].detail?.includes('/s'));
 const html=renderGadgetSummary(s);assert.ok(html.includes('Browser.exe</span>'));assert.ok(html.includes('6 KB</strong>'));
 assert.ok(html.includes('TCP 3 · UDP 4'));assert.ok(html.includes('通信量・通信中の判定ではありません'));assert.ok(html.includes('ファイル・ネットワーク等'));
 assert.ok(!html.includes('<unsafe>'));assert.ok(html.includes('&lt;unsafe&gt;'));
});
test('empty and partial endpoint samples distinguish no endpoints from collection failures',()=>{
 const s=snapshot();s.performance={cpus:[],totalSwap:0,usedSwap:0,disks:[],interfaces:[],networkOwners:{owners:[],error:null}};
 assert.ok(renderGadgetSummary(s).includes('接続中のTCP・UDPソケットはありません'));
 s.performance.networkOwners={owners:[{pid:99,tcp:1,udp:0}],error:'test <failure>'};
 const html=renderGadgetSummary(s);assert.ok(html.includes('一部取得不可：test &lt;failure&gt;'));assert.ok(html.includes('PID 99'));
});
