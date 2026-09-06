import {bytes,rate,escapeHtml as esc,type Snapshot} from './model';
import {aggregateApps,appKey,appColor,breakdown,memoryCapacity} from './breakdown';
import {usageColor} from './usage';

type Part={name:string;value:number;color:string;detail?:string};
const positive=(n:number)=>Number.isFinite(n)?Math.max(0,n):0;
type AppActivity=Part&{read:number;write:number;tcp:number;udp:number};
export function activityApps(s:Snapshot,kind:'io'|'network'):AppActivity[]{
 const groups=new Map<string,AppActivity>(),processes=new Map(s.processes.map(p=>[p.pid,p]));
 const add=(name:string,read:number,write:number,tcp:number,udp:number)=>{
  const key=appKey(name);let app=groups.get(key);
  if(!app){app={name,color:appColor(key),value:0,read:0,write:0,tcp:0,udp:0};groups.set(key,app);}
  app.read+=positive(read);app.write+=positive(write);app.tcp+=positive(tcp);app.udp+=positive(udp);
  app.value=kind==='io'?app.read+app.write:app.tcp+app.udp;
 };
 if(kind==='io')for(const p of s.processes)add(p.name,p.read??0,p.write??0,0,0);
 else for(const p of s.performance?.networkOwners?.owners??[])add(processes.get(p.pid)?.name??`PID ${p.pid}（名前取得不可）`,0,0,p.tcp,p.udp);
 return [...groups.values()].filter(p=>p.value>0).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).map(p=>({...p,detail:kind==='io'?`読 ${rate(p.read)} · 書 ${rate(p.write)}`:`TCP ${p.tcp} · UDP ${p.udp}`}));
}
function topParts(parts:Part[]):Part[]{
 const tail=parts.slice(3),value=tail.reduce((sum,p)=>sum+p.value,0);
 return [...parts.slice(0,3),...(tail.length?[{name:`その他 ${tail.length} アプリ`,value,color:'#71899e',detail:`${tail.length} アプリの合計`}]:[])];
}
function taskRows(parts:Part[],amount:(p:Part)=>string):string{
 const max=parts[0]?.value??0;
 return `<div class="g-task-list">${parts.slice(0,3).map(p=>`<div class="g-task-row" style="--app-color:${p.color}" title="${esc(p.name)} · ${esc(p.detail??amount(p))}"><i></i><span class="g-task-name">${esc(p.name)}</span><div class="g-task-amount"><strong>${esc(amount(p))}</strong><span class="g-task-meter" aria-hidden="true"><i style="width:${max?Math.min(100,p.value/max*100):0}%"></i></span></div></div>`).join('')||'<p class="g-summary-caption">計測できる使用量がありません</p>'}</div>`;
}
export function splitBar(parts:Part[],label:string):string{
 const total=parts.reduce((sum,p)=>sum+positive(p.value),0);
 return `<div class="g-summary-bar" role="group" aria-label="${esc(label)}">${total>0?parts.filter(p=>positive(p.value)>0).map(p=>{const share=positive(p.value)/total*100;const description=`${p.name} · ${p.detail??bytes(p.value)} · ${share.toFixed(1)}%`;return `<span class="g-summary-segment" tabindex="0" role="img" style="width:${share}%;--segment-color:${p.color}" title="${esc(description)}" aria-label="${esc(description)}">${share>=18?`<span>${esc(p.name.replace(/\.exe$/i,''))}</span>`:''}</span>`;}).join(''):''}</div>`;
}
export function renderGadgetSummary(s:Snapshot):string{
 const apps=aggregateApps(s.processes),cpu=breakdown(apps,'cpu',3),memory=breakdown(apps,'memory',3),mem=memoryCapacity(apps,s.usedMemory,s.totalMemory);
 const download=positive(s.sample.download),upload=positive(s.sample.upload);
 const cpuParts=cpu.segments.map(p=>({name:p.name,value:p.value,color:p.color,detail:`${p.value.toFixed(1)}% CPU · ${p.count}プロセス`}));
 const cpuBar=splitBar(cpuParts, 'CPUの計測プロセス合計の内訳');
 const network=activityApps(s,'network'),io=activityApps(s,'io'),owners=s.performance?.networkOwners;
 const netBar=splitBar(topParts(network),'アプリ別 TCP確立接続数とUDPソケット数の内訳。通信速度ではありません');
 const disks=s.performance?.disks;
 return `<section class="g-summary-card" aria-label="CPU"><div class="g-summary-heading"><h2>CPU <span>使用量の上位</span></h2><strong style="color:${usageColor(s.sample.cpu,'cpu')}">${s.sample.cpu.toFixed(0)}<small>%</small></strong></div>${cpuBar}${taskRows(cpuParts.filter((_,i)=>cpu.segments[i].key!==null),p=>p.value.toFixed(1)+'%')}<p class="g-summary-caption">同名アプリを合算 · 計測合計 ${cpu.total.toFixed(1)}%</p></section>
 <section class="g-summary-card" aria-label="メモリ"><div class="g-summary-heading"><h2>MEMORY <span>使用量の上位</span></h2><strong style="color:${usageColor(s.sample.memory,'memory')}">${s.sample.memory.toFixed(0)}<small>%</small></strong></div><div class="g-summary-bar" role="group" aria-label="物理メモリの使用中と空き。色はプロセスメモリの比率" title="使用中 ${bytes(s.usedMemory)} / 全体 ${bytes(s.totalMemory)} · 空き ${bytes(Math.max(0,s.totalMemory-s.usedMemory))}"><div id="g-memory-bar" style="width:${mem.usedPercent}%">${mem.html}</div></div>${taskRows(memory.segments.filter(p=>p.key!==null),p=>bytes(p.value))}<p class="g-summary-caption">${bytes(s.usedMemory)} / ${bytes(s.totalMemory)} · 色：プロセス比率 · 右側：空き</p></section>
 <section class="g-summary-card" aria-label="ネットワーク"><div class="g-summary-heading"><h2>NETWORK <span>接続元アプリ</span></h2><span class="g-net-total">↓ ${rate(download)}<br>↑ ${rate(upload)}</span></div>${netBar}${network.length?taskRows(network,p=>p.detail!):`<p class="g-summary-caption">${owners?.error?esc(owners.error):owners?'接続中のTCP・UDPソケットはありません':'接続元情報を取得できません'}</p>`}${network.length&&owners?.error?`<p class="g-summary-caption">一部取得不可：${esc(owners.error)}</p>`:''}<p class="g-summary-caption">TCP接続 / UDPソケット数 · 通信量・通信中の判定ではありません${network.length>3?` · 他${network.length-3}アプリ`:''}</p></section>
 <section class="g-summary-card" aria-label="ストレージとプロセスI/O"><div class="g-summary-heading"><h2>STORAGE / I/O</h2><span class="g-summary-caption">アプリ別 読み書き</span></div>${splitBar(topParts(io),'計測したプロセスI/Oの読み書き合計の内訳')}${taskRows(io,p=>p.detail!)}<p class="g-summary-caption">${s.os.toLowerCase().includes('windows')?'プロセスI/Oにはファイル・ネットワーク等を含みます':'計測できたプロセスの読み書き合計'}${io.length>3?` · 他${io.length-3}アプリ`:''}</p>${!disks?.length?'<p class="g-summary-caption">ストレージ情報を取得できません</p>':disks.map(d=>{const total=positive(d.total),free=Math.min(total,positive(d.available));return `<div class="g-summary-disk"><div class="g-disk-heading"><strong title="${esc(d.name)} · ${esc(d.filesystem)}">${esc(d.mount)} ディスクI/O</strong><span>読 ${rate(positive(d.read))} · 書 ${rate(positive(d.write))}</span></div><p class="g-summary-caption">${total?`${bytes(total-free)} / ${bytes(total)} 使用中`:'容量 取得不可'}</p></div>`;}).join('')}</section><p class="g-summary-help">同じアプリは同じ色 · バーにマウスを重ねると詳細を表示</p>`;
}
