---
layout: post
title: Intel x86汇编速查
summary: Assembly language makes me wanna sit in a corner and cry
futured-img: assembly
---



## Intel x86 汇编速查

***



![](https://upload-images.jianshu.io/upload_images/11356161-017bb5a04a71d1b7.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)



**三种内存模式**

+ 实模式平面模型
+ 实模式段模型
+ 保护模式平面模型



**保护模式平面模型中的寻址**

`Base + [(Index * Scale) +Disp]`

Base：基址，任意的通用寄存器

Index：索引，任意的通用寄存器

Scale：缩放比例/刻度因子，是一个2，4或8的立即数

Disp：偏移量，8，16或32位的立即数



`[]`相当于C/Cpp中的指针解引`int a = *pointer;`

lea指令为取址，相当于`&`

可利用lea指令实现快速算术运算：

```assembly
;ECX multiplied by 3

;method 1
mov edx,ecx
shl edx,1
add edx,ecx

;method 2
;lea指令仅根据源操作数里的内容完成运算，将结果存入目标数。不接触内存，也不影响标志位
mov edx,ecx
lea edx,[edx*2+edx]
```



***



**Register**

|Register|作用|Sub Register|
|----|------|------|
|eax|累加，算数逻辑|ax,ah,al|
|ebx|基址，数组|bx,bh,bl|
|ecx|计数，迭代|cx,ch,cl|
|edx|数据，算数|dx,dh,dl|
|esi|源索引，数组|si|
|edi|目的索引，数组|di|
|esp|堆栈，栈顶指针|sp|
|ebp|堆栈，栈底指针|bp|
|eip|指令，指向next指令|ip|
|eflags|标志位，状态控制|flags|



***



**eflags标志位**

部分标志位在保护模式下为操作系统预留，如VIF虚拟中断标志，IOPL I/O特权标志。此处只总结用户标志位

| High | =>|=>|=>|=>|=>|=>|=> | low  |
| ---- | --|--|--|--|--|--|--| ---- |
| OF | DF | IF |TF|SF|ZF|AF|PF|CF|
|溢出。进位标志被设置时溢出标志一般也会被设置|方向。会影响字符串指令。为0目标指针减小，为1增加|中断。设置时中断被启用。STI设置，CLI清零|陷阱/单步。被设置时，允许调试器通过强制CPU在调用一个中断程序前执行一条指令以实现单步管理|符号。运算改变操作数为负号时|零。操作的结果为0时被设置|辅助进位。只用于BCD码算术运算，已弃用|奇偶。为1的二进制位个数为偶数时被设置，为奇数时被清除|进位。用于无符号算术运算。STC设置，CLC清零|



***



**数据类型**

|类型|bits|范围|
|----|----|-----|
|sdword|32|-2147483648~+2147483647|
|dword|32|0~+4294967295|
|sword|16|-32768~+32768|
|word|16|0~+65535|
|sbyte|8|-128~+127|
|byte|8|0~+255|



***



**指令**

+ add/sub：算术加/减法
+ mov：移动（赋值）
+ adc：进位加法，会操作eflags进位标志
+ and/or/xor：逻辑与/或/异或，二元操作，运算结束将结果替换目标操作数
+ call：调用sub，在移交控制权之前，它会将紧挨着它身后的一条指令地址压入堆栈，从而在call指令结束后控制权能返回原本的程序流下一条指令
+ clc：清除进位标志`CF`
+ cld：清除方向标志`DF`
+ cmp：算术比较，二元，目标操作数不受影响，仅设置想关标志位。操作本身等同于从源操作数中减去目标操作数。一般情况下cmp指令后会紧跟一条条件跳转指令
+ inc/dec：递增/递减，不能操作段寄存器，不影响进位标志
+ div：无符号除法，一元操作，被除数为隐式操作数，除数为显示指定。结果的低位有效部分放入EAX，高位有效部分放入EDX，即使没有高位部分，EDX中的寄存器也会被清零。示例
   + div ch        ;商位于AL，余数位于AH
   + div bx        ;商位于AX，余数位于DX
   + div ecx        ;商位于EAX；余数位于EDX
+ mul：无符号除法，同div
+ int/iret：软甲中断/从中断返回，int触发一个位于内存前1024bytes中的256向量之一的软件中断，当一个中断被调用时，标志寄存器与返回地址一起被压入堆栈，IF标志被清零。
+ j*：有条件跳转



| 跳转指令 | 跳转前提                             | 标志位            |
| -------- | ------------------------------------ | ----------------- |
| JA/JNBE  | if以上                               | CF==0 && ZF==0    |
| JAE/JNB  | if以上或等于                         | CF==0             |
| JB/JNAE  | if以下                               | CF==1             |
| JBE/JNA  | if以下或等于                         | CF==1 \|\| ZF==1  |
| JE/JZ    | if相等                               | ZF==1             |
| JNE/JNZ  | if不相等                             | ZF==0             |
| JG/JNLE  | if大于                               | ZF==0 && SF==OF   |
| JGE/JNL  | if大于或等于                         | SF==OF            |
| JL/JNGE  | if小于                               | SF!=OF            |
| JLE/JNG  | if小于或等于                         | ZF==1 \|\| SF!=OF |
| JC       | if进位标志被设置                     | CF==1             |
| JNC      | if进位标志未设置                     | CF==0             |
| JO       | if溢出                               | OF==1             |
| JNO      | if没有溢出                           | OF==0             |
| JP       | if偶数                               | PF==1             |
| JNP      | if奇数                               | PF==0             |
| JS       | if符号标志位设置                     | SF==1             |
| JNS      | if符号标志位未设置                   | SF==0             |
| JCXZ     | if CX==0（许多指令以CX作计数寄存器） |                   |
| JECXZ    | if ECX==0                            |                   |

+ jmp：无条件跳转

+ lea：Load Effective Address ，取出源操作数的地址到目的操作数，如`lea ebx,eax+edx*4`。目标操作数必须是一个寄存器，不能是内存。存储在目标操作数中的地址是内存中的源操作数的第一个字节的地址

+ loop：循环，直到CX/ECX ==0，一元操作符，操作数为指令标签

+ loopnz/loopne：当CX/ECX>0 && ZF==0时循环，一元操作符，同loop

+ loopz/loope：当CX/ECX>0 && ZF==1时循环

+ movs：移动字符串

  ```assembly
  movsb		;将[ESI]处的byte赋值到[EDI]
  movsw		;[ESI]字=>[EDI]
  movsd		;[ESI]双字=>[EDI]
  rep movsb		;将从[ESI]处开始的内存区域复制到从[EDI]开始的内存区域，重复CX/ECX次，每次一个字节
  ```

+ pop：从栈顶弹出元素到操作数中，操作数只能是16bit or 32bits

+ popa/popad：弹出所有16位寄存器/弹出所有32位寄存器，ESP的值不会弹回ESP，而是直接丢弃

+ popf/popfd：弹出栈顶16bits/32bits到eflags寄存器

+ push/pusha/pushad/pushf/pushfd：压入栈

+ ret：从sub中返回

+ rol/ror：循环左移/右移，即`12345<<2`  => `34512`

+ shl/shr：逻辑左移/右移

+ stc：设置进位标志CF

+ std：设置方向标志DF

+ stos：存储字符串，将EAX/AX/AL的值存储到[DI]/[EDI]指定的位置，通过设置ECX，通过req指令实现循环存储，同movs

+ xchg：交换操作数