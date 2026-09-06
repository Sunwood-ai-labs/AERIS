import {invoke} from '@tauri-apps/api/core';
import {escapeHtml as esc,bytes} from './model';
type Service={name:string;displayName:string;state:string;pid:number;startMode:string;protected:boolean};
type Startup={id:string;name:string;command:string;scope:string;enabled:boolean|null;kind:string};
type Gpu={devices:{Name:string;DriverVersion:string;AdapterRAM:number}[];engines:{Name:string;UtilizationPercentage:number}[];memory:{Name:string;DedicatedUsage:number;SharedUsage:number}[];error:string|null};
const array=<T>(value:T|T[]|null):T[]=>Array.isArray(value)?value:value?[value]:[];
export function windowsTools(native:boolean,notify:(s:string)=>void){
 let services:Service[]=[],startup:Startup[]=[],active='services',requested='services',query='',busy=false;
 let pending:{operation:string;request:object;label:string}|null=null;
 const root=()=>document.querySelector<HTMLElement>('#tools-content')!;
 const dialog=document.createElement('dialog');dialog.id='tool-confirm';document.body.append(dialog);
 function render(){
  const term=query.toLowerCase();
  if(active==='services')root().innerHTML=`<table class="insights-table"><thead><tr><th>サービス</th><th>状態 / PID</th><th>スタートアップ</th><th>操作</th></tr></thead><tbody>${services.map((s,k)=>({s,k})).filter(({s})=>(s.name+' '+s.displayName).toLowerCase().includes(term)).map(({s,k})=>`<tr><td>${esc(s.displayName)}<span class="muted tool-sub">${esc(s.name)}</span></td><td>${esc(s.state)}<span class="muted tool-sub">PID ${s.pid||'—'}</span></td><td>${esc(s.startMode)}</td><td>${s.protected?'<span class="muted">保護</span>':`<button class="quiet-button" data-tool="service" data-index="${k}" data-operation="${s.state==='Running'?'stop':'start'}">${s.state==='Running'?'停止':'開始'}</button>${s.state==='Running'?`<button class="quiet-button" data-tool="service" data-index="${k}" data-operation="restart">再起動</button>`:''}`}</td></tr>`).join('')}</tbody></table>`;
  else root().innerHTML=`<p class="muted">Runレジストリとスタートアップフォルダーを表示します。タスクスケジューラー・ストアアプリなどは対象外です。</p><table class="insights-table"><thead><tr><th>アプリ / 起動コマンド</th><th>対象</th><th>状態</th><th>操作</th></tr></thead><tbody>${startup.map((s,k)=>({s,k})).filter(({s})=>(s.name+' '+s.command).toLowerCase().includes(term)).map(({s,k})=>`<tr><td>${esc(s.name)}<span class="muted tool-sub">${esc(s.command)}</span></td><td>${esc(s.scope)}<span class="muted tool-sub">${esc(s.kind)}</span></td><td>${s.enabled===null?'不明':s.enabled?'有効':'無効'}</td><td><button class="quiet-button" data-tool="startup" data-index="${k}" ${s.enabled===null?'disabled':''}>${s.enabled?'無効にする':'有効にする'}</button></td></tr>`).join('')}</tbody></table>`;
 }
 async function load(page:string){
  requested=page;if(busy){root().innerHTML='<p class="muted">画面を切り替えています…</p>';return;}active=page;busy=true;query='';
  const host=document.querySelector<HTMLElement>('#tools-page')!;
  host.innerHTML='<div class="resource-heading"><input id="tool-search" aria-label="管理項目を検索" placeholder="名前を検索"><button class="quiet-button" data-tool="refresh">更新</button></div><section id="tools-content" class="panel resource-section"><p class="muted">Windowsから取得しています…</p></section>';
  host.querySelector('input')!.addEventListener('input',e=>{query=(e.target as HTMLInputElement).value;render();});
  try{if(native){const data=await invoke<any>('system_tool',{operation:page,request:{}});if(page==='services')services=array(data);else startup=array(data);}else{services=[{name:'DemoService',displayName:'AERIS Demo Service',state:'Running',pid:1234,startMode:'Manual',protected:false}];startup=[{id:'user-run',name:'Demo App',command:'C:\\Apps\\Demo.exe',scope:'Current user',enabled:true,kind:'Registry'}];}if(requested===page)render();}catch(e){if(requested===page)root().innerHTML=`<p role="alert">${esc(String(e))}</p>`;}finally{busy=false;if(requested!==page)void load(requested);}
 }
 function confirm(operation:string,request:object,label:string){pending={operation,request,label};dialog.innerHTML=`<h2>${esc(label)}</h2><p class="muted">${operation==='service_action'?'関連するアプリやWindowsの動作に影響する場合があります。':operation==='priority'?'選択したプロセスのCPU割り当て優先度を変更します。':'次回のサインイン時から適用されます。元の起動コマンドは保持します。'}</p><p id="tool-error" role="alert"></p><div class="dialog-actions"><button class="quiet-button" data-tool="cancel">キャンセル</button><button class="primary-button" data-tool="confirm">変更する</button></div>`;dialog.showModal();}
 document.addEventListener('click',async e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');if(!b||b.disabled)return;const kind=b.dataset.tool;try{
  if(kind==='refresh'){await load(active);return;}
  if(kind==='cancel'){dialog.close();pending=null;return;}
  if(kind==='service'){const s=services[Number(b.dataset.index)];if(s&&!s.protected)confirm('service_action',{name:s.name,action:b.dataset.operation},`${s.displayName} — ${b.textContent}`);return;}
  if(kind==='startup'){const s=startup[Number(b.dataset.index)];if(s&&s.enabled!==null)confirm('startup_action',{...s,enabled:!s.enabled},`${s.name} — ${s.enabled?'無効化':'有効化'}`);return;}
  if(kind==='confirm'&&pending){b.disabled=true;try{if(!native){notify('プレビューでは変更しません');dialog.close();return;}await invoke('system_tool',pending);dialog.close();pending=null;notify('変更しました');await load(active);}catch(e){dialog.querySelector('#tool-error')!.textContent=String(e);}finally{b.disabled=false;}}
 }catch(e){notify(String(e));}});
 return {load,priority:(request:object)=>confirm('priority',request,'プロセスの優先度を変更しますか？')};
}

export async function gpuDetails(native:boolean):Promise<string>{
 if(!native)return '<p>Demo GPU · 3D 18% · 専用メモリ 1.2 GB（サンプル）</p>';
 const gpu=await invoke<Gpu>('system_tool',{operation:'gpus',request:{}});
 const engines=new Map<string,number>();
 for(const e of array(gpu.engines)){const match=e.Name.match(/luid_(.+?)_phys_(\d+)_eng_(\d+)_engtype_(.+)$/);if(match){const key=`${match[1]} / GPU ${match[2]} / ${match[4]} / engine ${match[3]}`;engines.set(key,(engines.get(key)??0)+Number(e.UtilizationPercentage));}}
 return `<p class="muted">更新ボタンを押した時点のGPUカウンターです。LUIDはWindowsのアダプター識別子です。</p>${array(gpu.devices).map(d=>`<h3>${esc(d.Name)}</h3><p class="muted">Driver ${esc(d.DriverVersion)}</p>`).join('')}${gpu.error?`<p role="status">カウンター取得不可: ${esc(gpu.error)}</p>`:''}<div class="resource-columns">${[...engines].filter(([,v])=>v>0).map(([name,v])=>`<div class="core-tile"><span>${esc(name)}</span><strong>${Math.min(100,v).toFixed(1)}%</strong></div>`).join('')||'<p class="muted">使用中のGPUエンジンはありません / 未取得</p>'}</div>${array(gpu.memory).map(m=>`<p>${esc(m.Name)} · 専用 ${bytes(Number(m.DedicatedUsage))} / 共有 ${bytes(Number(m.SharedUsage))}</p>`).join('')}`;
}

export async function sessionDetails(native:boolean):Promise<string>{
 if(!native)return '<p>Demo User · Console · Active · ID 1（サンプル）</p>';
 const result=await invoke<{id:number;user:string;domain:string;station:string;state:number}[]>('system_tool',{operation:'sessions',request:{}});
 const states=['Active','Connected','Connect query','Shadow','Disconnected','Idle','Listen','Reset','Down','Initializing'];
 return array(result).map(s=>`<div class="interface-row"><strong>${esc(s.domain+'\\'+s.user)}</strong><span>${esc(s.station)} · ID ${s.id}</span><span>${esc(states[s.state]??'Unknown')}</span></div>`).join('')||'<p class="muted">取得できるサインインセッションがありません</p>';
}
