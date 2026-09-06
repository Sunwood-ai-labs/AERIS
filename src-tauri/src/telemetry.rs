use serde::Serialize;
use sysinfo::{Disks, Networks, System};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Performance {
    pub gpu: Option<super::gpu::Snapshot>,
    pub cpus: Vec<Core>,
    pub total_swap: u64,
    pub used_swap: u64,
    pub disks: Vec<Disk>,
    pub interfaces: Vec<Interface>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Core { name: String, pub usage: f32, frequency: u64 }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk { name: String, mount: String, kind: String, filesystem: String, total: u64, available: u64, read: f64, write: f64 }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interface { name: String, mac: String, download: f64, upload: f64, total_received: u64, total_transmitted: u64 }

pub fn sample(system: &System, disks: &Disks, networks: &Networks, elapsed: f64) -> Performance {
    Performance {
        gpu: None,
        cpus: system.cpus().iter().map(|c| Core { name: c.name().into(), usage: c.cpu_usage().clamp(0.,100.), frequency: c.frequency() }).collect(),
        total_swap: system.total_swap(), used_swap: system.used_swap(),
        disks: disks.iter().map(|d| { let io=d.usage(); Disk {
            name: d.name().to_string_lossy().into_owned(), mount: d.mount_point().to_string_lossy().into_owned(),
            kind: format!("{:?}",d.kind()), filesystem: d.file_system().to_string_lossy().into_owned(),
            total: d.total_space(), available: d.available_space(), read: io.read_bytes as f64/elapsed, write: io.written_bytes as f64/elapsed,
        }}).collect(),
        interfaces: networks.iter().filter(|(name,_)| !super::loopback(name)).map(|(name,n)| Interface {
            name: name.clone(), mac: n.mac_address().to_string(), download: n.received() as f64/elapsed, upload: n.transmitted() as f64/elapsed,
            total_received: n.total_received(), total_transmitted: n.total_transmitted(),
        }).collect(),
    }
}
