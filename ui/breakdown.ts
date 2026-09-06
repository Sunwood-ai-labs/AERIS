import {escapeHtml as esc,bytes,type ProcessRow} from './model';
import type {Resource} from './usage';
import {percentage} from './usage';
export type AppUsage={key:string;name:string;cpu:number;memory:number;count:number;color:string};
export type Segment={key:string|null;name:string;value:number;share:number;count:number;color:string};
export const appKey=(name:string)=>name.trim().toLowerCase();
const palette=['#79aff5','#b7a0ff','#e9d276','#82dbaf','#f28f9a','#77c9e8','#cfb27b','#eca1d0','#b2d889','#7de3cf','#ffc17e','#a7b8e5'];
// Reserve distinct colors for common desktop apps; every other executable also
// gets a deterministic color that does not change when its ranking changes.
const familiarColors:Record<string,string>={'chrome.exe':'#7de3cf','msedge.exe':'#77c9e8','code.exe':'#ffc17e','explorer.exe':'#79aff5','discord.exe':'#b7a0ff','spotify.exe':'#eca1d0','chatgpt.exe':'#b2d889','aeris.exe':'#43d9f5'};
export function appColor(key:string):string {
 if(Object.hasOwn(familiarColors,key))return familiarColors[key];
 let hash=2166136261;for(const char of key){hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;}
 return palette[hash%palette.length];
}
export function aggregateApps(rows:ProcessRow[]):AppUsage[]{
 const groups=new Map<string,AppUsage>();
 for(const p of rows){const key=appKey(p.name)||'unknown';let app=groups.get(key);
  if(!app){app={key,name:p.name||'名前不明',cpu:0,memory:0,count:0,color:appColor(key)};groups.set(key,app);}
  app.count++;for(const metric of ['cpu','memory'] as const)if(Number.isFinite(p[metric])&&p[metric]>0)app[metric]+=p[metric];
 }
 return [...groups.values()];
}
export function breakdown(apps:AppUsage[],resource:Resource,limit=5):{total:number;segments:Segment[]}{
 const ranked=apps.filter(a=>a[resource]>0&&Number.isFinite(a[resource])).sort((a,b)=>b[resource]-a[resource]||a.key.localeCompare(b.key));
 const total=ranked.reduce((sum,a)=>sum+a[resource],0);if(!Number.isFinite(total)||total<=0)return {total:0,segments:[]};
 const count=Math.max(1,Math.floor(limit));const head=ranked.slice(0,count);const tail=ranked.slice(count);
 const segments:Segment[]=head.map(a=>({key:a.key,name:a.name,value:a[resource],share:a[resource]/total*100,count:a.count,color:a.color}));
 if(tail.length){const value=tail.reduce((sum,a)=>sum+a[resource],0);segments.push({key:null,name:`その他 ${tail.length} 種類`,value,share:value/total*100,count:tail.reduce((sum,a)=>sum+a.count,0),color:'#71899e'});}
 return {total,segments};
}
export const usageAmount=(value:number,resource:Resource)=>resource==='cpu'?value.toFixed(1)+'%':bytes(value);
// Keep the physical used/free boundary accurate. Colors only show the relative
// resident-process composition within the used area; they are not physical attribution.
export function memoryCapacity(apps:AppUsage[],used:number,total:number){
 const usedPercent=percentage(used,total);
 const {segments}=breakdown(apps,'memory',3);
 const explanation='使用中の幅をプロセスメモリの比率で色分け。各アプリの物理RAM占有量ではありません（共有ページの重複を含む）。';
 const html=segments.length?segments.map(s=>`<i class="capacity-segment" style="width:${s.share}%;--app-color:${s.color}" role="img" aria-label="${esc(s.name)} · プロセスメモリ ${bytes(s.value)} · 計測合計の${s.share.toFixed(1)}%" title="${esc(s.name)} · ${bytes(s.value)} · 計測合計の${s.share.toFixed(1)}%\n${explanation}"></i>`).join(''):`<i class="capacity-segment capacity-unknown" style="width:100%;--app-color:#71899e" role="img" aria-label="プロセス内訳を取得できません" title="使用中 · プロセス内訳を取得できません"></i>`;
 return {usedPercent,html};
}
export function renderBreakdown(apps:AppUsage[],resource:Resource,compact=false,interactive=true):string{
 const {total,segments}=breakdown(apps,resource,compact?3:5);
 if(!segments.length)return '<p class="breakdown-empty">計測できる使用量がありません</p>';
 const label=resource==='cpu'?'CPU':'メモリ';
 const description=(s:Segment)=>`${s.name} · ${usageAmount(s.value,resource)} · プロセス合計の${s.share.toFixed(1)}% · ${s.key?'同名':''}${s.count}プロセス`;
 const attr=(s:Segment)=>interactive&&s.key?`data-app-key="${esc(s.key)}"`:'';
 return `<div class="stacked-breakdown ${compact?'compact':''}"><div class="stacked-caption"><span>${label} アプリ内訳</span><span>計測合計 ${usageAmount(total,resource)}</span></div><div class="stacked-track" role="group" aria-label="${label}のプロセス合計を100%とした内訳">${segments.map(s=>{const tag=interactive&&s.key?'button':'span';return `<${tag} class="stacked-segment" style="width:${s.share}%;--app-color:${s.color}" ${attr(s)} title="${esc(description(s))}" aria-label="${esc(description(s))}"></${tag}>`;}).join('')}</div><div class="stacked-legend">${segments.map(s=>{const tag=interactive&&s.key?'button':'div';return `<${tag} class="stacked-item" style="--app-color:${s.color}" ${attr(s)} title="${esc(description(s))}"><i></i><span>${esc(s.name)}</span><strong>${usageAmount(s.value,resource)}</strong></${tag}>`;}).join('')}</div><p class="stacked-note">${resource==='memory'?'プロセス合計の内訳 · 共有メモリの重複を含む':'計測できたプロセスのCPU合計を100%として表示'}</p></div>`;
}
