import type {ProcessRow} from './model';

export type Resource='cpu'|'memory';
export const resourceColors={cpu:'#43d9f5',memory:'#bb9bff',high:'#ffc36c',critical:'#ff7f91'};
export function percentage(value:number,total:number):number {
 return Number.isFinite(value)&&Number.isFinite(total)&&total>0?Math.min(100,Math.max(0,value/total*100)):0;
}
export function usageLevel(percent:number,resource:Resource,scope:'total'|'process'='total'):'normal'|'high'|'critical' {
 const [high,critical]=scope==='total'?[70,90]:resource==='cpu'?[25,50]:[10,20];
 return percent>=critical?'critical':percent>=high?'high':'normal';
}
export function usageColor(percent:number,resource:Resource,scope:'total'|'process'='total'):string {
 const level=usageLevel(percent,resource,scope);return level==='normal'?resourceColors[resource]:resourceColors[level];
}
// Compare against the entire snapshot, never just a filtered or virtualized page.
export function usageLeaders(rows:ProcessRow[]) {
 const leader=(resource:Resource)=>rows.reduce<ProcessRow|null>((top,row)=>Number.isFinite(row[resource])&&row[resource]>0&&(!top||row[resource]>top[resource]||(row[resource]===top[resource]&&row.pid<top.pid))?row:top,null);
 return {cpu:leader('cpu'),memory:leader('memory')};
}
