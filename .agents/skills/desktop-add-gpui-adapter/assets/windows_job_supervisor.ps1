# 固定 Windows Job 桥接；输入是数据，禁止将产品参数插入 PowerShell 源码。
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$nativeSource = @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;

// 每次 supervisor 只持有一个匿名 Job；此进程不加入目标 Job。
public static class HarnessOwnedJob {
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {
        public int Length; public IntPtr Descriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool Inherit;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupInfo {
        public int Size; public string Reserved; public string Desktop; public string Title;
        public uint X, Y, XSize, YSize, XChars, YChars, Fill, Flags;
        public ushort Show, ReservedSize; public IntPtr ReservedBytes, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveLimit; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint Faults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits data, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting data, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SecurityAttributes attrs, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string name, uint access, uint sharing, ref SecurityAttributes attrs, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref UIntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr kind, IntPtr values, UIntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app, StringBuilder command, IntPtr processAttrs, IntPtr threadAttrs, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);

    static readonly object OutputLock = new object();
    static int StopRequested;
    static Exception OutputFailure;
    // 输出协议只含固定键、数字与 base64；产品任意输出不能伪造控制事件。
    static void Emit(string frame) { lock(OutputLock) { Console.Out.WriteLine(frame); Console.Out.Flush(); } }
    static void Check(bool ok, string stage) { if (!ok) throw new JobFailure(stage, Marshal.GetLastWin32Error()); }
    sealed class JobFailure : Exception {
        public string Stage; public int Code;
        public JobFailure(string stage, int code) { Stage=stage; Code=code; }
    }
    static void Close(ref IntPtr handle) { if (handle != IntPtr.Zero && handle != new IntPtr(-1)) { CloseHandle(handle); handle=IntPtr.Zero; } }
    // 父读取端不继承；只有白名单中的写端进入产品进程。
    static void Pipe(out IntPtr read, out IntPtr write, ref SecurityAttributes attrs) {
        Check(CreatePipe(out read, out write, ref attrs, 4096), "create-pipe");
        Check(SetHandleInformation(read, 1, 0), "protect-pipe");
    }
    // 后台线程并发排空两个输出，不等待 leader 退出后再读取。
    static Thread Drain(IntPtr raw, string stream) {
        Thread thread = new Thread(delegate() {
            try {
                using (SafeFileHandle handle = new SafeFileHandle(raw, true))
                using (FileStream input = new FileStream(handle, FileAccess.Read, 4096, false)) {
                    byte[] buffer = new byte[4096]; int count;
                    while ((count=input.Read(buffer,0,buffer.Length)) != 0)
                        Emit("{\"type\":\"output\",\"stream\":\""+stream+"\",\"data\":\""+Convert.ToBase64String(buffer,0,count)+"\"}");
                }
            } catch(Exception failure) { OutputFailure=failure; Interlocked.Exchange(ref StopRequested,1); }
        });
        thread.IsBackground=true; thread.Start(); return thread;
    }
    // 控制 stdin 属于 supervisor；EOF/stop 都停止同一 Job，不能转交给产品。
    static void ReadControl() {
        try { string line=Console.In.ReadLine(); if (line != null && line != "stop") OutputFailure=new InvalidDataException("invalid-control"); }
        catch(Exception failure) { OutputFailure=failure; }
        Interlocked.Exchange(ref StopRequested,1);
    }
    // 创建、归属、运行及回收只使用本次 HANDLE，绝不根据 PID 重建所有权。
    public static int Run(string executable, string commandLine, string cwd, bool keepDescendants) {
        IntPtr job=IntPtr.Zero, input=IntPtr.Zero, outRead=IntPtr.Zero, outWrite=IntPtr.Zero, errRead=IntPtr.Zero, errWrite=IntPtr.Zero;
        IntPtr attrs=IntPtr.Zero, handles=IntPtr.Zero, jobs=IntPtr.Zero;
        ProcessInfo process=new ProcessInfo(); bool attributesReady=false, assigned=false, completed=false;
        Thread output=null, error=null;
        try {
            Thread control=new Thread(ReadControl); control.IsBackground=true; control.Start();
            job=CreateJobObjectW(IntPtr.Zero,null); Check(job!=IntPtr.Zero,"create-job");
            ExtendedLimits limits=new ExtendedLimits(); limits.Basic.Flags=0x2000;
            Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))),"limit-job");
            SecurityAttributes security=new SecurityAttributes(); security.Length=Marshal.SizeOf(typeof(SecurityAttributes)); security.Inherit=true;
            Pipe(out outRead,out outWrite,ref security); Pipe(out errRead,out errWrite,ref security);
            input=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero); Check(input!=new IntPtr(-1),"open-null");
            UIntPtr size=UIntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
            if (size==UIntPtr.Zero) throw new JobFailure("attribute-size",Marshal.GetLastWin32Error());
            attrs=Marshal.AllocHGlobal(checked((int)size.ToUInt64()));
            Check(InitializeProcThreadAttributeList(attrs,2,0,ref size),"init-attributes"); attributesReady=true;
            handles=Marshal.AllocHGlobal(IntPtr.Size*3);
            Marshal.WriteIntPtr(handles,0,input); Marshal.WriteIntPtr(handles,IntPtr.Size,outWrite); Marshal.WriteIntPtr(handles,IntPtr.Size*2,errWrite);
            Check(UpdateProcThreadAttribute(attrs,0,new IntPtr(0x20002),handles,new UIntPtr((uint)(IntPtr.Size*3)),IntPtr.Zero,IntPtr.Zero),"inherit-handles");
            jobs=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobs,job);
            // JOB_LIST 在 CreateProcess 内原子加入 Job，控制器突然死亡也没有未归属 suspended 窗口。
            Check(UpdateProcThreadAttribute(attrs,0,new IntPtr(0x2000D),jobs,new UIntPtr((uint)IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"assign-job-list");
            StartupInfoEx startup=new StartupInfoEx(); startup.Startup.Size=Marshal.SizeOf(typeof(StartupInfoEx));
            startup.Startup.Flags=0x100; startup.Startup.Input=input; startup.Startup.Output=outWrite; startup.Startup.Error=errWrite; startup.Attributes=attrs;
            if (Volatile.Read(ref StopRequested)!=0) throw new JobFailure("cancelled-before-start",0);
            Check(CreateProcessW(executable,new StringBuilder(commandLine),IntPtr.Zero,IntPtr.Zero,true,0x00080004|0x08000000,IntPtr.Zero,cwd,ref startup,out process),"create-process");
            assigned=true;
            if (Volatile.Read(ref StopRequested)!=0) throw new JobFailure("cancelled-before-resume",0);
            Check(ResumeThread(process.Thread)!=0xffffffff,"resume-thread"); Close(ref process.Thread);
            Close(ref input); Close(ref outWrite); Close(ref errWrite);
            Emit("{\"type\":\"ready\",\"pid\":"+process.Pid+"}");
            output=Drain(outRead,"stdout"); outRead=IntPtr.Zero;
            error=Drain(errRead,"stderr"); errRead=IntPtr.Zero;
            bool leaderExited=false, terminating=false; Stopwatch stopWatch=new Stopwatch();
            for (;;) {
                uint wait=WaitForSingleObject(process.Process,0);
                if (wait==0xffffffff) throw new JobFailure("wait-leader",Marshal.GetLastWin32Error());
                if (!leaderExited && wait==0) {
                    uint code; Check(GetExitCodeProcess(process.Process,out code),"leader-code");
                    Emit("{\"type\":\"leader-exited\",\"code\":"+code+"}"); leaderExited=true;
                }
                if (!terminating && (Volatile.Read(ref StopRequested)!=0 || (leaderExited && !keepDescendants))) {
                    Check(TerminateJobObject(job,1),"terminate-job"); terminating=true; stopWatch.Start();
                }
                Accounting accounting; Check(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero),"query-job");
                if (accounting.ActiveProcesses==0 && leaderExited) break;
                if (terminating && stopWatch.ElapsedMilliseconds>5000) throw new JobFailure("job-stop-timeout",0);
                Thread.Sleep(20);
            }
            if (!output.Join(2000) || !error.Join(2000)) throw new JobFailure("output-drain-timeout",0);
            if (OutputFailure!=null) throw new JobFailure("output-or-control",0);
            Close(ref process.Process); Close(ref job); completed=true;
            Emit("{\"type\":\"job-empty\"}"); return 0;
        } catch(JobFailure failure) {
            Emit("{\"type\":\"error\",\"stage\":\""+failure.Stage+"\",\"win32\":"+(uint)failure.Code+"}"); return 1;
        } catch(Exception) {
            Emit("{\"type\":\"error\",\"stage\":\"supervisor\",\"win32\":0}"); return 1;
        } finally {
            // 原子创建后进程属于 Job；精确 process HANDLE 仍作为创建异常时的清理兜底。
            if (!completed && process.Process!=IntPtr.Zero) {
                if (assigned && job!=IntPtr.Zero) TerminateJobObject(job,1);
                else TerminateProcess(process.Process,1);
                WaitForSingleObject(process.Process,5000);
            }
            Close(ref process.Thread); Close(ref process.Process); Close(ref job);
            Close(ref input); Close(ref outRead); Close(ref outWrite); Close(ref errRead); Close(ref errWrite);
            if (attributesReady) DeleteProcThreadAttributeList(attrs);
            if (attrs!=IntPtr.Zero) Marshal.FreeHGlobal(attrs);
            if (handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (jobs!=IntPtr.Zero) Marshal.FreeHGlobal(jobs);
        }
    }
}
'@
try {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line.Length -gt 1048576) { throw 'invalid request' }
    $request = ConvertFrom-Json -InputObject $line
    $keys = @($request.PSObject.Properties.Name | Sort-Object)
    if (($keys -join ',') -ne 'commandLine,cwd,executable,keepDescendants,schemaVersion' -or $request.schemaVersion -ne 1 -or $request.keepDescendants -isnot [bool]) { throw 'invalid request' }
    foreach ($key in @('executable','commandLine','cwd')) {
        if ($request.$key -isnot [string] -or [string]::IsNullOrEmpty($request.$key) -or $request.$key.IndexOf([char]0) -ge 0) { throw 'invalid request' }
    }
    if (-not [IO.Path]::IsPathRooted($request.executable) -or -not [IO.Path]::IsPathRooted($request.cwd) -or $request.commandLine.Length -gt 32766) { throw 'invalid request' }
    Add-Type -TypeDefinition $nativeSource -Language CSharp | Out-Null
    $result = [HarnessOwnedJob]::Run($request.executable, $request.commandLine, $request.cwd, $request.keepDescendants)
    exit $result
} catch {
    [Console]::Out.WriteLine('{"type":"error","stage":"bootstrap","win32":0}')
    exit 1
}
