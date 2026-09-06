import './style.css';
import './glass.css';
import { createBackground, appearanceSettings } from './background';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createIcons, Activity, LayoutGrid, Settings as SettingsIcon, Search, Minus, Square, X, ArrowUpRight, ArrowDown, ArrowUp, Pin, PinOff, Grip, Maximize2, Cpu, MemoryStick, Wifi, Clock, Pause, Play, RefreshCw, PanelTop, ChevronDown, Power, Shield, Check, SlidersHorizontal } from 'lucide';
import { filterSort, escapeHtml as esc, bytes, rate, uptime, chartPoints, type Snapshot, type ProcessRow, type SortKey, type Settings } from './model';

const native = isTauri();
const gadget = new URLSearchParams(location.search).get('view') === 'gadget';
const icons={Activity,LayoutGrid,Settings:SettingsIcon,Search,Minus,Square,X,ArrowUpRight,ArrowDown,ArrowUp,Pin,PinOff,Grip,Maximize2,Cpu,MemoryStick,Wifi,Clock,Pause,Play,RefreshCw,PanelTop,ChevronDown,Power,Shield,Check,SlidersHorizontal};
const $ = <T extends HTMLElement=HTMLElement>(selector:string) => document.querySelector<T>(selector)!;
const i=(name:string)=>`<i data-lucide="${name}"></i>`;
const ib=(action:string,name:string,label:string,extra='')=>`<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${i(name)}</button>`;
const logo=`<span class="logomark">${i('activity')}</span><span class="wordmark">AERIS</span>`;
let snapshot:Snapshot|null=null;
let selected:ProcessRow|null=null;
let query=''; let sortKey:SortKey='cpu'; let descending=true;
let page='overview'; let filtered:ProcessRow[]=[]; let pendingEnd:ProcessRow|null=null; let busy=false;
let toastTimer:ReturnType<typeof setTimeout>;
let settings:Settings={interval:2,pinned:true,mini:false,wallpaper:'random',wallpaperInterval:30,glassOpacity:70,imageOpacity:24};
const chart=(id:string,large=false)=>`<div class="chart ${large?'chart-large':''}" id="${id}">${large?'<div class="axis-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>':''}<svg viewBox="0 0 800 200" preserveAspectRatio="none" role="img" aria-label="直近60秒の使用率グラフ"><defs><linearGradient id="fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--accent)" stop-opacity=".15"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${[0,50,100,150,199].map(y=>`<line x1="0" x2="800" y1="${y}" y2="${y}" class="gridline"/>`).join('')}<polygon class="area" fill="url(#fill-${id})"/><polyline class="trace"/><polyline class="trace upload-trace"/></svg>${large?'<div class="axis-x"><span>60秒前</span><span>45秒前</span><span>30秒前</span><span>15秒前</span><span>現在</span></div>':''}</div>`;
function draw(id:string,key:'cpu'|'memory'|'download',max=100,upload=false) {
 const el=document.getElementById(id); if(!el||!snapshot)return;
 const p=chartPoints(snapshot.history,key,800,200,max,snapshot.sample.time);
 el.querySelector('.trace')?.setAttribute('points',p);
 const first=p.split(' ')[0]?.split(',')[0]||'0';
 el.querySelector('.area')?.setAttribute('points',p?`${first},200 ${p} 800,200`:'');
 if(upload) el.querySelector('.upload-trace')?.setAttribute('points',chartPoints(snapshot.history,'upload',800,200,max,snapshot.sample.time));
}
const processPanel=`<section class="process-panel panel"><div class="process-heading"><div class="section-title">プロセス <span id="process-count" class="count">—</span></div><label class="search-box">${i('search')}<input id="search" placeholder="名前 / PID を検索" aria-label="プロセスを検索" autocomplete="off" spellcheck="false"><kbd>Ctrl F</kbd>${ib('clear-search','x','検索をクリア')}</label></div><div class="table-scroll" id="table-scroll"><table aria-label="実行中のプロセス"><colgroup><col class="name-col"><col style="width:13%"><col style="width:15%"><col style="width:19%"><col style="width:15%"></colgroup><thead><tr>${[['name','名前'],['pid','PID'],['cpu','CPU %'],['memory','メモリ']].map(([k,label])=>`<th scope="col" aria-sort="${k==='cpu'?'descending':'none'}"><button data-sort="${k}">${label}<span class="sort-mark">${k==='cpu'?'↓':''}</span></button></th>`).join('')}<th scope="col">状態</th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty">システムに接続しています…</div></div><div class="process-bottom"><span id="selection-label">選択すると詳細を表示します</span><div class="actions"><button id="detail-button" class="quiet-button" data-action="details" disabled>詳細</button><button id="end-button" class="outline-button" data-action="end" disabled>タスクを終了</button></div></div></section>`;
const settingsPanel=`<section id="settings-page" class="panel settings-page" hidden><div class="eyebrow">MAKE IT YOURS</div><h1>静かに、自分のペースで。</h1><p class="muted">表示と更新を、いつもの使い方に合わせて。</p><div class="setting-row"><div><h3>更新間隔</h3><p>長めの間隔で、計測の負荷を抑えられます。</p></div><div class="segmented">${[1,2,5].map(n=>`<button data-interval="${n}">${n} 秒</button>`).join('')}</div></div><div class="setting-row"><div><h3>ガジェットを最前面に固定</h3><p>ほかのアプリを操作していても表示します。</p></div><button class="switch" role="switch" aria-label="ガジェットを最前面に固定" id="pin-toggle" data-action="pin" aria-checked="true"></button></div><div class="setting-row"><div><h3>常駐ガジェット</h3><p>小さなウィンドウで、システムの動きを確認。</p></div><button class="primary-button" data-action="gadget">${i('panel-top')}ガジェットを開く</button></div><div class="setting-note">${i('activity')}<div><strong>見えないときは、ひと休み。</strong><p>すべての画面が非表示・最小化中は計測を停止します。<br>閉じるボタンではトレイに常駐し、トレイから再表示できます。</p></div></div><div class="shortcuts"><span><kbd>Ctrl F</kbd> 検索</span><span><kbd>F5</kbd> 今すぐ更新</span><span><kbd>Esc</kbd> 閉じる / クリア</span></div><div class="settings-foot"><span>AERIS 1.0 · Tauri + Rust<br>CPU：全論理プロセッサに対する使用時間の割合<br>メモリ：各プロセスのワーキングセット<br>ネットワーク：ループバックを除くインターフェイスの合計</span><button class="quiet-button" data-action="quit">${i('power')}AERISを終了</button></div></section>`;
function mainShell(){return `<div class="app-shell"><header class="titlebar" data-tauri-drag-region><span data-tauri-drag-region>AERIS <span class="title-separator">/</span> SYSTEM MONITOR</span><div class="window-controls">${ib('minimize','minus','最小化')}${ib('maximize','square','最大化 / 元に戻す')}${ib('close','x','トレイに格納')}</div></header><aside class="sidebar"><a class="brand" href="#overview" aria-label="AERIS 概要">${logo}</a><div class="sidebar-label">WORKSPACE</div><nav><button data-page="overview" class="nav-button active">${i('layout-grid')}<span>概要</span></button><button data-page="processes" class="nav-button">${i('activity')}<span>プロセス</span></button><button data-page="settings" class="nav-button">${i('settings')}<span>設定</span></button></nav><div class="sidebar-bottom"><button class="gadget-launch" data-action="gadget">${i('panel-top')}<span>ガジェット表示</span>${i('arrow-up-right')}</button><div class="live-control"><span class="live"><b class="live-dot"></b><span id="live-text">LIVE</span></span>${ib('pause','pause','計測を一時停止 / 再開')}</div><label class="interval-label">更新間隔<select id="interval" aria-label="更新間隔"><option value="1">1 秒</option><option value="2" selected>2 秒</option><option value="5">5 秒</option></select></label><div class="version">WINDOWS NATIVE<span>v1.0.0</span></div></div></aside><main><div class="page-header"><div><div class="eyebrow" id="eyebrow">SYSTEM OVERVIEW</div><h1 id="page-title">PCの今を、軽やかに。</h1><p id="machine" class="machine">接続しています…</p></div><div class="header-actions"><span id="preview-badge" ${native?'hidden':''}>デザインプレビュー</span>${ib('refresh','refresh-cw','今すぐ更新 (F5)')}</div></div><div class="workspace" id="workspace"><div class="primary-column"><section id="cpu-panel" class="cpu-panel panel"><div class="metric-heading"><div><span class="metric-title">CPU</span><span id="cpu-value" class="hero-value">—<small>%</small></span><div class="muted metric-subtitle">使用率</div></div><div class="processor-info"><span id="cpu-name">—</span><span id="core-count">—</span></div></div>${chart('cpu-chart',true)}<div class="chart-foot"><span><b class="legend-dot"></b> CPU 使用率</span><span>直近60秒</span></div></section>${processPanel}</div><aside class="telemetry"><section class="panel metric-card"><div class="card-label">メモリ${i('memory-stick')}</div><div id="memory-value" class="metric-value">—<small>%</small></div><div id="memory-capacity" class="metric-caption">— / — GB</div>${chart('memory-chart')}<div class="memory-track"><div id="memory-bar"></div></div><div class="dual-stat"><div><span>使用中</span><strong id="memory-used">—</strong></div><div><span>利用可能</span><strong id="memory-free">—</strong></div></div></section><section class="panel metric-card network-card"><div class="card-label">ネットワーク${i('wifi')}</div><div id="net-value" class="metric-value network-value">—<small>KB/s</small></div><div class="network-rates"><span class="download">↓ <b id="download-value">—</b></span><span class="upload">↑ <b id="upload-value">—</b></span></div>${chart('network-chart')}<div class="network-note">全インターフェイス合計<span>受信 + 送信</span></div></section><section class="panel uptime-card"><div class="card-label">システム稼働時間${i('clock')}</div><div id="uptime" class="uptime">—</div><div class="bottom-stat"><span>プロセス数</span><strong id="total-processes">—</strong></div><div class="bottom-stat"><span>論理プロセッサ</span><strong id="total-cores">—</strong></div></section></aside></div>${settingsPanel}</main><footer><span id="status"><b class="live-dot"></b> 計測を準備しています</span><span id="updated">—</span></footer></div>`;}
function gadgetShell(){return `<div class="gadget-shell"><div id="full-gadget"><header class="gadget-header" data-tauri-drag-region><div class="gadget-brand" data-tauri-drag-region>${logo}</div><span class="drag-grip" data-tauri-drag-region>${i('grip')}</span>${ib('pin','pin','最前面への固定を切り替え')}${ib('mini','minus','ミニバーに切り替え')}${ib('open-settings','settings','設定を開く')}${ib('hide-gadget','x','ガジェットを閉じる')}</header><section class="gadget-cpu"><div class="gadget-label">CPU</div><div class="gadget-cpu-body"><strong id="g-cpu">—<small>%</small></strong>${chart('g-cpu-chart')}</div></section><section class="gadget-memory"><div class="gadget-label">メモリ</div><div class="gadget-memory-body"><strong id="g-memory">—<small>%</small></strong><div><div class="memory-track"><div id="g-memory-bar"></div></div><span id="g-memory-capacity">— / — GB</span></div></div></section><section class="gadget-network"><span class="download">${i('arrow-down')}<b id="g-download">—</b></span><span class="upload">${i('arrow-up')}<b id="g-upload">—</b></span></section><section class="gadget-processes"><div class="gadget-label">負荷の高いアプリ</div><div id="g-processes"><div class="g-loading">計測を開始しています…</div></div></section><footer class="gadget-footer"><span class="live"><b class="live-dot"></b><span id="g-live">LIVE</span></span><span id="g-interval">2s</span><button data-action="open-main">詳細を開く ${i('arrow-up-right')}</button></footer></div><div id="mini-gadget" hidden data-tauri-drag-region><span class="mini-brand" data-tauri-drag-region>${i('activity')}<span>AERIS</span></span><div class="mini-number" data-tauri-drag-region><span>CPU</span><strong id="m-cpu">—%</strong></div><div class="mini-number" data-tauri-drag-region><span>MEM</span><strong id="m-memory">—%</strong></div>${chart('m-chart')}<div class="mini-net" data-tauri-drag-region><span>↓ <b id="m-down">—</b></span><span>↑ <b id="m-up">—</b></span></div>${ib('mini','maximize-2','ガジェット表示に戻す')}${ib('hide-gadget','x','ガジェットを閉じる')}</div></div>`;}
$('#app').innerHTML=(gadget?gadgetShell():mainShell())+`<div id="toast" class="toast" role="status" hidden></div><dialog id="detail-dialog"><div id="detail-content"></div></dialog><dialog id="end-dialog"><div class="dialog-heading"><span class="dialog-symbol">${i('power')}</span><h2>タスクを終了しますか？</h2></div><p id="end-name" class="end-name"></p><p class="muted">未保存の作業が失われる可能性があります。<br>このプロセスだけを終了します。</p><div class="dialog-actions"><button class="quiet-button" data-action="cancel-end">キャンセル</button><button class="danger-button" data-action="confirm-end">終了する</button></div></dialog>`;
document.body.classList.toggle('gadget',gadget);
const background = createBackground($(gadget?'.gadget-shell':'.app-shell'));
if(!gadget) $('#settings-page > .muted').insertAdjacentHTML('afterend',appearanceSettings);
background.update(settings);
function decorate(){createIcons({icons,attrs:{'stroke-width':1.65}});}
decorate();
function notify(message:string){$('#toast').textContent=message; $('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function appBadge(name:string){const lower=name.toLowerCase(); const type=lower.includes('chrome')?'chrome':lower.includes('code')?'code':lower.includes('discord')?'discord':lower.includes('explorer')?'explorer':lower.includes('aeris')?'aeris':''; const initials=type==='code'?'〈〉':type==='chrome'?'':type==='explorer'?'▰':type==='aeris'?'ϟ':name.replace(/[^a-z0-9]/gi,'').slice(0,2).toUpperCase();return `<span class="app-icon ${type}">${esc(initials)}</span>`;}
function updateSettings(){
 const appearance={...settings};
 if(!gadget) for(const id of ['glass','image'] as const){const input=$<HTMLInputElement>(`#${id}-opacity`);if(document.activeElement===input)appearance[id==='glass'?'glassOpacity':'imageOpacity']=Number(input.value);}
 background.update(appearance);
 if(!gadget){
  document.querySelectorAll<HTMLButtonElement>('[data-wallpaper]').forEach(b=>{const active=b.dataset.wallpaper===settings.wallpaper;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  ($('#wallpaper-interval') as HTMLSelectElement).value=String(settings.wallpaperInterval);
  ($('#wallpaper-interval') as HTMLSelectElement).disabled=settings.wallpaper!=='random';
  for(const [id,value] of [['glass',settings.glassOpacity],['image',settings.imageOpacity]] as const){
   const input=$<HTMLInputElement>(`#${id}-opacity`);
   if(document.activeElement!==input){input.value=String(value);$(`#${id}-value`).textContent=`${value}%`;}
  }
 }
 if(!gadget){$('#interval') && (($('#interval') as HTMLSelectElement).value=String(settings.interval));document.querySelectorAll<HTMLButtonElement>('[data-interval]').forEach(b=>b.classList.toggle('active',Number(b.dataset.interval)===settings.interval));$('#pin-toggle').setAttribute('aria-checked',String(settings.pinned));}
 else {$('#full-gadget').hidden=settings.mini;$('#mini-gadget').hidden=!settings.mini;document.body.classList.toggle('mini',settings.mini);document.querySelector('[data-action="pin"]')?.classList.toggle('is-pinned',settings.pinned);}
}
function receive(data:Snapshot){snapshot=data;settings=data.settings;updateSettings();document.body.classList.toggle('paused',data.paused); if(!data.ready)return;
 if(data.error)notify(data.error);
 if(gadget){renderGadget();return;}
 $('#cpu-value').innerHTML=`${data.sample.cpu.toFixed(0)}<small>%</small>`;
 $('#memory-value').innerHTML=`${data.sample.memory.toFixed(0)}<small>%</small>`;
 const totalNet=data.sample.download+data.sample.upload; const net=rate(totalNet).split(' ');
 $('#net-value').innerHTML=`${net[0]}<small>${net[1]}</small>`;
 $('#cpu-name').textContent=data.cpuName;$('#core-count').textContent=`${data.cores} 論理プロセッサ`;
 $('#machine').textContent=`${data.host}  /  ${data.os}`;
 $('#memory-capacity').textContent=`${(data.usedMemory/1073741824).toFixed(1)} / ${(data.totalMemory/1073741824).toFixed(1)} GB`;
 $('#memory-used').textContent=bytes(data.usedMemory);$('#memory-free').textContent=bytes(data.totalMemory-data.usedMemory);$('#memory-bar').style.width=`${data.sample.memory}%`;
 $('#download-value').textContent=rate(data.sample.download);$('#upload-value').textContent=rate(data.sample.upload);
 $('#uptime').textContent=uptime(data.uptime);$('#total-processes').textContent=String(data.processes.length);$('#total-cores').textContent=String(data.cores);
 $('#live-text').textContent=data.paused?'PAUSED':'LIVE';
 const pauseButton=document.querySelector('[data-action="pause"]')!;pauseButton.setAttribute('aria-label',data.paused?'計測を再開':'計測を一時停止');pauseButton.innerHTML=i(data.paused?'play':'pause');decorate();
 $('#status').innerHTML=`<b class="live-dot"></b>${data.paused?'計測を一時停止中':native?'ライブモニタリング':'プレビュー · サンプルデータ'}<span class="footer-divider">/</span>${data.processes.length} プロセス`;
 $('#updated').textContent=`${settings.interval}秒ごとに更新   ·   ${new Date(data.sample.time).toLocaleTimeString('ja-JP')}`;
 draw('cpu-chart','cpu');draw('memory-chart','memory');draw('network-chart','download',Math.max(1024,...data.history.map(p=>Math.max(p.download,p.upload))),true);
 if(selected){selected=data.processes.find(p=>p.pid===selected!.pid&&p.startTime===selected!.startTime)??null;}
 updateTable();updateSelection();
}
function renderGadget(){const s=snapshot!;
 $('#g-cpu').innerHTML=`${s.sample.cpu.toFixed(0)}<small>%</small>`;$('#g-memory').innerHTML=`${s.sample.memory.toFixed(0)}<small>%</small>`;
 $('#g-memory-capacity').textContent=`${(s.usedMemory/1073741824).toFixed(1)} / ${(s.totalMemory/1073741824).toFixed(0)} GB`;$('#g-memory-bar').style.width=`${s.sample.memory}%`;
 $('#g-download').textContent=rate(s.sample.download);$('#g-upload').textContent=rate(s.sample.upload);
 $('#g-live').textContent=s.paused?'PAUSED':'LIVE';$('#g-interval').textContent=`${s.settings.interval}s`;
 $('#g-processes').innerHTML=filterSort(s.processes,'','cpu',true).slice(0,3).map(p=>`<div class="g-process">${appBadge(p.name)}<span title="${esc(p.name)}">${esc(p.name)}</span><strong>${p.cpu.toFixed(1)}%</strong></div>`).join('');
 $('#m-cpu').textContent=s.sample.cpu.toFixed(0)+'%';$('#m-memory').textContent=s.sample.memory.toFixed(0)+'%';$('#m-down').textContent=rate(s.sample.download);$('#m-up').textContent=rate(s.sample.upload);
 draw('g-cpu-chart','cpu');draw('m-chart','cpu');
}
function updateTable(){if(!snapshot||gadget)return;filtered=filterSort(snapshot.processes,query,sortKey,descending);$('#process-count').textContent=String(filtered.length);$('#empty').textContent=query?'一致するプロセスはありません':'プロセスがありません';$('#empty').hidden=filtered.length>0;renderRows();}
function renderRows(){const scroll=$('#table-scroll');if(!scroll)return;const height=44; const start=Math.min(Math.max(0,filtered.length-1),Math.max(0,Math.floor((scroll.scrollTop-36)/height)-5)); const end=Math.min(filtered.length,start+Math.ceil(scroll.clientHeight/height)+12);const rows=filtered.slice(start,end);
 $('#rows').innerHTML=(start?`<tr aria-hidden="true"><td colspan="5" style="height:${start*height}px;padding:0;border:0"></td></tr>`:'')+rows.map(p=>`<tr data-pid="${p.pid}" class="${selected?.pid===p.pid?'selected':''}" aria-selected="${selected?.pid===p.pid}" tabindex="0"><td><div class="process-name">${appBadge(p.name)}<span title="${esc(p.name)}">${esc(p.name)}</span></div></td><td class="number muted">${p.pid}</td><td class="number cpu-cell"><span class="usage-tint" style="width:${p.cpu}%"></span>${p.cpu.toFixed(1)}<span class="unit">%</span></td><td class="number">${p.memory?bytes(p.memory):'—'}</td><td><span class="process-state ${p.protected?'protected':''}">${p.protected?'保護':'実行中'}</span></td></tr>`).join('')+(end<filtered.length?`<tr aria-hidden="true"><td colspan="5" style="height:${(filtered.length-end)*height}px;padding:0;border:0"></td></tr>`:'');
}
function updateSelection(){if(gadget)return;$('#selection-label').textContent=selected?`${selected.name}  ·  PID ${selected.pid}`:'選択すると詳細を表示します';($('#end-button') as HTMLButtonElement).disabled=!selected||selected.protected;($('#detail-button') as HTMLButtonElement).disabled=!selected;}
function navigate(next:string){if(gadget)return;page=next;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.page===next));$('#workspace').hidden=next==='settings';$('#settings-page').hidden=next!=='settings';$('#cpu-panel').hidden=next==='processes';$('.app-shell').classList.toggle('processes-view',next==='processes');$('#page-title').textContent=next==='overview'?'PCの今を、軽やかに。':next==='processes'?'動きを知る。負荷を見つける。':'設定';$('#eyebrow').textContent=next==='overview'?'SYSTEM OVERVIEW':next==='processes'?'RUNNING PROCESSES':'PREFERENCES';if(next!=='settings')renderRows();}
function details(){if(!selected)return;const p=selected;$('#detail-content').innerHTML=`<div class="detail-heading">${appBadge(p.name)}<div><h2>${esc(p.name)}</h2><span class="muted">PID ${p.pid}</span></div>${ib('close-details','x','詳細を閉じる')}</div><div class="detail-metrics"><div><span>CPU</span><strong>${p.cpu.toFixed(1)}<small>%</small></strong></div><div><span>メモリ</span><strong>${p.memory?bytes(p.memory):'—'}</strong></div></div><dl><dt>開始時刻</dt><dd>${p.startTime?esc(new Date(p.startTime*1000).toLocaleString('ja-JP')):'取得できません'}</dd><dt>実行ファイル</dt><dd class="path">${esc(p.path??'権限により取得できません')}</dd><dt>状態</dt><dd>${p.protected?'保護されたプロセス':'実行中'}</dd></dl><p class="muted detail-note">詳細を開いた時点の値です。</p><div class="dialog-actions"><button class="quiet-button" data-action="close-details">閉じる</button><button class="outline-button" data-action="end" ${p.protected?'disabled':''}>タスクを終了</button></div>`;decorate();($('#detail-dialog') as HTMLDialogElement).showModal();}
function requestEnd(){if(!selected||selected.protected)return;pendingEnd={...selected};($('#detail-dialog') as HTMLDialogElement).close();$('#end-name').textContent=`${pendingEnd.name}  /  PID ${pendingEnd.pid}`;($('#end-dialog') as HTMLDialogElement).showModal();}
async function changeSettings(patch:Partial<Settings>){const next={...settings,...patch};if(native)await invoke('save_settings',{settings:next});else {settings=next;snapshot!.settings=next;updateSettings();if(gadget)renderGadget();} }
async function action(name:string){
 switch(name){
  case 'minimize':if(native)await getCurrentWindow().minimize();break;
  case 'maximize':if(native)await getCurrentWindow().toggleMaximize();break;
  case 'close':if(native)await getCurrentWindow().close();else notify('アプリ版ではトレイに格納します');break;
  case 'quit':if(native)await invoke('quit_app');else notify('アプリ版で利用できます');break;
  case 'gadget':if(native)await invoke('show_gadget');else window.open('/?view=gadget','aeris-gadget','width=340,height=520');break;
  case 'open-main':case 'open-settings':if(native)await invoke('show_main',{settings:name==='open-settings'});else window.open('/');break;
  case 'hide-gadget':if(native)await invoke('hide_gadget');else window.close();break;
  case 'mini':await changeSettings({mini:!settings.mini});break;
  case 'pin':await changeSettings({pinned:!settings.pinned});break;
  case 'pause':if(native)await invoke('set_paused',{paused:!snapshot?.paused});else {snapshot!.paused=!snapshot!.paused;receive(snapshot!);}break;
  case 'refresh':if(native)await invoke('refresh_now');else receive(preview());break;
  case 'clear-search':($('#search') as HTMLInputElement).value='';query='';$('#table-scroll').scrollTop=0;updateTable();break;
  case 'details':details();break;
  case 'close-details':($('#detail-dialog') as HTMLDialogElement).close();break;
  case 'end':requestEnd();break;
  case 'cancel-end':($('#end-dialog') as HTMLDialogElement).close();pendingEnd=null;break;
  case 'confirm-end':if(pendingEnd&&!busy){busy=true;const target={...pendingEnd};try {if(native){await invoke('end_process',{pid:target.pid,startTime:target.startTime});notify(`${target.name} を終了しました`);}else notify('プレビューではプロセスを終了しません');($('#end-dialog') as HTMLDialogElement).close();pendingEnd=null;}finally{busy=false;}}break;
 }
}
document.addEventListener('click',event=>{const target=event.target as HTMLElement;const button=target.closest<HTMLButtonElement>('button');if(button?.disabled)return;
 if(button?.dataset.action){void action(button.dataset.action).catch(e=>notify(String(e)));return;}
 if(button?.dataset.page){navigate(button.dataset.page);return;}
 if(button?.dataset.wallpaper){void changeSettings({wallpaper:button.dataset.wallpaper as Settings['wallpaper']}).catch(e=>notify(String(e)));return;}
 if(button?.dataset.interval){void changeSettings({interval:Number(button.dataset.interval)}).catch(e=>notify(String(e)));return;}
 if(button?.dataset.sort){const key=button.dataset.sort as SortKey;descending=key===sortKey?!descending:key!=='name';sortKey=key;document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(b=>{b.querySelector('.sort-mark')!.textContent=b.dataset.sort===key?(descending?'↓':'↑'):'';b.closest('th')!.setAttribute('aria-sort',b.dataset.sort===key?(descending?'descending':'ascending'):'none');});updateTable();return;}
 const row=target.closest<HTMLElement>('[data-pid]');if(row){selected=snapshot?.processes.find(p=>p.pid===Number(row.dataset.pid))??null;document.querySelectorAll<HTMLElement>('[data-pid]').forEach(r=>{const active=Number(r.dataset.pid)===selected?.pid;r.classList.toggle('selected',active);r.setAttribute('aria-selected',String(active));});updateSelection();}
});
document.addEventListener('dblclick',e=>{if((e.target as HTMLElement).closest('[data-pid]'))details();});
document.addEventListener('keydown',e=>{if(e.key==='F5'){e.preventDefault();void action('refresh').catch(e=>notify(String(e)));}if(!gadget&&e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();if(page==='settings')navigate('processes');$('#search').focus();}if(e.key==='Escape'&&!gadget&&!(document.querySelector('dialog[open]'))){void action('clear-search');}if((e.key==='Enter'||e.key===' ')&&(e.target as HTMLElement).matches('[data-pid]')){e.preventDefault();(e.target as HTMLElement).click();details();}});
if(!gadget){$('#search').addEventListener('input',e=>{query=(e.target as HTMLInputElement).value;$('#table-scroll').scrollTop=0;updateTable();});$('#interval').addEventListener('change',e=>{void changeSettings({interval:Number((e.target as HTMLSelectElement).value)}).catch(e=>notify(String(e)));});$('#table-scroll').addEventListener('scroll',()=>renderRows(),{passive:true});new ResizeObserver(()=>renderRows()).observe($('#table-scroll'));}

function preview():Snapshot {const time=Date.now();return {sample:{time,cpu:24,memory:42,download:84*1024,upload:44*1024},history:Array.from({length:61},(_,k)=>({time:time-(60-k)*1000,cpu:23+Math.sin(k*1.7)*3+Math.cos(k*.72)*3+(k===22?35:k===23?19:0),memory:40+k/30,download:(60+Math.sin(k)*15+Math.cos(k*.4)*12)*1024,upload:(28+Math.cos(k)*10)*1024})),totalMemory:32*1073741824,usedMemory:13.4*1073741824,cpuName:'12th Gen Intel® Core™ i7-12700H',cores:20,uptime:239685,host:'AERIS DESKTOP',os:'Windows 11 · サンプルデータ',paused:snapshot?.paused??false,ready:true,settings,processes:['chrome.exe','Code.exe','explorer.exe','Discord.exe','Spotify.exe','aeris.exe','SearchHost.exe','RuntimeBroker.exe','dwm.exe','svchost.exe','msedge.exe','System'].map((name,k)=>({pid:15244-k*271,name,cpu:[8.7,4.3,2.1,1.6,.9,.2,.1,0,0,0,0,0][k],memory:[1234.5,512.3,183.6,256.7,98.3,58.4,26,32,145,16,410,2][k]*1048576,startTime:time/1000-4000,path:`C:\\Program Files\\${name}`,protected:k===5||k===8||k===9||k===11})),error:null};}
if(!gadget){
 $('#wallpaper-interval').addEventListener('change',e=>{void changeSettings({wallpaperInterval:Number((e.target as HTMLSelectElement).value)}).catch(e=>notify(String(e)));});
 for(const id of ['glass','image'] as const){
  const input=$<HTMLInputElement>(`#${id}-opacity`);
  input.addEventListener('input',()=>{$(`#${id}-value`).textContent=`${input.value}%`;background.update({...settings,[id==='glass'?'glassOpacity':'imageOpacity']:Number(input.value)});});
  input.addEventListener('change',()=>{void changeSettings({[id==='glass'?'glassOpacity':'imageOpacity']:Number(input.value)}).catch(e=>{background.update(settings);notify(String(e));});});
 }
}
if(native){
 void listen<boolean>('window-activity',e=>{background.setActive(e.payload);if(e.payload)void invoke<Snapshot>('get_snapshot').then(receive).catch(e=>notify(String(e)));});
 void (async()=>{await listen<Snapshot>('snapshot',e=>receive(e.payload));if(!gadget)await listen<string>('navigate',e=>navigate(e.payload));receive(await invoke<Snapshot>('get_snapshot'));})().catch(e=>{notify(`システムに接続できません: ${String(e)}`);if(!gadget)$('#status').textContent='接続エラー — AERISを再起動してください';});
}else {receive(preview());document.title='AERIS — デザインプレビュー';}
