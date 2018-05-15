---
layout: post
title: 深入理解C语言指针
summary: 总结对C语言指针的理解以及一些tips
featured-img: mao
---

# 写在最前

**在C语言中，能给代码提供高灵活高性能的就是指针。对于指针的理解以及灵活运用可以说是对C语言掌握程度的最好体现，且深入理解指针可以对理解Python的许多行为提供便利（最常用的为CPython解释器）。在此总结指针的一些tips**

***

## C语言在编译后，会以三种方式使用内存： 

+ **全局内存**
  + 作用域：整个文件
  + 生命周期：程序的生命周期
+ **静态内存**
  + 作用域：声明它的函数内部
  + 声明周期：程序的生命周期
+ **自动内存**
  + 作用域：声明它的函数内部
  + 声明周期：函数执行时间内
+ **动态内存**
  + 作用域：由引用该内存的指针决定
  + 生命周期：由引用该内存何时释放决定

***

## 重载过的操作符"\*"

**对于指针的声明，有两种方式：**
```c
int n；
int *pit；
pit = &n；
```
```C
int n；
int *pit = &n；
```
**按照我最开始学习的理解，"\*"号是寻找指针所引用的值，"&"是变量的地址。那么第一种声明指针的方式很好理解，但是第二种方式：**
**`int *pit = &n` 赋值符号左边是变量值，右边是变量地址，它们之间为什么可以赋值且编译器不报错**

**解释：**
**在`int *pit`里的"\*"是对指针的声明，类似于`int lit[]`对于数组的声明；而`a = *pit`里的"\*"则是对指针的解引操作，即`dereference`。C语言中的"\*"号是经过操作符重载的，它还有第三种用法就是算数运算的乘法**

***

## 指针的类型转换

对于`int *pit`语句，"\*"两旁的空格是没有限制的，也就是说，下面三条语句在编译器看来是完全相同的：
```C
int* pit;
int * pit;
int *pit;
```
所以在对指针类型进行转换的时候。我们可以把`(int*) pit`看作是变量转换一样:`int num`。即将`(int*)`看作指针声明的特定操作符

***

## 打印指针的值

**我这里说的是打印"指针"的值，即打印变量的地址。在`printf()`函数中中可以有不同的结果**
```C
int num = 1;
int *pit = &num;
printf("%d",pit);   //十进制
printf("%x",pit);   //十六进制
printf("%p",pit);   //自动选择为值的专用格式，打印指针一般是Hex
```

**数组**

```C
char *pit[] = {"Hello","Ivan"};
printf("%s",pit[0]);    //这里pit[0]为指向"Hello"的指针，以string形式打印指针时会打印"Hello"
printf("%p",pit[0]);    //以%p格式打印时，会打印出'H'的地址，因为数组的地址是第一个元素的地址
```

***
## 关于void指针

**void指针也叫万能指针，用来存放任何类型的引用，常用于类型转换时。**

+ void指针具有与char指针相同的内存对齐方式（指针内存会边界对齐，如int类型占四字节，指针的内存地址为4的倍数）
+ void指针和别的指针永远不会相等
+ void指针只用于作数据指针，而不能用于函数指针
+ 可以用`sizeof`操作符返回void指针长度，但不能返回void类型长度
 + `size_t n = sizeof(void*);`  //正确
 + `size_t n = sizeof(void);`   //错误

***

## 与指针想关的预定义类型

+ `size_t`无符号整数，表示C语言中任何对象能达到的最大长度，使用它可以解决一些缓冲区溢出漏洞。用于安全的保存长度
+ `intptr_t`用于保存指针地址，用一种可移植且安全的方法声明指针

***

## 指针的算数运算

**给指针加上整数：等同与给指针加上此整数与指针类型字节数的乘积**
```C
int n[] = {1,2,3};
int *pit = n;
printf("%d",pit);   //假如打印出10000
++pit;
printf("%d",pit);   //此处会打印出10004
```

**指针相减，运算结果为指针想差的单位数**
```C
int n[] = {1,2,3};
int *pit = n;
int *pit_t = n+1;   //指向2
printf("%d",pit_t-pit);  //打印1
```

***

## 指针与常量

+ 指向常量的指针
  + 指针声明：`const int n = 1;int *pit = &n;`
+ 指向非常量的常量指针
  + 指针声明：`int n;int *const pit = &n;`
+ 指向常量的常量指针

**此处解释第二种声明方式**
```C
int* const pit = &n;    //const修饰pit，即常量指针
const int* pit = &n;    //const修饰*pit，即指向常量的指针
```

***

## C语言的动态内存管理

**之所以说C/Cpp相较其他高级语言更底层，因为C可以访问地址以及动态管理内存**

**malloc函数**
```C
int *pit = (int*) malloc(sizeof(int));  //malloc()执行成功返回地址；失败返回NULL
*pit = 1;
```
注意：malloc函数返回的指针是没有清空的，里面可能包含垃圾数据。与calloc函数的区别在此。

**realloc函数**
**在之前分配的内存块的基础上，将内存重新分配为更大或更小的部分**
```C
int n = 1;
int *pit = (int*) malloc(2);
realloc(pit,4);
pit = &n;
```

**calloc函数**
返回清空过的指针，不包含垃圾数据。但执行效率低于malloc函数

**free函数**
用于释放内存
```C
int *pit = (int*) malloc(4);
free(pit);
```
释放后的指针仍可能指向原值，此情况称为迷途指针

***

## 指针与函数

**用指针传递数据**

+ 在为函数传入参数时，如果传入变量，那么将会为该变量分配一块自动内存，即原变量的副本，当传递的变量所占内存非常大时将会影响程序性能，这时需要传入指针
+ 当我们需要在函数内部对变量进行修改时，也需要传入变量指针

如定义一个函数交换变量的值：

```C
void change(int *n1,int *n2){
    int t;
    t = *n1;
    *n1 = *n2;
    *n2 = t;
}
void main(){
    int n1 = 1;
    int n2 = 2;
    change(&n1,&n2);
}
```

**假如在这里我们不用指针传参的话，那么交换不会发生**

**在VB以及Python中：**

+ VB中函数传参会有显式声明by val或by ref，即传值或传参；如没有显示声明则程序默认传值
+ Python中默认字符串，整数等类型传值，即创建副本；list，dict等类型传地址，即可在函数中修改

写一个简单的程序来直观展示Python的逻辑：
```python
print("Ivan" == "Ivan")   #True
print("Ivan" is "Ivan")   #False
print([1,2] == [1,2])   #True
print([1,2] is [1,2])   #True
```

**函数指针**

声明：
`void (*foo)();`

这里假如不加括号写成`void *foo();`，则为函数接受void类型，返回void类型指针

```C
int (*pit)(int);
int foo(int n){
    return n*n;
}
void main(){
    int n =2;
    pit = foo;      //*************
    printf("%d",pit(n));    //##########
}
```

在我标注\*的位置：将函数直接赋值给指针。这是C语言特定的语法，编译后的函数就是以地址表示，所以编译器忽略了&操作符。但还是建议写成`pit = &foo;`，以免给别人或自己以后读代码时造成误解

在我标注\#的位置：可以直接写成示例中的样子，原因同上。简易写成`printf("%d",(*pit)(n));`，原因依旧同上：增加代码可读性

举一个Python中引用函数指针的例子：
```python
dic_c = {'a':1,'b':2,'c':3}
c = max(dic_c,key = dic_c.get)      #将字典对象的成员函数get传入max函数的key值
```
以上代码是依照字典的值找出最大值对应的键，如不传入key参数则依照字典的键找最大值

**函数指针的常见用法**

利用typedef进行函数指针声明
```C
typedef int (*foo)(int,int);
int add(int n1,int n2){
    return n1+n2;
}
int sub(int n1,int n2){
    return n1-n2;
}
int process(foo function,int n1,int n2){
    return (*function)(n1,n2);
}
void main(){
    printf("%d",process(&add,1,2));
}
```
如此利用函数指针降低了代码的维护难度

***

## 指针与数组

**指针与数组关系密切，在大多数地方，数组名可以当做是指向数组第一个元素的指针。但是，数组不等于指针**

```C
int array[5] = {1,2,3,4,5};
int *pit = array;
```
首先我定义了一个数组和一个指针，在对它们进行数组元素访问时，以下的代码等价：
```C
//pit == array == &array[0] == &pit[0]
//*(pit + 1) == pit[1] == array[1] == *(array + 1)
```
只要不调用`sizeof`操作符，在这里数组名和指针是无异的。

**在调用sizeof操作符时，数组名返回值为数组类型长度\*数组元素个数；指针返回值为指针类型长度**

一下代码说明了指针与数组的一些使用：
```C
int array[5] = {1,2,3,4,5};
int *pit = array;
int v = 2;
for (int i = 0;i < 5;++i){
    *pit++ *= v;
}
```

**变长数组**

在C99之前没有变长数组，只能只用`realloc()`函数改变数组长度

**字符串数组**

我的常用法：
```C
char *string[2] = {"hello","ivan"};
printf("%s",string[1]);
```

***

## 指针与字符串

其实在大多数编程语言里，字符串就是数组

声明字符串：

+ 赋值给变量
+ 字符数组
+ 字符指针

**使用`strcpy`函数**

下例展示了如何声明内存，并指向字符串
```C
char *pit = (char*) malloc(strlen("hello,ivan")+1);
strcpy(pit,"hello,ivan")
```
这里strlen函数返回值加1的原因是：字符串结尾有'\0'，即ascii码的NUL，结束符，类似文件结束符EOF

下例展示一个将字符串改为小写的函数：
```C
char *lower(char * string){
    char *pit = (char*) malloc(strlen(string)+1);
    char *start = pit;
    while (*string != 0){
        *pit++ = tolower(*string++);
    }
    *pit = 0;
    return start;
}
```

***

## 指针与结构体

结构体是将一些想关的变量，值或函数（函数指针）集合起来的类型。个人感觉可以算作是OOP的雏形，但没有OOP的多态和继承

结构体的声明通常使用typedef关键字：
```C
typedef struct _ivan{
    char *name;
    int age;
} ivan;
ivan ivan_name;
```

还可以使用结构体指针来指向声明的结构体：
```C
ivan *pitivan;
pitivan = (ivan*) malloc(sizeof(ivan));
```

**访问结构体对象：**
+ 声明结构体：用"."操作符，`ivan.age`
+ 声明结构体指针：用"->"操作符或先解引再用"."操作符，`ivanpit->age`

**定义函数来简便初始化结构体：**

```C
typedef struct _ivan{       //ivan前加了下划线，在大多数OOP语言中意为表明这是私有对象以隔绝外部访问。这里是一种命名规范，可以节约变量名空间
    char *name;
    int age;
} ivan;
void init_struct(ivan *nnn,char *name,int age){
    nnn->name = (char*) malloc(strlen(name)+1);
    strcpy(nnn->name,name);
    nnn->age = age;
}
void main(){
    ivan ivan_name;
    init_struct(&ivan_name,"eddie",19);
}
```

**用结构体创建常用数据结构：**
+ 链表
+ 队列
+ 堆栈
+ 树

太复杂了不想写，参见《数据结构（C/Cpp语言描述）》

***

## 指针的安全使用

**不同于其他高级语言，C语言相对更接近系统底层。C语言不会阻止越过数组边界，这带来了很多风险。缓冲区溢出漏洞的EXP/POC基本都是用C/Cpp写的**

**错误的指针声明：**
```C
//声明两个int指针的错误写法
int* pit1,pit2;
//正确写法
int *pit1,*pit2;
```
上面的那种写法中，pit1为指针，pit2为int类型；下面的写法才是声明了两个指针。在类型转换中可以把`int*`当做操作符，但在这里得注意

**使用指针前为初始化：**
```C
int *pit;
printf("%d",*pit);
```
未初始化的指针可能包含垃圾数据，导致严重后果。避免此类错误：在指针声明时即赋值NULL
```C
int *pit =NULL;
if(pit == NULL){
    //wrong
}else{
    //use pointer
}
```

**数组越界访问：**
```C
char a_data[8] = "1234567";
char b_data[8] = "1234567";
char c_data[8] = "1234567";

b_data[-2] = X;
b_data[10] = X;
b_data[0] = X;
```
如果打印以上三个数组会发现，a和c的数据也被修改了。根本原因是C语言通过下标访问元素时不会检查索引值

**使用restrict关键字声明不存在别名的指针：**
```C
int num =1;
int* restrict pit = &num;
```
这样做可以提高程序效率，C语言标准库中的很多函数就使用了restrict关键字来声明指针

***

## 联合union和结构体struct

联合和结构体无论声明还是赋值都很相像，但两者有很大区别

联合体中所有成员共用一片内存，结构体中则是集合了一些元素

联合体：

+ union中可以定义多个成员，union的大小由最大的成员的大小决定。
+ union成员共享同一块大小的内存，一次只能使用其中的一个成员。
+ 对某一个成员赋值，会覆盖其他成员的值

可以说，联合体很像线程模型，结构体很像OOP class对象

***

# 大概总结的就这么多了，滚去复习电工和计算方法了-->_-->
