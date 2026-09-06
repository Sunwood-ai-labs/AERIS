import { bytes,rate,escapeHtml as esc,type Snapshot } from './model';

const meter=(value:number)=>`<div class="resource-meter"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div>`;
export function renderPerformance(s:Snapshot,gpuMarkup=''):string {
 const p=s.performance;
 if(!p)return '<p class="muted">パフォーマンス情報を取得しています…</p>';
 return `<div class="resource-heading"><div><div class="eyebrow">HARDWARE / LIVE</div><h2>${esc(s.cpuName)}</h2></div><span class="resource-total">${s.sample.cpu.toFixed(0)}<small>% CPU</small></span></div>
 <section class="panel resource-section"><div class="section-title">論理プロセッサ <span class="count">${p.cpus.length}</span></div><div class="core-grid">${p.cpus.map((c,k)=>`<div class="core-tile"><span>CPU ${k}</span><strong>${c.usage.toFixed(0)}<small>%</small></strong>${meter(c.usage)}<span>${c.frequency?(c.frequency/1000).toFixed(2)+' GHz':'周波数 取得不可'}</span></div>`).join('')}</div></section>
 <div class="resource-columns"><section class="panel resource-section"><div class="section-title">物理メモリ</div><div class="resource-total">${bytes(s.usedMemory)}<small> / ${bytes(s.totalMemory)}</small></div>${meter(s.sample.memory)}<p class="muted">利用可能 ${bytes(s.totalMemory-s.usedMemory)}</p></section><section class="panel resource-section"><div class="section-title">スワップ / ページファイル</div><div class="resource-total">${bytes(p.usedSwap)}<small> / ${bytes(p.totalSwap)}</small></div>${meter(p.totalSwap?p.usedSwap/p.totalSwap*100:0)}<p class="muted">OSが報告するスワップ使用量</p></section></div>
 <div class="resource-columns">${p.disks.map(d=>`<section class="panel resource-section"><div class="section-title">${esc(d.mount)} <span class="count">${esc(d.kind)}</span></div><p class="muted">${esc(d.name)} · ${esc(d.filesystem)}</p><div class="resource-total">${bytes(d.total-d.available)}<small> / ${bytes(d.total)}</small></div>${meter(d.total?(d.total-d.available)/d.total*100:0)}<div class="resource-rates"><span>読み取り <strong>${rate(d.read)}</strong></span><span>書き込み <strong>${rate(d.write)}</strong></span></div><p class="muted">空き容量 ${bytes(d.available)}</p></section>`).join('')}</div>
 <section class="panel resource-section"><div class="resource-heading"><div class="section-title">GPU · Windows</div><button class="quiet-button" data-action="gpu">GPU情報を更新</button></div>${gpuMarkup||'<p class="muted">ボタンを押すと使用率・GPUメモリを取得します。</p>'}</section><section class="panel resource-section"><div class="section-title">ネットワークアダプター</div><div class="resource-networks">${p.interfaces.map(n=>`<div class="interface-row"><div><strong>${esc(n.name)}</strong><span class="muted">${esc(n.mac)}</span></div><div>↓ ${rate(n.download)}<span class="muted">累計 ${bytes(n.totalReceived)}</span></div><div>↑ ${rate(n.upload)}<span class="muted">累計 ${bytes(n.totalTransmitted)}</span></div></div>`).join('')||'<p class="muted">アダプターが見つかりません</p>'}</div></section>`;
}

export function previewPerformance():NonNullable<Snapshot['performance']> {
 return {cpus:Array.from({length:20},(_,k)=>({name:`CPU ${k}`,usage:12+(k*17)%55,frequency:2600})),totalSwap:8*1073741824,usedSwap:1.2*1073741824,
 disks:[{name:'NVMe SSD',mount:'C:\\',kind:'SSD',filesystem:'NTFS',total:1024*1073741824,available:620*1073741824,read:4.2*1048576,write:1.3*1048576}],
 interfaces:[{name:'Wi-Fi',mac:'00:00:00:00:00:00',download:84*1024,upload:44*1024,totalReceived:23*1048576,totalTransmitted:8*1048576}]};
}
