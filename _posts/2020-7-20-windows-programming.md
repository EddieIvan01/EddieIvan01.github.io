---
layout: post
title: 《Windows核心编程》笔记
summary: DONE
featured-img: windows-programming
---

## TOC

该书大约属于入门级难度，零碎的知识点很多已经学习过，本文做个人笔记供查阅。仅记录个人认为有价值的内容，某些用不上或浅显的内容会略去

本文综合了不同版本的《Windows核心编程》（Windows2000 - Windows Vista）

## 错误处理

| 返回值类型 | 函数调用结果                                      |
| ---------- | ------------------------------------------------- |
| VOID       | 函数不可能失败。只有极少数Windows函数返回值为VOID |
| BOOL       | 函数失败返回0，检测是否不为FALSE                  |
| HANDLE     | 失败返回NULL或INVALID_HANDLE_VALUE                |
| PVOID      | 失败返回NULL，否则是数据块内存地址                |
| LONG/DWORD | 看文档                                            |

`GetLastError`函数获取TLS中的上一个错误代码

`VOID SetLastError(DWORD dwErrCode);`

```c++
void showErrorMsg() {
    setlocale(LC_ALL, "");
    LPTSTR lpBuf;
    if (!FormatMessage(FORMAT_MESSAGE_FROM_SYSTEM |
        FORMAT_MESSAGE_ALLOCATE_BUFFER,
        NULL, GetLastError(), MAKELANGID(LANG_NEUTRAL, SUBLANG_NEUTRAL),
        (LPWSTR)&lpBuf, 0, NULL))
        printf("ERROR\n");

    printf("%ls\n", lpBuf);
    // wprintf(L"%s\n", lpBuf);
    LocalFree(lpBuf);
}
```

buffer是LPTSTR，在UNICODE系统中（`#ifdef UNICODE`）是LPWSTR即`wchar_t`，输出时需要使用`%ls`或者用`wprintf`。同时需要`setlocale(LC_ALL, "")`设置为当前系统编码

`printf`输出multi bytes，即编码无关的字节序列，console根据当前code page来显示，例如输出UTF8的'中'：`printf("%c%c%c\n", 0xe4, 0xb8, 0xad);`

而对于宽字符`wchar_t`，程序内部保存为2字节的定长编码(UTF16)

```c
wchar_t s[] = L"中";
char* t = (char*) s;
printf("%d\n", *t);
printf("%d\n", *(t + 1));

// 45 78
```

```python
# UTF16开头的FFFE代表little endian
>>> '中'.encode('utf-16')
b'\xff\xfe-N'
>>> chr(45) + chr(78)
'-N'
>>> '\u4e2d'
'中'
```

调用`printf("%ls", s)`或`wprintf("%s", s)`输出宽字节时会先转换为multi byte再输出（调用`wcstombs`），默认情况下程序的locale为'C'，此时`wcstombs`遇到ANSI外会认为是非法宽字符。所以必须调用`setlocale`后才可以正确输出`wchar_t*`

```c
unsigned char s[4] = { 0 };
printf("%d\n", wcstombs(s, L"中", 4));
printf("%d %d %d %d\n", s[0], s[1], s[2], s[3]);

setlocale(LC_ALL, "");
printf("%d\n", wcstombs(s, L"中", 4));
printf("%d %d %d %d\n", s[0], s[1], s[2], s[3]);

/*
-1
0 0 0 0
2
214 208 0 0
*/
```

顺带一提Python，我们知道，Python2中`str`和C中`char*`一样是multi byte，Python3中`str`是`unicode`。Python3在输出`unicode`时也会先转换为multi byte再输出

```python
#----------Python2-------------#
# encoding: utf-8
import sys

sys.stdout.write('\xe4\xb8\xad')

"""
C:\>Python2 t.py
中
"""

#----------Python3-------------#
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.write('\xe4\xb8\xad')

"""
C:\>python3 t.py
ä¸­
C:\>python3 t.py|xxd
00000000: c3a4 c2b8 c2ad                           ......


>>> '\xe4\xb8\xad'.encode('utf8')
b'\xc3\xa4\xc2\xb8\xc2\xad'
"""
```

## 字符串

从Windows NT起，Windows所有版本都通过unicode构建。如果传递ANSI字符串给函数，内部需要进行转换。COM和.NET 默认也是使用unicde

所以为了更好的性能和兼容性，尽量使用unicode

用TEXT宏表示字面量

```c++
#ifdef UNICODE
#define __TEXT(quote) L##quote
#else
#define __TEXT(quote) quote
#endif

#define TEXT(quote) __TEXT(quote)
```

`_countof`宏计算字符数

```c++
#ifdef UNICODE
#define CreateProcess CreateProcessW
#else
#define CreateProcess CreateProcessA
#endif
```

安全字符串处理，一系列添加`_s`后缀的函数

```c++
errno_t _tcscpy_s(PTSTR dst, size_t len, PCTSTR src);
```

使用`CompareStringOrdinal`比较字符串（不考虑区域，只比较code point）

`IsTextUnicode`函数

## 内核对象

内核对象数据结构只能由内核访问。用户只能通过Windows提供的函数访问，调用创建内核对象的函数后会返回一个HANDLE，句柄进程相关。每个进程有一个进程句柄表，句柄表中保存索引和内核对象地址

内核对象有security descriptor来标识拥有者/(不)可访问对象或组。用于创建内核对象的函数基本都有一个`SECURITY_ATTRIBYTES`参数，而用户对象/GDI(Graphical Device Interface)对象没有

`CloseHandle`关闭内核对象

### 跨进程共享内核对象: 

#### 父子进程句柄继承

父进程创建内核对象时需要设置`SECURITY_ATTRIBUTE`可继承属性

```c++
SECURITY_ATTRIBUTE sa;
sa.nLength = sizeof(sa);
sa.lpSecurityDescriptor = NULL;
sa.bInheritHandle = TRUE;
```

创建子进程时设置`bInheritHandles`为TRUE，系统会在创建子进程后遍历父进程句柄表，将可继承的内核对象句柄拷贝到子进程句柄表，拷贝项的索引与父进程句柄表完全相同。同时系统还会将引用计数加一

#### 为对象命名

创建函数中有`pszName`参数的可命名。所有对象共享同一个命名空间（即使类型不同会返回`INVALID_HANDLE`），也即可跨进程共享（不需要是父子进程），且不受"是否可继承"约束

所以在创建命名内核对象后可以检查LastError是否是`ERROR_ALREADY_EXISTS`

调用`Open*`函数（`OpenMutex`）返回一个已存在的命名内核对象

#### 终端服务命名空间

`GetCurrentProcessId`, `ProcessIdToSessionId`

内核对象有全局命名空间，所有session可访问，还有session的局部命名空间，通过一下方式创建

```c++
// 保留关键字区分大小写
CreateEvent(NULL, FALSE, FALSE, TEXT("Global\\Name"));
// TEXT("Local\\Name")
// TEXT("Session\\<current session ID>\\Name")
```

#### 专有命名空间

创建边界描述符：`CreateBoundaryDescriptor / DeleteBoundaryDescriptor`

`OpenPrivateNamespace / ClosePrivateNamespace`

#### 复制对象句柄

`DuplicateHandle`函数，传递`hSourceProcessHandle`/`hTargetProcessHandle`和`hSourceHandle`和`phTargetHandle`

## 进程

进程由进程内核对象和地址空间构成。进程不执行任何东西，仅作为线程的容器

linker：`/SUBSYSTEM:CONSOLE`，`/SUBSYSTEM:WINDOWS`

| 应用程序类型                         | 进入点   | 嵌入可执行文件的启动函数 | 签名                                                         |
| ------------------------------------ | -------- | ------------------------ | ------------------------------------------------------------ |
| 需要ANSI字符和字符串的GUI应用程序    | WinMain  | WinMainCRTStartup        | int WINAPI WinMain(HINSTANCE hinstExe, HINSTANCE, PSTR pszCmdLine, int nCmdShow); |
| 需要Unicode字符和字符串的GUI应用程序 | wWinMain | wWinMainCRTStartup       | int WINAPI WinMain(HINSTANCE hinstExe, HINSTANCE, PWSTR pszCmdLine, int nCmdShow); |
| 需要ANSI字符和字符串的CUI应用程序    | main     | mainCRTStartup           | int __cdecl main(int argc, char* argv[], char* envp[]);      |
| 需要Unicode字符和字符串的CUI应用程序 | wmain    | wmainCRTStartup          | int __cdecl main(int argc, wchar_t* argv[], wchar_t* envp[]); |

`GetModuleHandle`查看调用进程地址空间中指定的可执行文件或DLL的基址

Command line：`GetCommandLine`/`CommandLineToArgv`

环境变量：`GetEnvironmentVariable/ExpandEnvironmentStrings/SetEnvironmentVariable`

通过设置进程的环境变量：

```
=C:=C:\Utility\Bin
=D:=D:\Program
```

可以在不同驱动器中设置当前目录

***

`CreateProcess`的pszApplication多数情况下传递NULL，pszCommandLine传递Commandline；传递pszApplication时必须指定扩展名，无绝对路径时只查找当前目录；Commandline可不指定扩展名，且搜索规则：

1. 主调进程EXE文件所在目录
2. 主调进程当前目录
3. Windows系统目录
4. Windows目录
5. PATH环境变量

ANSI版本的CreateProcessA可以直接传递pszCommandline参数为字面量，而UNICODE版本则必须是可写内存

> The Unicode version of this function, CreateProcessW, can modify the contents of this string. Therefore, this parameter cannot be a pointer to read-only memory (such as a const variable or a literal string). If this parameter is a constant string, the function may cause an access violation.

因为该函数需要临时修改pszCommandLine来解析，且在上世纪为了节约内存所以未拷贝新内存处理。而ANSI版本内部调用UNICODE版本，所以必须创建临时变量来转换参数

见：https://devblogs.microsoft.com/oldnewthing/20090601-00/?p=18083

***

### 终止进程

`ExitProcess`/`ExitThread`

`TerminateProcess(HANDLE hProcess, UINT fuExitCode)`异步函数，终止进程

### 子进程

Windows不维护进程间的父子关系

创建进程后立即关闭子进程和子进程主线程句柄，可以切断联系，使子进程独立运行

### 获取所有进程

Windows核心编程里的方法有点老

```c++
HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

PROCESSENTRY32 pe32 = PROCESSENTRY32{ sizeof pe32 };
if (!Process32First(hSnapshot, &pe32))
    goto CLEANUP;

while (Process32Next(hSnapshot, &pe32))
    wprintf(L"%s\n", pe32.szExeFile);
```

### 进程权限

#### 提权/降权启动进程

使用管理员用户登录除了会授予一个security token，还会创建一个仅标准用户权限的filtered token（UAC）。后续该用户所有启动的新进程都会和filtered token关联

#### 自动提升进程权限

`RT_MANIFEST`中的`<trustInfo>`字段level：`requireAdministrator / highestAvailable / asInvoker`

#### 手动提升进程权限

```c++
BOOL ShellExecuteEx(LPSHELLEXECUTEINFO pExecInfo);
```

Demo

```c++
SHELLEXECUTEINFO sei = { sizeof sei };
sei.lpVerb = TEXT("runas");
sei.lpFile = TEXT("cmd.exe");
sei.nShow = SW_SHOWNORMAL;
ShellExecuteEx(&sei);

// GetLastError() == ERROR_CANCELLED
// User refused to privilege elevation
```

#### 权限上下文

通过`GetTokenInformation`查询`TokenElevationType`，查询出结果为`TokenElevationTypeDefault / TokenElevationTypeFull / TokenElevationTypeLimited`

### 完整性级别

Intergrity Level

信任级别分低 - 中(默认) - 高（提升后权限启动） - 系统，当进程访问内核对象时，如果内核对象的完整性级别高于进程，系统将拒绝执行修改和删除操作，该比较在检查ACL前完成

管理员权限有`SeDebugPrivilege`，可以无视SYSTEM完整性级别进程的`SYSTEM_MANDATORY_LABEL_NO_READ_UP`等资源策略

除了进程与内核对象间的访问保护，还有进程与进程间。低完整性级别进程无法通过`PostMessage`向高完整性级别进程发送消息（或Windows hook拦截高完整性级别的消息）

## 作业

将作业看作进程的容器，类似沙盒

https://docs.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-job_object_net_rate_control_flags

```c++
HANDLE hJob = CreateJobObject(NULL, NULL);
JOBOBJECT_BASIC_LIMIT_INFORMATION jobli = { 0 };
jobli.PriorityClass = IDLE_PRIORITY_CLASS;
jobli.PerJobUserTimeLimit.QuadPart = 10 * 1000 * 1000;  // 100-ns intervals
jobli.LimitFlags = JOB_OBJECT_LIMIT_PRIORITY_CLASS | JOB_OBJECT_LIMIT_JOB_TIME;

SetInformationJobObject(hJob, JobObjectBasicLimitInformation, &jobli, sizeof jobli);

STARTUPINFO si = { sizeof si };
PROCESS_INFORMATION pi;
WCHAR lszCmd[] = L"cmd";
CreateProcess(NULL, lszCmd, NULL, NULL, FALSE, CREATE_SUSPENDED, NULL, NULL, &si, &pi);
AssignProcessToJobObject(hJob, pi.hProcess);
ResumeThread(pi.hThread);
CloseHandle(pi.hThread);

HANDLE h[2] = { pi.hProcess, hJob };
DWORD dw = WaitForMultipleObjects(2, h, FALSE, INFINITE);

switch (dw - WAIT_OBJECT_0) {
case 0:
    // process
    break;
case 1:
    // jobs limit
    break;
}
```

## 线程

线程由线程内核对象和线程堆栈构成

线程堆栈第一个压入参数，第二个是函数地址

`GetCurrentProcess/GetCurrentThread`返回伪句柄，对句柄表和引用计数无影响。使用`DuplicateHandle`转化为实句柄

线程上下文保存在CONTEXT结构里，CONTEXT保存在线程内核对象

### __beginthread OR CreateThread

`__beginthread / __endthread`是CRT中的函数，内部创建TLS并且能够做收尾工作（先为线程分配`_tiddata`再调用`_initptd`初始化，最终调用`CreateThread`）

`__beginthread`的缺点在于不能通过`WaitForSingleObject`同步

***

`CreateThread`创建的线程中可以调用需要TLS的函数如`malloc / strtok`，当这些函数发现`_tiddata`为空时会自己创建一个，然后与线程关联，但这些函数并不负责释放。而`CreateThread / ExitThread`并不知情，故会发生内存泄漏

## 线程调度，优先级，亲缘性

### 线程挂起与恢复

除了创建时传递`CREATE_SUSPEND`，还可以通过`SuspendThread / ResumeThread`，可多次挂起，会保存挂起计数

### Sleep & Switch

通过Sleep和`SwitchToThread`让出调度权，`SwitchToThread`允许执行低优先级线程，而Sleep会立即重新调度主调线程

### CONTEXT结构

CONTEXT保存了EIP, ESP, E_X, FLAGS等等寄存器值

可通过`SetThreadContext`来修改内核对象里的CONTEXT结构（先暂停线程，并在修改前再次初始化ContextFlags成员）

```c++
SuspendThread(hThread);

Context.ContextFlags = CONTEXT_CONTROL;
GetThreadContext(hThread, &Ctx);

Context.Eip = 0x10000;
Context.ContextFlags = CONTEXT_CONTROL;
SetThreadContext(hThread, &Ctx);

ResumeThread(hThread);
```

### 线程优先级

LEVEL 0 ~ 31，定义了PRIORITY_CLASS

## 用户模式线程同步

### 原子函数

几个原子函数：

`InterlockedExchangeAdd/InterlockedExchange/InterlockedExchangePointer`

CAS：

`InterlockedCompareExchange/InterlockedCompareExchangePointer`

***

### 高速缓存

多核高速缓存并行加载同一内存块读写时会导致其它核缓存失效重新加载，设计数据结构时可考虑缓存行大小并分离读写数据

***

### volatile

`volatile`关键字

`volatile BOOL g_bRunning = FALSE;`

其实我感觉只要传递指针给例程，每次判断前手动解引就可以达到`volatile`的效果了

***

### CRITICAL_SECTION

关键代码段（类似互斥区，像互斥锁一样操作）

只能做同一个进程内的线程同步

```c++
CRITICAL_SECTION g_cs;

InitializeCriticalSection(&g_cs);

EnterCriticalSection(&g_cs);
// 非阻塞
// TryEnterCriticalSection(&g_cs);
...;
LeaveCriticalSection(&g_cs);

DeleteCriticalSection(&g_cs);
```

`InitializeCriticalSectionAndSpinCount(PCRITICAL_SECTION pcs, DWORD dwSpinCount)`初始化的同时设置enter时自旋的最大次数，当超出最大次数后线程会转入内核态并等待（转入内核态的过程相比之下很慢，x86下需1000个CPU周期）

### Slim读写锁

```c++
VOID InitializeSRWLock(PSRWLOCK SRWLock);

// 写锁 排他
VOID AcquireSRWLockExclusive(PSRWLOCK SRWLock);
VOID ReleaseSRWLockExclusive(PSRWLOCK SRWLock);

// 读锁 共享
VOID AcquireSRWLockShared(PSRWLOCK SRWLock);
VOID ReleaseSRWLockShared(PSRWLOCK SRWLock);
```

读写锁不需要删除，系统自动清理

相比关键代码段，不存在TryEnter函数，不能多次获取锁

## 内核对象的线程同步

内核对象维护已触发/未触发状态，对线程/进程而言，创建时是未触发，结束运行变为已触发

通过等待函数可实现不同内核对象间的同步

`WaitForSingleObject/WaitForMultipleObjects`，对后者来说，如果没有设置`fWaitAll`，那么如果有一个对象变为已触发状态，返回值为`WAIT_OBJECT_0 + dwCount - 1`

***

### Event内核对象

```c++
HANDLE CreateEvent(
    PSECURITY_ATTRIBYTES psa,
    BOOL fManualReset,
    BOOL fInitialState,
    PCTSTR pszName,
)
    
SetEvent/ResetEvent
```

如果是自动重置的Event，每一次成功等待后会重置到未触发状态

手动重置的Event变为已触发后，所有等待它的线程都会变为可调度；而自动重置的Event变为已触发后，只有一个线程变为可调度

`PulseEvent`函数，将Event变为已触发并立即变为未触发

### 定时器内核对象

`CreateWaitableTimer/SetWaitableTimer`

### 信号量

`CreateSemaphore/ReleaseSemaphore`，原子操作，调用等待函数获取信号量

### 互斥对象

和前文的`CRITICAL_SECTION`类似。但`CRITICAL_SECTION`属于用户态对象，互斥对象是内核对象，所以互斥对象慢，但可以被不同进程的多个线程访问

`CreateMutex/ReleaseMux`

依然是通过等待函数获取

和`CRITICAL_SECTION`相比，互斥对象存在线程所有权概念，某线程acquire只能由该线程release，而`CRITICAL_SECTION`则无此限制

当acquire互斥对象的线程退出但未释放时，系统可监测到并释放，并返回`WAIT_ABANDONED`；而`CRITICAL_SECTION`不是内核对象所以无此特性

## 同步I/O和异步I/O

Windows IOCP，对应epoll/kqueue，Proactor模型，直接由驱动操作

### 打开设备

大多数通过`CreateFile`的抽象，pszName即表示设备类型，也表示该类设备的某实例

```c++
HANDLE CreateFile(
    PCTSTR pszName,
    
    // GENERIC_READ
    // GENERIC_WRITE
    DWORD dwDesiredAccess,
    
    // FILE_SHARE_READ
    // FILE_SHARE_WRITE
    // FILE_SHARE_DELETE
    DWORD dwShareMode,
    PSECURITY_ATTRIBUTES psa,
    
    // CREATE_NEW            如文件已存在会失败
    // CREATE_ALWAYS         如文件已存在则覆盖
    // OPEN_EXISTING 
    // OPEN_ALWAYS           如不存在会创建
    // TRUNCATE_EXISTING     seek到0
    // 当打开文件外的其它设备时，必须传递OPEN_EXISTING
    DWORD dwCreationDisposition,
    
    // FILE_FLAG_NO_BUFFERING
    // FILE_FLAG_WRITE_THROUGH    禁止写入操作的缓存
    // FILE_FLAG_DELETE_ON_CLOSE  关闭后删除，常与FILE_ATTRIBUTE_TEMPORARY一起使用
    // FILE_FLAG_OVERLAPPED  重叠I/O(异步)
    
    // FILE_ATTRIBUTE_HIDDEN
    // FILE_ATTRIBUTE_ENCRYPTED
    // FILE_ATTRIBUTE_READONLY
    // FILE_ATTRIBUTE_TEMPORARY
    // FILE_ATTRIBUTE_DIRECTORY
    // FILE_ATTRIBUTE_COMPRESSED
    DWORD dwFlagsAndAttributes,
    
    // 复制已打开文件的属性
    HANDLE hFileTemplate
);
```

`CreateFile`路径名不能超过`MAX_PATH`长度限制，但通过`CreateFileW`并为路径名加上`\\?\`前缀可突破限制，可达到32000个UNICODE字符，但这种方式需要绝对路径名，且每个独立部分依然有`MAX_PATH`限制

#### 设置文件尾

```c++
LARGE_INTEGER liDistanceToMove;
liDistanceToMove.QuadPart = 1024;
SetFilePointerEx(hFile, liDistanceToMove, NULL, FILE_BEGIN);
SetEndOfFile(hFile);
CloseHandle(hFile);
```

### 执行同步I/O

```c++
ReadFile / WriteFile / FlushFileBuffers
```

#### 取消同步I/O

在线程句柄有`THREAD_TERMINATE`权限时

```
BOOL CacelSynchronousIo(HANDLE hThread);
```

### 异步I/O

创建文件内核对象时传递`FILE_FLAG_OVERLAPPED`，之后调用`ReadFile / WriteFile`

#### OVERLAPPED结构

```c++
typedef struct _OVERLAPPED {
    ULONG_PTR Internal;
    ULONG_PTR InternalHigh;
    union {
        struct {
            // 因为异步无序操作，所以必须指定offset
            DWORD Offset;
            DWORD OffsetHigh;
        } DUMMYSTRUCTNAME;
        PVOID Pointer;
    } DUMMYUNIONNAME;

    HANDLE  hEvent;
} OVERLAPPED, *LPOVERLAPPED;
```

`Offset, OffsetHigh, hEvent`需在调用`Read / Write`前初始化，其它两个成员由驱动程序设置，I/O操作完成后可以检查

Internal为已处理I/O请求错误码，当发出异步I/O请求，驱动会立即更新Internal为`STATUS_PENDING`，当状态不为`STATUS_PENDING`意为处理结束（`HasOverlappedIoCompleted`）

InternalHigh在请求完成时保存已传输字节数

#### 取消队列中的I/O请求

+ `BOOL CacelIo(HANDLE hFile)`取消句柄所有I/O请求
+ 关闭设备句柄
+ 发出I/O请求的线程终止
+ `BOOL CacelIoEx(HANDLE hFile LPOVERLAPPED pOverlapped)`取消特定I/O请求，如overlapped为NULL，则取消所有

### 接收I/O请求完成通知

#### 触发设备内核对象

```c++
OVERLAPPED ol = { 0 };
ol.Offset = 345;

BOLL bReadDone = ReadFile(hFile, bBuffer, 100, NULL, &ol);
DWORD dwError = GetLastError();

if (!bReadDone && (dwError == ERROR_IO_PENDING)) {
    WaitForSingleObject(hFile, INFINITE);
}
```

#### 触发事件内核对象

（上一个方法不能同时对一个文件进行I/O操作）

I/O请求完成时，如果`OVERLAPPED`的`hEvent`成员不为NULL，驱动程序会调用SetEvent触发，只需使用等待函数等待Event对象

#### 可提醒I/O

系统创建线程时，会创建一个与线程关联的队列，称为异步过程调用（asynchronous procedure call, APC）队列。发出I/O请求时可在APC队列中添加一项（可通过`QueueUserAPC(PAPCFUNC pfnAPC, HANDLE hThread, ULONG_PTR dwData);`手动添加，该函数也可以进行进程间通信）

使用`ReadFileEx / WriteFileEx`，传入一个callback函数：`VOID CompletionRoutine(DWORD dwError, DWORD dwNumBytes, OVERLAPPED* po);`

线程需将自身设置为可提醒状态，通过以下六个函数（前五个都有bAlertable参数）：

+ SleepEx
+ WaitForSingleObjectEx
+ WaitForMultipleObjectsEx
+ SignalObjectAndWait
+ GetQueuedCompletionStatusEx
+ MsgWaitForMultipleObjectsEx

调用以上函数时系统会检查线程APC队列，如果有至少一项那么会立即取出让线程调用回调函数，当回调返回后会继续检查APC队列；如果APC队列中没有项，线程会被挂起等待；每次触发会逐项清空APC队列，然后返回（不挂起）

#### IOCP

```c++
HANDLE CreateIoCompletionPort(
    HANDLE hFile,
    HANDLE hExistingCompletionPort,
    ULONG_PTR CompletionKey,
    DWORD dwNumberOfConcurrentThreads
);

CreateIoCompletionPort(INVALID_HANDLE_VALUE, NULL, 0, 4);
```

dwNumberOfConcurrentThreads代表最大线程数量，传0为默认CPU核心数

***

将设备与IOCP关联

```c++
CreateIoCompletionPort(
    hDevice, hCompletionPort, dwCompletionKey, 0
);
```

***

获取IOCP通知，中间三个参数是出参

调用该函数的线程是FILO的唤醒顺序（如果I/O请求够慢，则一直是一个线程在工作）

```c++
BOOL GetQueuedCompletionStatus(
    HANDLE hCompletionPort,
    PDWORD pdwNumberOfBytesTransferred,
    PULONG_PTR pCompletionKey,
    OVERLAPPED** ppOverlapped,
    DWORD dwMilliseconds
);
```

也可一次性获取多个I/O请求的结果

```c++
BOOL GetQueuedCompletionStatusEx(
    HANDLE hCompletionPort,
    LPOVERLAPPED_ENTRY pCompletionPortEntries,
    ULONG ulCount,
    PULONG pulNumEntriesRemoved,
    DWORD dwMilliseconds,
    BOOL bAlertable
);

typedef struct _OVERLAPPED_ENTRY {
    ULONG_PTR lpCompletionKey;
    LPOVERLAPPED lpOverlapped;
    
    // Internal无含义
    ULONG_PTR Internal;
    DWORD dwNumberOfBytesTransferred;
} OVERLAPPED_ENTRY, *LPOVERLAPPED_ENTRY;
```

ulCount代表最多获取个数，pulNumEntriesRemoved为队列中实际被移除的数量

***

模拟已完成的I/O请求

```c++
BOOL PostQueuedCompletionStatus(
    HANDLE hCompletionPort,
    DWORD dwNumBytes,
    ULONG_PTR CompletionKey,
    OVERLAPPED* pOverlapped
);
```



## 线程池

略

## 纤程

纤程(Fiber)，类似stackfull的协程，非抢占式调度，在用户模式实现

调度API和gevent greenlet很像

## Windows内存结构

### 进程的虚拟地址空间

虚拟地址空间32-bit 4GB，用户空间2GB；64-bit 16EB，用户空间4TB

NULL pointer分配区：0x0000 ~ 0xFFFF

用户模式分区：0x10000 ~ 0x7FFEFFFF

内核模式分区：0x80000000 ~ 0xFFFFFFFF

### 地址空间中的区域

分配地址空间的操作叫保留（reserving），64KB对齐，且保证大小是页大小倍数（x86 4KB）

以页为单位提交物理存储器到保留区域

### 页的保护属性

`PAGE_*`（e.g. `PAGE_NOACCESS / PAGE_EXECUTE_READWRITE`）

### 内存对齐

成员起始地址：MIN(对齐系数, 类型长度)对齐

结构体：所占内存与最小成员长度对齐

## 虚拟内存

`GetSystemInfo / GlobalMemoryStatus`

`VirtualQuery / VirtualQueryEx`

Windows三种内存管理方法：

+ 虚拟内存
+ 内存映射文件，多进程共享数据
+ 内存堆栈，管理小对象

### 保留一个区域/提交物理存储器给保留区域

```c++
PVOID VirtualAlloc(
    PVOID pvAddress,
    SIZE_T dwSize,
    DWORD fdwAllocationType,
    DWORD fdwProtect,
);
```

第一个参数一般为NULL，当不为NULL，则必须位于进程的用户方式分区

第三个参数告诉系统是**保留一个区域**还是**提交物理存储器**，`MEM_RESERVE / MEM_COMMIT`

最后一个参数为保护属性

开发某些应用时为了最大效率利用物理内存，会先保留再提交物理存储器

### 释放虚拟内存

```c++
BOOL VirtualFree(
    LPVOID pvAddress,
    SIZE_T dwSize,
    DWORD fdwFreeType,
);
```

第二个参数必须为0，第三个参数必须为`MEM_RELEASE`

释放时必须一次性释放所有区域

### 改变保护属性

```c++
BOOL VirtualProtect(
    PVOID pvAddress,
    SIZE_T dwSize,
    DWORD flNewProtect,
    PDWORD pflOldProtect,
);
```

`VP/VA`在加载shellcode时经常用

### 地址窗口扩展

略

## 线程的堆栈

略

## 内存映射文件

将磁盘上文件的物理存储器提交给保留区域

+ 系统使用内存映射文件加载exe和DLL节省页文件空间，加快启动时间
+ 访问磁盘文件，免去I/O操作
+ 最有效的单机进程间数据共享

### 使用内存映射文件

首先创建文件内核对象

```c++
HANDLE CreateFile(
    PCSTR pszFileName,
    DWORD dwDesiredAccess,
    DWORD dwShareMode,
    PSECURITY_ATTRIBUTES psa,
    DWPRD dwCreationDisposition,
    DWORD dwFlagsAndAttributes,
    HANDLE hTemplateFile,
);
```

dwDesiredAccess为`0 / GENERIC_READ / GENERIC_WRITE`

dwShareMode指定如何共享该文件，为`0 / FILE_SHARE_READ / FILE_SHARE_WRITE`

dwCreationDisposition - `CREATE_NEW / CREATE_ALWAYS / OPEN_EXISTING / OPEN_ALWAYS / TRUNCATE_EXISTING`

dwFlagsAndAttributes - `FILE_ATTRIBUTE_*`

***

接着创建文件映射内核对象

```c++
HANDLE CreateFileMapping(
    HANDLE hFile,
    PSECURITY_ATTRIBUTES psa,
    DWORD fdwProtect,
    DWORD dwMaximumSizeHigh,
    DWORD dwMaximumSizeLow,
    PCTSTR pszName,
);
```

fdwProtect为`PAGE_READONLY / PAGE_READWRITE`

dwMaximumSizeHigh / dwMaximumSizeLow告诉系统该文件最大字节数，High为高位；如果只读取该文件而不改变大小，可以将两个参数传0

***

然后将文件数据映射到进程的地址空间

```c++
PVOID MapViewOfFile(
    HANDLE hFileMappingObject,
    DWORD dwDesiredAccess,
    DWORD dwFileOffsetHigh,
    DWORD dwFileOffsetLow,
    SIZE_T dwNumberOfBytesToMap
);
```

dwDesiredAccess为`FILE_MAP_WRITE / FILE_MAP_READ`

dwFileOffsetHigh / dwFileOffsetLow 文件映射偏移

dwNumberOfBytesToMap映射的大小，0代表到文件结尾

***

最后撤销映射

```c++
BOOL UnmapViewOfFile(PVOID pvBaseAddress);
```

文件映射会被缓存，调用刷新函数

```c++
BOOL FlushViewOfFile(
    PVOID pvAddress,
    SIZE_T dwNumberOfBytesToFlush
);
```

当写入网络路径文件时，不能保证将数据写入远程磁盘；需将`FILE_FLAG_WRITE_THROUGH`传递给`CreateFile`函数，只有当数据全部写入远程服务器，`FlushViewOfFile`才返回

### 使用内存映射文件在进程间共享数据

通过进程间共享文件映射内核对象：句柄继承，句柄命名，句柄复制

### 页文件支持的内存映射文件

调用`CreateFileMapping`时传递hFile为`INVALID_HANDLE_VALUE`

## 堆

Windows堆的优点是，可以不考虑分配粒度和页面边界之类的问题。堆的缺点是，分配和释放内存块的速度比其他机制要慢，并且无法直接控制物理存储器的提交和回收

`GetProcessHeap`

线程访问进程默认堆是串行的

***

```c++
HANDLE HeapCreate(
    DWORD fdwOptions,
    SIZE_T dwInitialSize,
    SIZE_T dwMaximumSize
);
```

fdwOptions为`0 / HEAP_NO_SERIALIZE(可并行访问) / HEAP_GENERATE_EXCEPTIONS`

dwMaximumSize为0为可扩展

***

```c++
PVOID HeapAlloc(
    HANDLE hHeap,
    DWORD fdwFlags,
    SIZE_T dwBytes
);
```

fdwFlags仅支持为`HEAP_ZERO_MEMORY / HEAP_GENERATE_EXCEPTIONS / HEAP_NO_SERIALIZE`

***

```c++
PVOID HeapReAlloc(
    HANDLE hHeap,
    DWORD fdwFlags,
    PVOID pvMem,
    SIZE_T dwBytes
);
```

fdwFlags多了一个可选`HEAP_REALLOC_IN_PLACE_ONLY`

***

```c++
SIZE_T HeapSize(
    HANDLE hHeap,
    DWORD fdwFlags,
    LPCVOID pvMem
);

BOOL HeapFree(
    HANDLE hHead,
    DWORD fdwFlags,
    PVOID pvMem
);

BOOL HeapDestroy(HANDLE hHead);
```

***

`HeapLock / HeapUnlock`调用线程会获取特定堆栈的锁

### HeapAlloc和VirtualAlloc的区别

https://stackoverflow.com/questions/872072/whats-the-differences-between-virtualalloc-and-heapalloc

`VirtualAlloc`分配大内存，可共享内存，分配的大内存不必一次全部使用

`HeapAlloc`更常规，VS中的malloc和new最终都调用它

## DLL

### DLL基础

进程导入段列出需要的DLL名（无路径），输入符号列表

搜索顺序：

1. 可执行文件目录
2. 当前目录
3. Windows系统目录
4. Windows目录
5. PATH环境变量

DLL可导出变量, 函数和Cpp类

***

```c++
#define MYLIBAPI extern "C" __declspec(dllexport)

MYLIBAPI int Add(int a, int b);
```

`__declspec(dllexport)`修饰为从DLL导出

Cpp编译器可能会改变函数和变量的名字，导致C可执行文件在链接时无法引用符号（exterm "C" 不改变名称）

### 显/隐式加载

```c++
HINSTANCE LoadLibrary(PCTSTR pszDllPathName);

HINSTANCE LoadLibraryEx(
    PCTSTR pszDllPathName,
    HANDLE hFile,
    DWORD dwFlags
);

VOID FreeLibrary(HINSTANCE hinstDll);
```

fFile为保留参数

dwFlags为：

+ `DONT_RESOLVE_DLL_REFERENCES`：不调用DllMain, 不自动加载DLL导入的其它DLL
+ `LOAD_LIBRARY_AS_DATAFILE`：当DLL只包含资源不包含函数时, 或通过LoadLibrary加载exe文件时（exe中无DllMain）
+ `LOAD_WITH_ALTERED_SEARCH_PATH`：改变查找顺序为：
  + pszDllPathName中设定的目录
  + 进程当前目录
  + Windows系统目录
  + Windows目录
  + PATH环境变量

***

```c++
FARPROC GetProcAddress(
    HINSTANCE hinstDll,
    PCSTR pszSymbolName
);
```

输出节中符号名都是ANSI字符串

### DLL进入点函数

```c++
BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD dwReason, LPVOID lpReserved) {
    switch (dwReason) {
        // 首次映射DLL到进程地址空间时
        case DLL_PROCESS_ATTACH: break;
            
        // 创建新线程时
        // BOOL DisableThreadLibraryCalls(HINSTANCE hinstDll);
        case DLL_THREAD_ATTACH: break;
        case DLL_THREAD_DETACH: break;
        case DLL_PROCESS_DETACH: break;
    }
}
```

在DllMain中避免调用其它DLL导入的函数（同一地址空间其它DLL可能未执行DllMain初始化）

DllMain是被顺序调用的，例如下面的例子会死锁

```c++
switch (dwReason) {
    case DLL_PROCESS_ATTACH:
        hThread = CreateThread(...);
        WaitForSingleObject(hThread, INFINITE);
        CloseHandle(hThread);
        break;
}
```

### 系统已知DLL

REG项`HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDlls`

如果调用`LoadLibrary`时传递包含`.dll`扩展名的名称，会删除`.dll`扩展名然后在注册表查询KnownDLL，如未找到再通过通常的搜索规则

在做DLL劫持时，KnownDll无法从当前目录加载，只能从SYSTEM32目录

### 可执行文件实例间的数据共享

加载DLL时，将同一片物理内存映射到不同进程的虚拟内存，但当进程尝试修改DLL中数据时，系统会拦截此类操作并做copy-on-write

所以后文中hook远程进程时需要先DLL到远程进程地址空间再修改API入口点机器码

## 线程本地存储

### 动态TLS

进程TLS标志：长度为`TLS_MINIMUM_AVAILABLE`的位数组，每个标志可设置为FREE或INUSE

```c++
DWORD TlsAlloc();
```

创建一个线程时，会分配一个`TLS_MINIMUM_AVAILABLE` PVOID数组，并将它与线程联系起来。线程调用TlsAlloc后获得一个索引，目前进程中运行的每个线程中均为其保留了该索引（包括未来创建的线程）

```c++
BOOL TlsSetValue(
    DWORD dwTlsIndex,
    PVOID pvTlsValue
);

PVOID TlsGetValue(DWORD dwTlsIndex);

BOOL TlsFree(DWORD dwTlsIndex);
```

### 静态TLS

告诉编译器，将变量放入可执行文件或DLL自己的节（`.tls`节）中，必须为静态变量或全局变量

```c++
__declspec(thread) DWORD gt_dwTimeStamp = 0;
```

静态TLS对性能和体积有影响

## DLL注入

### 通过注册表注入DLL

```
HKEY_LOCAL_MACHINE\Software\Microsoft\Windows NT\CurrentVersion\Windows\AppInit_DLLs
```

空格或逗号隔开的一组值，修改后需重启

当User32.dll被映射时，会检索该表项的值并调用`LoadLibrary`

只影响使用User32.dll的进程（GUI），大多数CUI不使用它

### Windows Message Hook

```c++
HHOOK hHook = SetWindowsHookEx(
    int idHook,
    HOOKPROC lpfn,
    HINSTANCE hmod,
    DWORD dwThreadId
);
```

idHook为hook的event类型：`WH_*`（e.g. `WH_GETMESSAGE`）

lpfn为callback函数

> A pointer to the hook procedure. If the dwThreadId parameter is zero or specifies the identifier of a thread created by a different process, the lpfn parameter must point to a hook procedure in a DLL. Otherwise, lpfn can point to a hook procedure in the code associated with the current process.

hmod为lpfn所在的DLL

> A handle to the DLL containing the hook procedure pointed to by the lpfn parameter. The hMod parameter must be set to NULL if the dwThreadId parameter specifies a thread created by the current process and if the hook procedure is within the code associated with the current process.

dwThreadId如果为0，代表hook系统中所有GUI线程。当hook的scope为global only时，则必须设置为0

某些global hook的callback是由安装hook的线程调用的，此时dwThreadId为0，但hmod也可为NULL或`GetModuleHandle(NULL)`（当前PE文件）

***

```c++
BOOL UnhookWindowsHookEx(HHOOK hhook);
```

### 远程线程注入DLL

这是最基础的方法

目标是通过`CreateRemoteThread`在远程线程中执行：

```c++
HANDLE hThread = CreateRemoteThread(
    hProcessRemote,
    NULL,
    0,
    LoadLibraryA,
    "C:\\evil.dll",
    0,
    NULL
);
```

两个问题：

1. 需要获取`LoadLibrary`在远程进程中的地址，因为系统会将kernel32.dll映射到进程的同一个地址（当然x86和x64中肯定不同，所以injector, target和dll都得是相同位数），所以没什么问题，但其它自定义函数需要把机器码写入远程空间

   另一个是书中提到的，但我测试并没有影响。导入段中有thunk，当代码调用`LoadLibraryA`时，链接器会生成一个对thunk（转换函数）的调用，接着thunk会跳转到实际函数，如果将thunk的地址传递给远程线程的起始地址容易造成访问违规所以需要通过`GetProcAddress`获取准确内存地址

2. 线程参数的指针需要在远程线程地址空间内，通过`VirtualAllocEx`和`WriteProcessMemory`解决

## API Hook

### Message hook

上文中的SetWindowsHook(Ex)

键盘记录：https://github.com/EddieIvan01/win32api-practice/tree/master/keylogger

注册 `WH_KEYBOARD_LL` hook，hook该低层次事件时不会注入到其它进程，callback都是由安装hook的线程处理

> This hook is called in the context of the thread that installed it. The call is made by sending a message to the thread that installed the hook. Therefore, the thread that installed the hook must have a message loop.
> 
> However, the WH_KEYBOARD_LL hook is not injected into another process. Instead, the context switches back to the process that installed the hook and it is called in its original context. Then the context switches back to the application that generated the event.

### Inline hook

原理是通过修改API入口地址的机器码，修改为JMP ADDR完成Hook。当然，需要考虑到DEP，堆栈平衡等细节

Hook远程进程时最简单的方法是DLL注入，直接写ShellCode也是可以的

### IAT hook

和Inline hook类似，修改进程的IAT中的thunk，JMP到自定义地址

### Hotfix hook

某些API开头为`MOV EDI, EDI`和五个NOP，通过修改这7-byte的无效指令做JMP

### SSDT hook

SSDT（System Service Descriptor Table），属于内核层hook，这个我没有试验

### Hook library

https://github.com/TsudaKageyu/minhook

https://github.com/Microsoft/Detours

## 异常处理

### SEH(structured exception hadnling)

```c++
__try {
    // 跳转到try结束
    __leave;
}
// EXCEPTION_EXECUTE_HANDLER
// EXCEPTION_EXECUTE_SEARCH
// EXCEPTION_CONTINUE_EXECUTION
__except ((GetExceptionCode() == EXCEPTION_INT_DIVIDE_BY_ZERO) ? EXCEPTION_EXECUTE_HANDLER : EXCEPTION_CONTINUE_SEARCH) {
    
}


__try {
    
}
__finally {
    
}
```

try中执行return/goto/longjmp也会执行finally

try后不能同时有except和finally，但可以嵌套

### 应用程序重启

```c++
HRESULT RegisterApplicationRestart(
    PCWSTR pwzCommandline,
    
    // RESTART_NO_CRASH
    // RESTART_NO_HANG
    // RESTART_NO_PATCH
    // RESTART_NO_REBOOT
    DWORD dwFlags
);
```

## 窗口

### 发送消息到线程消息队列

发送到线程消息队列，立即返回，非可靠

```c++
BOOL PostMessage(
    HWND hwnd,
    UINT uMsg,
    WPARAM wParam,
    LPARAM lParam
);


BOOL PostThreadMessage(
    DWORD dwThreadId,
    UINT uMsg,
    WPARAM wParam,
    LPARAM lParam
);

DWORD GetWindowThreadProcessId(HWND hwnd, PDWORD pdwProcessId);
```

### 向窗口发送消息

```c++
LRESULT SendMessage(
    HWND hwnd,
    UINT uMsg,
    WPARAM wParam,
    LPARAM lParam
);

SendMessageTimeout
SendMessageCallback // 异步
SendNotifyMessage   // 类似PostMessage，但消息优先级更高
    
    
BOOL ReplyMessage(LRESULT lResult);
```

消息被处理后才返回

***

线程调用`GetMessage / WaitMessage`如无可读消息会挂起

### 通过消息发送数据

```c++
SendMessage(FindWindow(NULL, "Calculator"), WM_SETTEXT, 0, "TEST");
```

上面代码不会发生访问违规，当发送WM_SETTEXT时，系统会将参数从调用进程地址空间拷贝到内存映像文件中，该映像文件可在进程间共享

```c++
char szBuf[200];
SendMessage(FindWindow(NULL, "Calculator"), WM_GETTEXT, sizeof szBuf, szBuf);
```

请求用窗口标题填充缓冲区

### 局部输入状态

暂时用不上

```c++
HWND SetActiveWindow(HWND hwnd);
HWND GetActiveWindow();

BringWindowToTop / SetWindowPos
    
// 将光标限制在一个矩形区域
BOOL ClipCursor(CONST RECT *prc);
```

