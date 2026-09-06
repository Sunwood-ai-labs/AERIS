import {bytes,rate,escapeHtml as esc,type Snapshot} from './model';
import {aggregateApps,breakdown,memoryCapacity} from './breakdown';
import {usageColor} from './usage';

type Part={name:string;value:number;color:string;detail?:string};
const positive=(n:number)=>Number.isFinite(n)?Math.max(0,n):0;
export function splitBar(parts:Part[],label:string):string{
 const total=parts.reduce((sum,p)=>sum+positive(p.value),0);
 return `<div class="g-summary-bar" role="group" aria-label="${esc(label)}">${total>0?parts.filter(p=>positive(p.value)>0).map(p=>{const share=positive(p.value)/total*100;const description=`${p.name} · ${p.detail??bytes(p.value)} · ${share.toFixed(1)}%`;return `<span class="g-summary-segment" tabindex="0" role="img" style="width:${share}%;--segment-color:${p.color}" title="${esc(description)}" aria-label="${esc(description)}">${share>=18?`<span>${esc(p.name.replace(/\.exe$/i,''))}</span>`:''}</span>`;}).join(''):''}</div>`;
}
export function renderGadgetSummary(s:Snapshot):string{
 const apps=aggregateApps(s.processes),cpu=breakdown(apps,'cpu',3),mem=memoryCapacity(apps,s.usedMemory,s.totalMemory);
 const download=positive(s.sample.download),upload=positive(s.sample.upload);
 const cpuBar=splitBar(cpu.segments.map(p=>({name:p.name,value:p.value,color:p.color,detail:`${p.value.toFixed(1)}% CPU · ${p.count}プロセス`})), 'CPUの計測プロセス合計の内訳');
 const netBar=splitBar([{name:'受信',value:download,color:'#43d9f5',detail:rate(download)},{name:'送信',value:upload,color:'#bb9bff',detail:rate(upload)}],'ネットワーク受信と送信の速度比率');
 const disks=s.performance?.disks;
 return `<section class="g-summary-card" aria-label="CPU"><div class="g-summary-heading"><h2>CPU</h2><strong style="color:${usageColor(s.sample.cpu,'cpu')}">${s.sample.cpu.toFixed(0)}<small>%</small></strong></div>${cpuBar}<p class="g-summary-caption">アプリ別 · 計測合計 ${cpu.total.toFixed(1)}%${cpu.total?'':' · 使用量なし'}</p></section>
 <section class="g-summary-card" aria-label="メモリ"><div class="g-summary-heading"><h2>MEMORY</h2><strong style="color:${usageColor(s.sample.memory,'memory')}">${s.sample.memory.toFixed(0)}<small>%</small></strong></div><div class="g-summary-bar" role="group" aria-label="物理メモリの使用中と空き。色はプロセスメモリの比率" title="使用中 ${bytes(s.usedMemory)} / 全体 ${bytes(s.totalMemory)} · 空き ${bytes(Math.max(0,s.totalMemory-s.usedMemory))}"><div id="g-memory-bar" style="width:${mem.usedPercent}%">${mem.html}</div></div><p class="g-summary-caption">${bytes(s.usedMemory)} / ${bytes(s.totalMemory)} · 色：プロセス比率 · 右側：空き</p></section>
 <section class="g-summary-card" aria-label="ネットワーク"><div class="g-summary-heading"><h2>NETWORK</h2><strong>${rate(download+upload)}</strong></div>${netBar}<p class="g-summary-caption g-summary-pair"><span style="color:#43d9f5">↓ ${rate(download)}</span><span style="color:#bb9bff">↑ ${rate(upload)}</span><span>${download+upload?'送受信の比率':'通信なし'}</span></p></section>
 <section class="g-summary-card" aria-label="ストレージ"><div class="g-summary-heading"><h2>STORAGE</h2><span class="g-summary-caption">${disks?.length??0} ドライブ</span></div>${!disks?.length?'<p class="g-summary-caption">ストレージ情報を取得できません</p>':disks.map(d=>{const total=positive(d.total),free=Math.min(total,positive(d.available)),used=total-free;return `<div class="g-summary-disk"><div class="g-disk-heading"><strong title="${esc(d.name)} · ${esc(d.filesystem)}">${esc(d.mount)}</strong><span>${total?`${bytes(used)} / ${bytes(total)}`:'容量 取得不可'}</span></div>${splitBar([{name:'使用中',value:used,color:'#79aff5'},{name:'空き',value:free,color:'#31465b'}],`${d.mount} 使用中と空き容量`)}<p class="g-summary-caption">読込 ${rate(positive(d.read))} · 書込 ${rate(positive(d.write))}</p></div>`;}).join('')}</section><p class="g-summary-help">バーにマウスを重ねると内訳を表示</p>`;
}
