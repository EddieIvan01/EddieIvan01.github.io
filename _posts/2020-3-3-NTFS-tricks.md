---
layout: post
title: Pentester的NTFS技巧搜集
featured-img: ntfs
summary: https://sec-consult.com/en/blog/2018/06/pentesters-windows-ntfs-tricks-collection/
---

原文链接：`https://sec-consult.com/en/blog/2018/06/pentesters-windows-ntfs-tricks-collection/`

NTFS Streams document：`https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/c54dec26-1551-4d3a-a0ea-4fa40f848eb3`

## Trick 1: 无需权限创建目录 (CVE-2018-1036/NTFS EoP)

在Windows上，你可以为文件夹分配“特殊权限”，例如允许用户在文件夹里创建文件，但不允许创建文件夹

举个栗子，有这样一个目录`C:\Windows\Tasks\`，用户可以在里面创建文件，但是不能在里面创建目录：

![](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-1.png)

管理员或者程序可能配置这样的权限，并认为用户真的不能在目录里创建目录

一旦用户可以创建文件，就可以绕过这个访问控制。在文件名末尾加上`::$INDEX_ALLOCATION`就可以创建目录而不是文件，而且Windows目前对此没有检查

![pentesting-ntfs-2](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-2.png)

像上面展示的一样，目录成功创建，而且用户可以随意在这个目录里创建文件或目录（如果管理员/程序认为这样做无权限的话，可能导致权限提升）

如果应用只允许删除文件，`::$INDEX_ALLOCATION`的trick也可以用来删除目录                                          |

## Trick 2: 通过NTFS数据流来绕过路径限制

你可能好奇为什么上面的技术能实现。基本上NTFS卷上的文件是存储在这样的form里的：`<filename>:<stream-name>:<stream-type>`

如果我们创建一个叫test.txt的文件，它在内部会被存储为`test.txt::$DATA`，因为流名称是空值，且`$DATA`是默认类型。第一个trick滥用了以下事实：即可以将类型更改为与目录类型相对应的`INDEX_ALLOCATION`，因此创建了目录

除此之外，也可以将数据存储在不同的流中（称作备用数据流，Alternate Data Stream，ADS）。举个栗子，当我们往`test.txt`里写，实际上我们是写入`test.txt::$DATA`（流名称为空）。但是，我们也可以写入`test.txt:foo`或`test.txt:foo:$DATA`（两种写法没有区别，因为`$DATA`是默认类型）

有的流名称会被用来存储文件来源。如果你从网上下载一个文件（或通过email收取），Windows会通过流名称静默添加域标识符（接着如果你要执行它，就会显示一个警告框）。举个栗子，如果我们下`putty.exe`，Windows会创建`putty.exe:Zone.Identifier:$DATA`。可以通过`dir /r`来使这些流名称可见：

![](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-3.png)

像你看到的那样，域标识符不能通过type命令读取，如果用notepad读文件，略去`$DATA`类型也很重要。重要的一点是我们可以把数据存储在ADS里（包括应用！），举个栗子，putty可以被copy到一个ADS，然后通过wmic调用执行（直接执行是不行的）：

```
type putty.exe > test:putty.exe

wmic process call create C:\Users\U\Desktop\test:putty.exe
```

![](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-4.png)

note：这篇文章写于2018-03-01且被报告给微软。同时Windows Defender已经更新，可以检测WMIC进程调用（目前基本所有杀软都会拦截）

你可能会问为什么有的人要这样做？首先，ADS可以被用来隐藏数据（不带`/r`的`dir`指令不会显示它们；`explorer.exe`也不会显示它们；稍后可以看到我们甚至可以在`dir /r`中隐藏...）。除此之外，ADS还有另一个很棒的属性——我们可以向一个目录添加ADS。想这样做的话我们必须有"创建目录"权限（而且目录名不能是数字）。一个重要的事实是一个目录上的ADS看起来像一个来自父目录的文件

举个栗子，在Windows上一个普通用户不能在`C:\Windows\`里创建文件（只有管理员可以向这个目录写）。所以很有可能一个应用认为`C:\Windows\`里的文件都是可以信任的，因为只有管理员可以创建。但是，普通用户可以在`C:\Windows\Tracing`里创建文件和目录——因此普通用户可以在这个目录上创建一个ADS

假设用户把文件写入`C:\Windows\Tracing:test.dll`。如果这个路径现在被传递给一个计算base dir的Windows API，这个API会从路径的末尾开始，直到读到第一个`\`结束。然后`\`左边的所有东西都会被当做base dir返回。对于`C:\Windows\Tracing:test.dll`则会返回`C:\Windows\`作为base dir，但是像已经提到的一样，普通用户不允许在这个目录创建文件，但是通过使用这个trick我们创建了一个文件，它看起来就是存储在`C:\Windows`！

这是一些不同的计算base dir的Windows函数的输出（我们看到它一直是`C:\Windows`）

![pentesting-ntfs-5](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-5.png)

可以通过以下命令通过Windows内置的`control.exe`启动上述存储的dll：`control.exe C:\Windows\tracing:foobar.dll`

这个行为可以用来bypass一些程序的白名单解决方案，在程序员认为足以检查文件是否存储在特性base dir中并且假设因为ACL设置的缘故只有管理员可以写入此文件夹的各种情况下，也可以绕过安全检查

举个栗子，假设程序允许上传数据，且上传的数据被存储在`applicationFolder\uploadedData\`。此外，该程序允许从`applicationFolder\`中启动脚本/程序，但不能从`applicationFolder\uploadedData\`中启动（使用黑名单）。如果用户上传一个叫`:foo.ps1`的文件，系统会创建一个像`applicationFolder\uploadedData:foo.ps1`这样的ADS，这样文件看起来就被存储到`applicationFolder\`中因此可以bypass安全检测

另一个有趣的事实是ADS的名字可以包含在文件名中被禁止的符号，像`"`或`*`（你需要用原生Windows API来创建这些文件；`cmd.exe`过滤了这些字符）（我试了下`* < >`是可以的，`" /`不可以）

![pentesting-ntfs-6](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-6.png)

它本身会导致多种问题（例如：如果文件名以`"`结尾，并且路径由`"`括起来）。但是，另一个有趣的攻击向量可能是XSS（或命令注入）。假设一个网站在IIS上运行并且允许上传文件，并且该网站容易出现CSRF。上传文件后，将显示一个成功对话框，其中包含文件名，如果没有过滤文件名，则可能会导致XSS。但是，文件名不允许包含注入`<`或`>`的符号（因此无法执行JS代码）。但是，ADS中可以包含这些符号，所以攻击者可以尝试使用ADS发送文件名的上传请求

![pentesting-ntfs-7](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-7.png)

## Trick 3: 使用"..."目录创建不会被找到的文件

每个文件夹默认包含两个特殊条目，即`.`和`..`。在Windows上，无法创建名称中仅包含`.`的文件/文件夹，这大概可以阻止将解析器与点混淆的攻击

![pentesting-ntfs-8](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-8.png)

上面的截图展示了不可能创建一个`...`或`....`文件夹。但是，可以用`::$INDEX_ALLOCATION`来绕过这个限制：

![pentesting-ntfs-9](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-9.png)

使用上面提到的trick，`...`目录被创建了，但是，这样的目录同样可以通过传递两次名字来绕过，像展示的那样：`....`（`mkdir "....\....\"`创建了目录`....`，但其中也包含了一个`....`。如果只传递`mkdir "....\xyz\"`的话则不能成功）

使用第二个trick，你也可以进入这些目录，在这些目录里存储或执行文件：

![pentesting-ntfs-10](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-10.png)

像你看到的这样，你不能通过`cd ...`或`cd ...\`或`cd ...\...`进入这些目录，你需要用这种格式`cd ...\...\`。进入后你可以在里面创建文件（如果你在这个目录里输入`cd .`，你会退回到最外层目录，原因是路径混乱）

此外，你也不可能通过GUI（explorer.exe）打开这些目录。我遇到了两种不同的情况。在某些情况下，双击这样的文件夹没有任何影响（你停留在当前目录中，并且路径保持不变），在其他情况下，你保留在该文件夹中，但是资源管理器中的路径会更改（我试着第一种情况下会有卡顿现象）

你可以随时进入这些文件夹，在GUI里你永远不会看见这些文件。也不可能通过传递`C:\test\...\...\`来打开文件夹

（如果你尝试通过GUI来删除文件，explorer.exe会崩溃；您将看到一个对话框，Windows在计算文件夹中的文件，而其中文件数量会一直增加。如果不在工作系统上尝试，可能会更好）

在GUI中在这个文件夹下搜索文件也不行，举个栗子，如果你用GUI搜索123.txt会永远挂起/搜索，永远也不会真正的找到文件

请注意，使用cmd搜索是没问题的：

```
dir /s *12*
where /r C:\test\ *123*
type C:\test\...\123.txt
```

![pentesting-ntfs-11](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-11.png)

但是，大多数人目前在使用powershel，使用powershell找不到文件，因为它会无限循环

```
Get-ChildItem -Path C:\test -Recurse
```

（输入被截断了，因为这个命令会永远交替打印这两个目录）

搜索123.txt（使用`Get-ChildItem -Path C:\test -Filter 123.txt -Recurse -ErrorAction SilentlyContinue -FOrce`）永远不会找到文件（也永远不会终止）

我也使用不同的杀毒软件测试，他们看起来能正确工作（我把病毒样本放在这个目录里然后测试杀毒软件能不能找到它）。但其中一些仍然被路径混淆，e.g.：当要在`C:\test\...\`中搜索病毒时，他们却在搜索`C:\test\`。同源，使用Python的`os.walk()`也可以正常工作

```
>>> import os
>>> for i, j, k in os.walk('.'):
...     print(i, j, k)
. ['...'] []
.\... ['...'] []
.\...\... [] ['123']
```

请注意，创建指向它自己父文件夹的目录连接时，则不会在cmd或powershell中导致无限循环

## Trick 4: 隐藏目录连接的target

对于攻击者寻找安全漏洞来说，目录连接是一个非常有用的NTFS特性。你可以使用它（普通用户权限）创建一个指向目标文件夹的符号连接

```
mklink /J test C:\windows\system32\

mklink /H test C:\windows\win.ini  // 实际是个硬连接，而且不能跨盘符
```

以我看来，解释目录连接的最佳安全漏洞是AVGater，攻击者将文件放在目录`x`里。接着他将该文件标记为病毒，已安装的杀毒软件会将文件移入隔离区。然后，攻击者删除文件夹`x`并将其替换为名叫`x`的目录连接，该连接指向`C:\Windows\System32`。此时攻击者单击"恢复"按钮，则杀毒软件会将文件复制到`x`文件夹，即移入具有SYSTEM权限的`system32`（直接导致EoP）

如果目标应用包含条件竞争漏洞，则经常会滥用目录连接

可使用`mklink /J`创建目录连接。可以将它与`::$INDEX_ALLOCATION`技巧合用，以创建名称为`...`的目录连接:

![pentesting-ntfs-12](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-12.png)

现在目录已经被混淆了，你可以用上面提到的`cd ...\...\`技巧进入连接（system32目录），但是`.`会指向当前的`C:\test8`目录

例如，在`C:\test8\`中执行`echo echo hello > hello.bat`，接着`cd ...\...\`进入system32目录，此时执行`.\hello.bat`，由于路径混乱，实际会执行`C:\test8\hello.bat`而不是`C:\windows\system32\hello.bat`。我不确定这对安全性是否会有直接影响，因为您仍然可以在任何文件夹中启动文件。但是，它可以用来绕过应用列入白名单的脚本文件的策略

## Trick 5: 隐藏ADS

像已经讨论过的那样，通过`dir /r`来打印ADS是可行的。

在旧版Windows系统上，可以用过使用保留字作为base name来隐藏ADS（e.g. CON, NUL, COM1, COM2, LPT1, ...）但是，在新版Windows 10上它好像被修复了，但是`...`仍然可以用

```
echo 123 > ...:abc.txt
echo 123 > NUL:abc.txt    // 已修复，不会创建文件
                          // 实际上，新版Windows 10的NTFS不允许创建NUL等文件名

dir /r     // 不会显示

notepad ...:abc.txt
```

![pentesting-ntfs-13](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-13.png)

`...`上的ADS被成功创建，但是没有被列出来

如果你在`C:\test8\`里使用`echo 123 > C:\:abc.txt`在C:驱动器上创建ADS，它会被`dir /r`打印出来，并附着在`C:\test8`的`..`上

还有第二个trick，在Windows上你可以在文件名末尾添加`.<spaces>.`，Windows会自动删除它。例如`echo 123 > "abc.  ."`

但是，我们可以创建一个带ADS的这样的文件！这个有趣的属性会使工具不能打开文件，因为`xyz. .`这样的路径会自动被修改为`xyz`

![pentesting-ntfs-14](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-14.png)

实际上，工具不会列出创建在上面的ADS。而且工具也删不掉这样的文件

这样的文件也可以这样创建：`echo test > "test. .::$DATA"`

当然我们也可以创建`. .`的目录：

![pentesting-ntfs-15](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-15.png)

这个目录无法通过GUI进入，即使用已经提到过的技术`cd . .\. .\`也不行，但是`cd ". .::$INDEX_ALLOCATION"`可以

我们也可以创建这样的：

```
echo 123 > ".. ::INDEX_ALLOCATION"
echo 123 > ". ::INDEX_ALLOCATION"

echo 123 > "a::$DATA"
echo 123 > "a ::$DATA"
```

名称为`..<space>`的目录可以用已经讨论过的技术进入：

![pentesting-ntfs-16](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-16.png)

实际上，如果你在GUI点击两次（双击4次）的话，是可以进这个目录的（`..<space>`），目录内的内容也会被正确显示。但是，里面的文件不能被打开，因为路径错误（explorer.exe会使用`C:\test22\.. \.. \123.txt`而不是`C:\test22\.. \123.txt`）。用Powershell搜索这样的目录会陷入死循环

你可以在目录`abc`上创建ADS，接着你可以重命名为包含数字的名称（e.g. "1"）然后你仍然可以看见ADS，但是你打不开它（名称中包含数字的ADS是无效的）

实际上我发现使用notepad打开ADS的话，base name和stream name中必须有一个得是txt后缀，用其它（如Python）打开的话则无此限制

## 文件系统tricks VS 杀毒软件 / 取证软件

针对反病毒软件，我对上述trick做了一个快速验证，看它们是否可以捕获滥用这些技巧的恶意软件。最值得注意的发现是在以`..`结尾的目录中的以`.<space>`结尾的文件。举个栗子，我将eicar测试病毒存储在一个文件夹中，并使用一下命令复制：

```
copy eicar.com > "123. .::$DATA"
copy eicar.com > tester
echo 123 > "foo. .::$INDEX_ALLOCATION"
cd "foo. .::$INDEX_ALLOCATION"
copy ..\eicar.com .
copy ..\eicar.com .\eicar
```

之后，我重新启用了防病毒软件并扫描了该文件夹。所有防病毒软件仅在此目录中标识了`eicar.com`和`tester`，但未标识`123. .`或`foo. .`中的eicar病毒。但是，进入此文件夹并启动该文件后，防病毒软件会找到他们（因为内容已经从文件系统被加载到内存）。Windows Defender的删除操作无法删除文件，因此没有影响，但是，例如Emsisoft的删除操作可以删除文件夹中的测试病毒。Emsisoft刚刚删除了`foo. .`文件夹中的`eicat.com`文件，而`eicar`文件没有被删除且可以正常读取内容（Emsisoft回复我们，仅扫描映射为可执行文件的文件，某些特定的文件扩展名（如.com）除外。这个行为可以通过在文件向导设置里更改`Through`来使得文件读取时也扫描；另一方面，Windows Defender也组织读取`eicar`文本）

懒得翻译了自己看吧：

I also conducted a short test against Autopsy 4.6.0 (a free forensic  software) by loading “logical files” into the tool (from the running  system; not a disk image). The “…” folder can be entered, however, the  “foo. .” folder can’t. Moreover, I created a file named “valid” with the content “valid” and a file called “valid. .” with the content “secret”. Autopsy shows for both files the content “valid” (and never the  “secret” content). In addition to that, the “.. ” folder (with a space  at the end) is intepreted as “..” and therefore goes one directory up at double click. This only applies to the “logical files” mode, in disk  image (raw) mode, everything is displayed correctly (in the live mode  Autopsy is using the Windows API to access the data and therefore  problems occur).

## Trick 6: 隐藏进程的二进制文件

像上面已经讨论的：Windows会自动移除文件末尾的`. .`。如果我们启动一个名字像`file1. .`的进程呢？有可能会触发针对`file1`的check（例如来自杀毒软件的check）

![pentesting-ntfs-17](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-17.png)

我们创建三个文件：

+ `file`：来自微软签名的taskmgr
+ `file. .`：恶意软件，应当被隐蔽执行
+ `filex x`有WinSCP的签名，这个文件过一会会变得非常重要

我们现在需要一个方法来从`file. .`二进制文件启动进程，这不是一件容易的事，因为所有的Windows API都会自动移除文件名的`. .`，然后启动`file`（taskmgr）。为了处理这个问题我们使用下面的代码

![pentesting-ntfs-18](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-18.png)

上面的代码只调用了`CreateProcessA`来从`filex x`（WinSCP）创建进程。如果我们编译执行，WinSCP会被启动。但是，我们不是正常的启动它。我们在一个debugger里启动它（e.g. WinDbg）。现在我们设置一个断点：当执行到`bp ntdll!NtCreateUserProcess`系统调用时，在这个断点处打印出当前的栈数据，栈上的第十二个指针很重要，地址上的第四个值就是我们的文件名

![pentesting-ntfs-19](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-19.png)

绿框中的文件名被标准化了（以`\??\C:\...`开头）。实际上这个标准化也会移除文件末尾的`. .`。但是，等到标准化已经结束，这个值现在可以被修改了。我们把`x`改为`.`

接下来我们继续执行，猜猜会发生什么？

对了，`file. .`（病毒）被执行了。但是，如果一个用户在任务管理器里右键查看进程属性，会发现它有一个可用的微软签名，也就是`file`（taskmgr）

![pentesting-ntfs-20](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-20.png)

那么`filex x `（WinSCP）呢？是的，此文件也显示在正在运行的进程，即process explorer（因为路径是在调用`NtCreateUserProcess`之前设置的）

![pentesting-ntfs-21](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-21.png)

那么用powershell查看呢，是的，也是错误的二进制文件

![pentesting-ntfs-22](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-22.png)

这是个问题吗？这得看情况，首先，一个攻击者需要能启动一个进程（恶意软件），重命名/删除 它，然后将有效文件重命名为相同名称。然后，在taskmanager和process explorer也会发生上述效果。但是，不同之处在于，使用上述技巧时，此过程恰好在启动过程同时发生

举个栗子，假如二进制的哈希已经被云端记录，于是已安装的端点保护会检查每个启动的进程。使用此技巧，端点保护可能会使用错误的二进制文件来验证哈希。另外请注意，创建此类进程不需要调试器。应用可以仅hook住`NtCreateUserProcess`函数并在hook函数中实现修改

## Windows CMD Tricks

这些tricks与文件系统无关，不过我认为它们非常适合本博文。在Windows CMD中，可以在命令中的任何位置写入`^`，而CMD将完全忽略它。例如，`calc.exe`与`ca^l^c`相同。重要的是，`^`不能是最后一个符号，并且两个`^`不能同时使用。也可以使用双引号代替`^`，并且没有限制（可以是最后一个字符，也可以多次使用）。例如`^ca^"^"^lc^"`将启动计算器

零长度环境变量也是如此。可以通过`%name%`访问环境变量。如果环境变量的长度为零，则`cal%name%c`将与`calc`相同。由于默认情况下环境变量长度不为零，因此无法直接使用。但是，可以使用特殊语法（`:~start,enc`）在环境变量上调用子字符串。下图显示了`windir`环境变量，以及如何将子字符串与negativ值一起使用以获取返回的零长度变量

```
> echo xxx%windir%yyy
xxxC:\WINDOWSyyy

> echo xxx%windir:~0,7%yyy
xxxC:\WINDyyy

> echo xxx%windir:~0,-7%yyy
xxxC:\yyy

> echo xxx%windir:~0,-70%yyy
xxxyyy
```

下面的计算展示了这些技术的组合，以隐蔽启动Powershell v2（这在很长一段时间里一直有用，但是最新的Windows10上不再有效）

![pentesting-ntfs-23](http://eddieivan01.github.io/assets/img/ntfs/pentesting-ntfs-23.png)

你可以看到使用了`^`和环境变量的trick（`%os:~0,-56%`），使用版本`00000000002.0000`（而不仅仅是2），而且参数是`?ver`而不是`-ver`（注意，这不是普通的`?`，而是`U+2015`，也就是`―`，仅使用`?`是没用的）

在Windows上，也可以在路径中用`/`代替`\`。例如，`C:\Windows/\//\system32\calc.exe`和`C:\Windows\system32\calc.exe`相同。除此之外，你也可以使用UNC路径访问，将`C:\`替换为`\\127.0.0.1\C$\windows\system32\calc.exe`

通常可以使用类似的技巧来bypass黑名单，例如，如果禁止`powershell.exe`，则攻击者可以调用`power^shell.exe`来绕过限制。或者，如果禁止calc，则可以执行：

`^"%Localappdata:~-3%^%SystemRoot:~0,1%^"`