use serde::Serialize;
#[derive(Clone,Default,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Snapshot { pub adapters:Vec<Adapter>, pub error:Option<String>, pub warming:bool }
#[derive(Clone,Default,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Adapter { pub id:String,pub name:String,pub usage:Option<f64>,pub dedicated_used:Option<u64>,pub shared_used:Option<u64>,pub dedicated_total:u64,pub shared_total:u64 }

#[cfg(not(target_os="windows"))]
#[derive(Default)]
pub struct Monitor;
#[cfg(not(target_os="windows"))]
impl Monitor { pub fn reset(&mut self){} pub fn sample(&mut self)->Snapshot{Snapshot{error:Some("GPUのライブ監視はWindows専用です".into()),..Default::default()}} }
#[cfg(target_os="windows")]
pub use native::Monitor;

#[cfg(target_os="windows")]
mod native {
    use super::*;
    use std::collections::HashMap;
    use windows::{core::{w,PCWSTR},Win32::{Graphics::Dxgi::{CreateDXGIFactory1,IDXGIFactory1},System::Performance::*}};
    struct Query {handle:PDH_HQUERY,engine:PDH_HCOUNTER,dedicated:PDH_HCOUNTER,shared:PDH_HCOUNTER,adapters:Vec<Adapter>}
    impl Drop for Query {fn drop(&mut self){unsafe{PdhCloseQuery(self.handle);}}}
    fn check(status:u32)->Result<(),String>{if status==0{Ok(())}else{Err(format!("GPUカウンターを取得できません (PDH 0x{status:08X})"))}}
    impl Query {
        fn new()->Result<Self,String>{unsafe{
            let mut handle=PDH_HQUERY::default();check(PdhOpenQueryW(PCWSTR::null(),0,&mut handle))?;
            let mut q=Self{handle,engine:Default::default(),dedicated:Default::default(),shared:Default::default(),adapters:vec![]};
            let factory:IDXGIFactory1=CreateDXGIFactory1().map_err(|e|e.to_string())?;
            for index in 0..32 {let Ok(adapter)=factory.EnumAdapters1(index)else{break};let desc=adapter.GetDesc1().map_err(|e|e.to_string())?;
                if desc.Flags&2!=0{continue;}
                let len=desc.Description.iter().position(|c|*c==0).unwrap_or(desc.Description.len());
                q.adapters.push(Adapter{id:format!("luid_0x{:08x}_0x{:08x}",desc.AdapterLuid.HighPart as u32,desc.AdapterLuid.LowPart),name:String::from_utf16_lossy(&desc.Description[..len]),dedicated_total:desc.DedicatedVideoMemory as u64,shared_total:desc.SharedSystemMemory as u64,..Default::default()});
            }
            check(PdhAddEnglishCounterW(handle,w!("\\GPU Engine(*)\\Utilization Percentage"),0,&mut q.engine))?;
            check(PdhAddEnglishCounterW(handle,w!("\\GPU Adapter Memory(*)\\Dedicated Usage"),0,&mut q.dedicated))?;
            check(PdhAddEnglishCounterW(handle,w!("\\GPU Adapter Memory(*)\\Shared Usage"),0,&mut q.shared))?;
            check(PdhCollectQueryData(handle))?;Ok(q)
        }}
        fn values(counter:PDH_HCOUNTER)->Result<Vec<(String,f64)>,String>{unsafe{
            let format=PDH_FMT(PDH_FMT_DOUBLE.0|0x8000);let mut bytes=0;let mut count=0;
            let status=PdhGetFormattedCounterArrayW(counter,format,&mut bytes,&mut count,None);
            if status!=PDH_MORE_DATA{check(status)?;return Ok(vec![]);}
            for _ in 0..3 {
                // u64 storage gives the native structure its required alignment.
                let mut buffer=vec![0u64;(bytes as usize+7)/8];let mut capacity=(buffer.len()*8) as u32;
                let ptr=buffer.as_mut_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>();
                let status=PdhGetFormattedCounterArrayW(counter,format,&mut capacity,&mut count,Some(ptr));
                if status==PDH_MORE_DATA{bytes=0;PdhGetFormattedCounterArrayW(counter,format,&mut bytes,&mut count,None);continue;}
                check(status)?;
                if count as usize*std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>()>buffer.len()*8{return Err("GPU応答のサイズが不正です".into());}
                return Ok(std::slice::from_raw_parts(ptr,count as usize).iter().filter(|v|v.FmtValue.CStatus<=1).filter_map(|v|{let value=v.FmtValue.Anonymous.doubleValue;if value.is_finite(){Some((v.szName.to_string().unwrap_or_default().to_lowercase(),value.max(0.)))}else{None}}).collect());
            }Err("GPU構成が変化しました。再試行してください".into())
        }}
        fn sample(&mut self)->Result<Snapshot,String>{unsafe{check(PdhCollectQueryData(self.handle))?;}
            let engines=Self::values(self.engine)?;let dedicated=Self::values(self.dedicated)?;let shared=Self::values(self.shared)?;
            let mut adapters=self.adapters.clone();
            for adapter in &mut adapters {
                let marker=format!("{}_",adapter.id);let mut groups=HashMap::<String,f64>::new();
                for (name,value) in engines.iter().filter(|(name,_)|name.contains(&marker)){if let Some(start)=name.find(&marker){*groups.entry(name[start..].to_owned()).or_default()+=value;}}
                adapter.usage=groups.values().copied().reduce(f64::max).map(|v|v.clamp(0.,100.));
                let sum=|rows:&[(String,f64)]|{let values:Vec<_>=rows.iter().filter(|(name,_)|name.starts_with(&marker)).collect();if values.is_empty(){None}else{Some(values.iter().map(|(_,v)|*v as u64).sum())}};
                adapter.dedicated_used=sum(&dedicated);adapter.shared_used=sum(&shared);
            }
            Ok(Snapshot{adapters,error:None,warming:false})
        }
    }
    #[derive(Default)]
    pub struct Monitor {query:Option<Query>}
    impl Monitor {
        pub fn reset(&mut self){self.query=None;}
        pub fn sample(&mut self)->Snapshot{
            if self.query.is_none(){match Query::new(){Ok(q)=>{let adapters=q.adapters.clone();self.query=Some(q);return Snapshot{adapters,warming:true,error:None};},Err(e)=>return Snapshot{error:Some(e),..Default::default()}}}
            self.query.as_mut().unwrap().sample().unwrap_or_else(|e|Snapshot{error:Some(e),..Default::default()})
        }
    }
}
