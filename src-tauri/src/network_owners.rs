//! Endpoint ownership, not per-process throughput. No background trace or subprocess.
use serde::Serialize;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Owner { pub pid: u32, pub tcp: u32, pub udp: u32 }
#[derive(Clone, Default, Serialize)]
pub struct Snapshot { pub owners: Vec<Owner>, pub error: Option<String> }

#[cfg(not(target_os = "windows"))]
pub fn sample() -> Snapshot {
    Snapshot { owners: vec![], error: Some("接続元アプリの表示は現在Windowsのみ対応しています".into()) }
}

#[cfg(target_os = "windows")]
mod native {
    use super::*;
    use std::{collections::BTreeMap, ffi::c_void, mem::{offset_of, size_of}};
    use windows::Win32::NetworkManagement::IpHelper::*;
    use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};

    fn table<T: Copy>(offset: usize, query: impl Fn(*mut c_void, &mut u32) -> u32) -> Result<Vec<T>, String> {
        let mut size = 0;
        let status = query(std::ptr::null_mut(), &mut size);
        if status != 0 && status != 122 { return Err(format!("接続情報を取得できません ({status})")); }
        for _ in 0..3 {
            if size < 4 || size > 16 * 1024 * 1024 { return Err("接続テーブルのサイズが範囲外です".into()); }
            // All OWNER_PID tables contain integer fields; 8-byte alignment is sufficient.
            let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
            let capacity = size as usize;
            let status = query(buffer.as_mut_ptr().cast(), &mut size);
            if status == 122 { continue; }
            if status != 0 { return Err(format!("接続情報を取得できません ({status})")); }
            let base = buffer.as_ptr().cast::<u8>();
            let count = unsafe { base.cast::<u32>().read_unaligned() } as usize;
            let length = (size as usize).min(capacity);
            if offset > length || count > (length - offset) / size_of::<T>() {
                return Err("接続テーブルが不完全です".into());
            }
            return Ok((0..count).map(|i| unsafe { base.add(offset + i * size_of::<T>()).cast::<T>().read_unaligned() }).collect());
        }
        Err("接続情報が更新中です。次回の計測で再試行します".into())
    }

    pub fn sample() -> Snapshot {
        let mut owners = BTreeMap::<u32, Owner>::new();
        let mut errors = vec![];
        let mut add = |pid, tcp: bool| { if pid != 0 { let owner = owners.entry(pid).or_insert(Owner { pid, ..Default::default() }); if tcp { owner.tcp += 1; } else { owner.udp += 1; } } };
        macro_rules! collect {
            ($row:ty, $table:ty, $af:expr, tcp) => {
                match table::<$row>(offset_of!($table, table), |ptr, size| unsafe { GetExtendedTcpTable(Some(ptr), size, false, $af.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0) }) {
                    Ok(rows) => for row in rows { if row.dwState == MIB_TCP_STATE_ESTAB.0 as u32 { add(row.dwOwningPid, true); } },
                    Err(e) => errors.push(e),
                }
            };
            ($row:ty, $table:ty, $af:expr, udp) => {
                match table::<$row>(offset_of!($table, table), |ptr, size| unsafe { GetExtendedUdpTable(Some(ptr), size, false, $af.0 as u32, UDP_TABLE_OWNER_PID, 0) }) {
                    Ok(rows) => for row in rows { add(row.dwOwningPid, false); },
                    Err(e) => errors.push(e),
                }
            };
        }
        collect!(MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, AF_INET, tcp);
        collect!(MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID, AF_INET6, tcp);
        collect!(MIB_UDPROW_OWNER_PID, MIB_UDPTABLE_OWNER_PID, AF_INET, udp);
        collect!(MIB_UDP6ROW_OWNER_PID, MIB_UDP6TABLE_OWNER_PID, AF_INET6, udp);
        Snapshot { owners: owners.into_values().collect(), error: if errors.is_empty() { None } else { Some(errors.join(" / ")) } }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::net::{TcpListener, TcpStream, UdpSocket};

        #[test]
        fn actual_tcp_and_udp_sockets_have_the_current_pid() {
            // Hold both ends open throughout the sample; no external traffic or admin rights.
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let _client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
            let _server = listener.accept().unwrap();
            let _udp = UdpSocket::bind("127.0.0.1:0").unwrap();
            let result = sample();
            assert!(result.error.is_none(), "{:?}", result.error);
            let owner = result.owners.iter().find(|p| p.pid == std::process::id()).unwrap();
            assert!(owner.tcp >= 2);
            assert!(owner.udp >= 1);
        }

        #[test]
        fn actual_ipv6_sockets_have_the_current_pid() {
            let Ok(listener) = TcpListener::bind("[::1]:0") else { return }; // IPv6 can be disabled by the host.
            let _client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
            let _server = listener.accept().unwrap();
            let _udp = UdpSocket::bind("[::1]:0").unwrap();
            let rows = table::<MIB_TCP6ROW_OWNER_PID>(offset_of!(MIB_TCP6TABLE_OWNER_PID, table), |ptr, size| unsafe { GetExtendedTcpTable(Some(ptr), size, false, AF_INET6.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0) }).unwrap();
            assert!(rows.iter().filter(|p| p.dwOwningPid == std::process::id() && p.dwState == 5).count() >= 2);
            let rows = table::<MIB_UDP6ROW_OWNER_PID>(offset_of!(MIB_UDP6TABLE_OWNER_PID, table), |ptr, size| unsafe { GetExtendedUdpTable(Some(ptr), size, false, AF_INET6.0 as u32, UDP_TABLE_OWNER_PID, 0) }).unwrap();
            assert!(rows.iter().any(|p| p.dwOwningPid == std::process::id()));
        }
    }
}
#[cfg(target_os = "windows")]
pub use native::sample;
