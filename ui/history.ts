import type {Snapshot,ProcessRow} from './model';
export type HistoryRow={key:string;name:string;pid:number;cpuMs:number;peakMemory:number;lastSeen:number;baseline:number;active:boolean};
export class AppHistory {
 rows=new Map<string,HistoryRow>();
 since=0;
 update(s:Snapshot){
  if(!this.since)this.since=s.sample.time;
  for(const row of this.rows.values())row.active=false;
  for(const p of s.processes){const key=`${p.pid}:${p.startTime}`;let row=this.rows.get(key);const cpu=p.cpuTime??0;
   if(!row){row={key,name:p.name,pid:p.pid,cpuMs:0,peakMemory:0,lastSeen:s.sample.time,baseline:cpu,active:true};this.rows.set(key,row);}
   row.cpuMs=Math.max(row.cpuMs,cpu-row.baseline);row.peakMemory=Math.max(row.peakMemory,p.memory);row.lastSeen=s.sample.time;row.active=true;
  }
  // Retain bounded recent history, including exited processes.
  const stale=[...this.rows.values()].filter(r=>!r.active).sort((a,b)=>a.lastSeen-b.lastSeen);
  for(const row of stale){if(this.rows.size<=1000)break;this.rows.delete(row.key);}
 }
 reset(s:Snapshot){this.rows.clear();this.since=0;this.update(s);}
 list(){return [...this.rows.values()].sort((a,b)=>b.cpuMs-a.cpuMs||b.peakMemory-a.peakMemory);}
}
export function users(rows:ProcessRow[]){
 const groups=new Map<string,{name:string;cpu:number;memory:number;count:number}>();
 for(const p of rows){const name=p.user??'取得不可';const row=groups.get(name)??{name,cpu:0,memory:0,count:0};row.cpu+=p.cpu;row.memory+=p.memory;row.count++;groups.set(name,row);}
 return [...groups.values()].sort((a,b)=>b.cpu-a.cpu||b.memory-a.memory);
}
