---
title: C语言中do {...} while (false)
summary: 最近在读源码时看到，学习到是一种经典且实用的多行内联宏与安全资源释放的C语言技巧
layout: post
featured-img: dowhile
---


最近意外读到一个C语言开源项目，发现一种写法被用了很多次：

```c
do {
    xxx;
} while (0)
```

就是只循环一次的代码段，我去`Github`上搜了一下，发现很多`C/Cpp`的项目中都在这样写（223M+），举个`Linux `内核的例子，摘自内核源码`lib/atomic64_test.c`文件

```c
#define TEST_RETURN(bit, op, c_op, val)         \
    do{                                         \
        atomic##bit##_set(&v, v0);              \
        BUG_ON(atomic##bit##_read(&v) != r);    \
    } while (0)
```

可以看到这个`inline`宏用`do {...} while (0)`执行了两个函数。顺带一提`##`的用法，它是拼接两个字段（或称`token`），感觉类似`php`那种把字符串转义为变量名：

```c
#include <stdio.h>

int foo_1(){
    printf("1");
}

int foo_2(){
    printf("2");
}

int foo_3(){
    printf("3");
}

#define EXEC(f, c) f##c()

int main(void){
    EXEC(foo_, 1);
    EXEC(foo_, 2);
    EXEC(foo_, 3);
    return 0;
}


// output: 123
```

***

回到原题，在参考了[Blog1][1]，[Blog2][2]以及[Stackoverflow][3]讨论后，总结这种写法的好处：

+ 用在多行宏里，这是唯一一种使得多行宏在任何代码段里都能正常使用的方法：

  > do{...}while(0), is the only construct in C that lets you define macros that always work, the same way, so that a semicolon after your macro always has the same effect, regardless of how the macro is used (with particularly emphasis on the issue of nesting the macro in an if without curly-brackets).

  举个栗子：
  ```c
  #define MACRO(x) foo(x); bar(x)
  ```

  当我在代码里使用这个宏：

  ```c
  int a = 1;
  MACRO(a);
  
  // =>
  
  int a = 1;
  foo(a);
  bar(a);
  ```

  在以上代码段里它正常运行，而当我把它放进一个不带花括号的`if`语句里

  ```c
  if (a!=0)
      MACRO(a);
  
  // =>
  
  if (a!=0)
      foo(a);
  bar(a);
  ```

  `bar`函数已经不在`if`范围内了

  假如说在宏里用花括号包裹多行代码，貌似可以解决这种问题：

  ```c
  #define MACRO(x) {foo(x); bar(x);}
  
  if (a!=0)
      MACRO(x)		// 这里不能加分号
  
  // =>
  
  if (a!=0){
      foo(x);
      bar(x);
  }
  
  /*****************************************/
  
  if (a!=0)
      MACRO(x)
  else 
      // do sth;
  
  // =>
  
  if (a!=0){
      foo(x);
      bar(x);
  }
  else
      // do sth;
  ```

  以上的代码段里可以看出为什么不用宏外包裹花括号的方式：

  + 不统一，有的地方加分号，有的地方不加，如果是写函数库的话，显然很蛋疼
  + 当`if`后有`else`时，`syntax error`

  所以，当用`do {...} while (0)`时：

  ```c
  #define MACRO(x) do {foo(x); bar(x);} while (0)
  
  int a = 1;
  if (a!=0)
      MACRO(a);
  else
      //do sth;
      
  // =>
  
  if (a!=0)
      do {
  		foo(a);
          bar(a);
      } while (0);
  else
      // do sth;
  ```

  它可以保证在任何代码段里正常工作

+ 避免深层嵌套和避免`goto`语句

  假如说，我在一个函数里`malloc`了几个变量，在函数调用结束我需要`free`掉它们：

  ```c
  int foo(){
      char* a = (char*)malloc(1);
      char* b = (char*)malloc(1);
      int c;
      // do sth;
      free(a);
      free(b);
      return c;
  }
  ```

  这时假如里面有一系列判断，不符合条件即可直接`return`，假如没有函数末尾的善后工作，可以这样：

  ```c
  if (cdn1)
      return c;
  if (cdn2)
      return c;
  ```

  但是有善后工作需要做，所以所有判断最后都得回到`free`，如果不用`do {...} while (0)`，有两种写法：

  ```c
  if (!cdn1){
      if (!cdn2){
          ;
      }
  }
  
  /************************/
  
  if (cdn1)
      goto LABEL;
  if (cdn2)
      goto LABEL;
  
  LABEL: 
  free(a);
  free(b);
  return c;
  ```

  第一种就是深层嵌套，写超过五层嵌套或迭代代码的人都是应该被拉出去打死的

  第二种就是`goto`语句，很多书都说过，能不用就不用，因为读着实在累，很多大厂代码规范也明确不允许使用`goto`

  所以，看看`do {...} while (0)`怎么实现安全的资源释放

  ```c
  int foo(){
      char* a = (char*)malloc(1);
      char* b = (char*)malloc(1);
      int c;
      do {
          if (cdn1)
              break;
          if (cdn2)
              break;
      } while (0);
      free(a);
      free(b);
      return c;
  }
  ```

  完美解决了上面的两个问题

[1]: http://bruceblinn.com/linuxinfo/DoWhile.html
[2]: https://www.pixelstech.net/article/1390482950-do-%7B-%7D-while-%280%29-in-macros
[3]: https://stackoverflow.com/questions/154136/why-use-apparently-meaningless-do-while-and-if-else-statements-in-macros
