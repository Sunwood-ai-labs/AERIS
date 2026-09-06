export type ProcessRow = { pid: number; name: string; cpu: number; memory: number; startTime: number; path: string | null; protected: boolean; parent?: number|null; user?: string|null; status?: string; read?: number; write?: number; cpuTime?: number; command?: string[] };
export type Sample = { time: number; cpu: number; memory: number; download: number; upload: number };
export type Settings = { interval: number; pinned: boolean; mini: boolean; wallpaper: 'random'|'none'|'aurora'|'glass'|'nebula'; wallpaperInterval: number; glassOpacity: number; imageOpacity: number };
export type Performance = { cpus:{name:string;usage:number;frequency:number}[]; totalSwap:number; usedSwap:number; disks:{name:string;mount:string;kind:string;filesystem:string;total:number;available:number;read:number;write:number}[]; interfaces:{name:string;mac:string;download:number;upload:number;totalReceived:number;totalTransmitted:number}[] };
export type Snapshot = { sample: Sample; history: Sample[]; processes: ProcessRow[]; totalMemory: number; usedMemory: number; cpuName: string; cores: number; uptime: number; host: string; os: string; paused: boolean; ready: boolean; settings: Settings; error: string | null; performance?:Performance };
export type SortKey = 'name' | 'pid' | 'cpu' | 'memory' | 'read' | 'write';
export function filterSort(rows: ProcessRow[], query: string, key: SortKey, descending: boolean): ProcessRow[] {
 const term = query.trim().toLocaleLowerCase();
 return rows.filter(p => !term || p.name.toLocaleLowerCase().includes(term) || String(p.pid).includes(term)).sort((a,b) => {
  const delta = key === 'name' ? a.name.localeCompare(b.name) : (a[key]??0) - (b[key]??0);
  return (descending ? -delta : delta) || a.pid - b.pid;
 });
}
export function escapeHtml(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
export function bytes(value: number): string { if (value >= 1073741824) return (value / 1073741824).toFixed(1) + ' GB'; if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB'; return (value / 1024).toFixed(0) + ' KB'; }
export function rate(value: number): string { return bytes(value) + '/s'; }
export function uptime(value: number): string { const days=Math.floor(value/86400), h=Math.floor(value%86400/3600), m=Math.floor(value%3600/60), s=Math.floor(value%60); return `${days > 0 ? days+'日 ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
export function chartPoints(history: Sample[], key: keyof Omit<Sample,'time'>, width: number, height: number, max: number, now: number): string {
 return history.filter(p => p.time >= now-60000).map(p => `${Math.max(0,Math.min(width, width*(1-(now-p.time)/60000))).toFixed(1)},${(height-Math.min(1,Math.max(0,p[key]/Math.max(max,1)))*height).toFixed(1)}`).join(' ');
}
