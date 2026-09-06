using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class AerisGpu {
    [StructLayout(LayoutKind.Explicit)] struct Value { [FieldOffset(0)] public uint Status; [FieldOffset(8)] public double Number; }
    [StructLayout(LayoutKind.Sequential)] struct Item { public IntPtr Name; public Value Value; }
    [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhOpenQueryW(string source,IntPtr user,out IntPtr query);
    [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr query,string path,IntPtr user,out IntPtr counter);
    [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll")] static extern uint PdhCloseQuery(IntPtr query);
    [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr counter,uint format,ref uint size,out uint count,IntPtr items);
    static void Check(uint status) {if(status!=0)throw new InvalidOperationException("PDH 0x"+status.ToString("X8"));}
    static Dictionary<string,double> Read(IntPtr counter) {
        uint size=0,count;uint status=PdhGetFormattedCounterArrayW(counter,0x200|0x8000,ref size,out count,IntPtr.Zero);
        if(status!=0x800007D2){Check(status);return new Dictionary<string,double>();}
        for(int attempt=0;attempt<3;attempt++){
            IntPtr buffer=Marshal.AllocHGlobal((int)size);
            try {uint capacity=size;status=PdhGetFormattedCounterArrayW(counter,0x200|0x8000,ref capacity,out count,buffer);
                if(status==0x800007D2){size=0;PdhGetFormattedCounterArrayW(counter,0x200|0x8000,ref size,out count,IntPtr.Zero);continue;}
                Check(status);var rows=new Dictionary<string,double>();int stride=Marshal.SizeOf(typeof(Item));
                for(int i=0;i<count;i++){var item=(Item)Marshal.PtrToStructure(IntPtr.Add(buffer,i*stride),typeof(Item));if(item.Value.Status<=1)rows[Marshal.PtrToStringUni(item.Name)]=item.Value.Number;}return rows;
            }finally{Marshal.FreeHGlobal(buffer);}
        }throw new InvalidOperationException("GPU counters changed during collection; retry.");
    }
    public static object Sample(){
        IntPtr query;Check(PdhOpenQueryW(null,IntPtr.Zero,out query));
        try{IntPtr engine,dedicated,shared;
            Check(PdhAddEnglishCounterW(query,@"\GPU Engine(*)\Utilization Percentage",IntPtr.Zero,out engine));
            Check(PdhAddEnglishCounterW(query,@"\GPU Adapter Memory(*)\Dedicated Usage",IntPtr.Zero,out dedicated));
            Check(PdhAddEnglishCounterW(query,@"\GPU Adapter Memory(*)\Shared Usage",IntPtr.Zero,out shared));
            Check(PdhCollectQueryData(query));Thread.Sleep(1100);Check(PdhCollectQueryData(query));
            var engineRows=new List<object>();foreach(var row in Read(engine))engineRows.Add(new {Name=row.Key,UtilizationPercentage=row.Value});
            var memoryRows=new List<object>();var sharedRows=Read(shared);foreach(var row in Read(dedicated)){double sharedValue;sharedRows.TryGetValue(row.Key,out sharedValue);memoryRows.Add(new {Name=row.Key,DedicatedUsage=row.Value,SharedUsage=sharedValue});}
            return new {engines=engineRows.ToArray(),memory=memoryRows.ToArray()};
        }finally{PdhCloseQuery(query);}
    }
}
