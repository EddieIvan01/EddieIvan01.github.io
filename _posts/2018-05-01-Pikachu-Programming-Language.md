---
layout: post
title: The Pikachu Programming Language
featured-img: pika
summary: 一款为皮卡丘设计的编程语言...
---

# Introducing The Pikachu Programming Language – A Programming Language Made For Pikachus
 >*介绍皮卡丘编程语言————一款为皮卡丘设计的语言*
 
 
 **转载自[trove42](http://trove42.com/introducing-pikachu-programming-language/)**
 
 
## Design Principles
 
## 设计原则

* *The language should be easily usable by Pikachus. Programs should be readable and writable by any Pikachu.*
 
 > *这种语言应该很容易被Pikachus使用。 程序应该可以被任何皮卡丘读写。*
 
* *The language should utilise only elements of Pikachu language. This is actually a very good thing since human language is often messy and complicated. But since Pikachu is based on the language of the Pikachus, it can make do with only the following three syntax elements : pi, pika, pikachu*
 
 > *该语言应该只使用皮卡丘语言的元素。 这实际上是一件非常好的事情，因为人类的语言经常是混乱和复杂的。 但是因为皮卡丘是基于派卡舒语言的，所以只能使用以下三种语法元素：pi，pika，pikachu*
 
* *Coding in Pikachu should be easy if you’re a Pikachu. However, if you’re a human being and write a bunch of programs in Pikachu, you’re ability to speak/read/write in the language of Pikachus should improve significantly.*

 > *如果你是皮卡丘，皮卡丘编码应该很容易。 但是，如果你是一个人，并且在皮卡丘编写一系列程序，那么你用Pikachus的语言说/读/写的能力应该会显着提高。*
 
## U Can Find All Syntax Rules for Pikachu [Here](http://trove42.com/pikachu-syntax-rules/)
 
## 你可以[在这里](http://trove42.com/pikachu-syntax-rules/)查看所有皮卡丘语言语法规则
 
 **以下是用英语的人类语言解释的皮卡丘编程语言的语法和语言规则：**

    >只有3种语法元素 - pi ， pika和pikachu 。 不允许连续三次重复相同的语法元素。
    >皮卡丘利用2 pikachus（堆） - Pi皮卡丘和皮卡皮卡丘 。 

 **如果一条线以pi pikachu或pika pikachu结尾，根据前面的命令对指定的皮卡丘进行操作：**

    >pi pika
    >将皮卡丘的顶部元素添加到下一个顶部元素，并将结果推送到皮卡丘
    >pika pi
    >从下一个顶部元素中减去皮卡丘的顶部元素，并将结果推送到皮卡丘
    >pi pikachu
    >将皮卡丘的顶部元素乘以下一个顶部元素，并将结果推送到皮卡丘
    >pikachu
    >将皮卡丘的第二个顶部元素除以顶部元素，并将结果推送到皮卡丘
    >pika pikachu
    >打开皮卡丘顶部的值并打印出来。
    >pikachu pikachu
    >弹出皮卡丘顶部的值并打印出相应的ASCII字符。
    >空白
    >弹出皮卡丘顶部的值。
    >n条款数
    >将术语数 - n - 推到皮卡丘上。 确保没有语法元素pi ， pika或pikachu连续重复3次。 

**以下4条命令在pi pikachu和pika pikachu 。 因此，这些线条也不需要以个人皮卡丘的名字结尾：**

    >pi pika
    >将pi pikachu的顶部复制到pika pikachu 。
    >pika pi
    >将pika pikachu的顶部复制到pi pikachu 。
    >pikachu pikachu
    >如果pi pikachu和pika pikachu的顶部相同，则转到行号n，其中n是紧接着的下一行中的项的数量。
    >pika pika
    >如果pi pikachu和pika pikachu的顶端不相等，则转到第n行，其中n是紧接着的下一行中的术语数。 

**注意：输入最初被添加到pi pikachu 。 要指定多个输入，请用空格分隔它们。 第一笔投入将首先推到pi pikachu ，然后是第二笔，依此类推.**
 
## Sample Programs:
 
## 示例程序：
 
 **打印"hello world"的程序**
 ```swift
pikachu pika pikachu pika pika pi pi pika pikachu pika pikachu pi pikachu pi pikachu pi pika pi pikachu pikachu pi pi pika pika pikachu pika pikachu pikachu pi pika pi pika pika pi pikachu pikachu pi pikachu pi pika pikachu pi pikachu pika pikachu pi pikachu pikachu pi pikachu pika pika pikachu pi pikachu pi pi pikachu pikachu pika pikachu pi pika pi pi pika pika pikachu pikachu pi pi pikachu pi pikachu
pikachu pikachu pi pikachu
pikachu pika pika pikachu pika pikachu pikachu pika pika pikachu pikachu pi pi pikachu pika pikachu pika pika pi pika pikachu pikachu pi pika pika pikachu pi pika pi pika pi pikachu pi pikachu pika pika pi pi pika pi pika pika pikachu pikachu pika pikachu pikachu pika pi pikachu pika pi pikachu pi pika pika pi pikachu pika pi pika pikachu pi pi pikachu pika pika pi pika pi pikachu
pikachu pikachu pi pikachu
pikachu pika pi pika pika pikachu pika pikachu pi pikachu pi pi pika pi pikachu pika pi pi pika pikachu pi pikachu pi pi pikachu pikachu pika pikachu pikachu pika pi pikachu pi pika pikachu pi pikachu pika pika pikachu pika pi pi pikachu pikachu pika pika pikachu pi pika pikachu pikachu pi pika pikachu pikachu pika pi pi pikachu pikachu pi pikachu pi pikachu pi pikachu pi pika pikachu pi pikachu pika pikachu pi pika pi pikachu
pi pika
pikachu pikachu pi pikachu
pika pi
pikachu pikachu pi pikachu
pikachu pi pikachu pi pi pikachu pi pikachu pika pikachu pikachu pi pikachu pikachu pika pi pi pika pikachu pika pikachu pi pi pikachu pika pi pi pikachu pika pika pi pika pika pikachu pika pikachu pi pi pika pikachu pika pi pikachu pikachu pi pikachu pika pikachu pikachu pika pi pi pikachu pikachu pi pika pikachu pi pikachu pika pikachu pikachu pika pi pikachu pikachu pika pikachu pi pikachu pika pika pi pikachu pi pika pi pikachu pikachu pi pikachu
pi pika
pikachu pikachu pi pikachu
pikachu pikachu pi pika pikachu pi pika pika pi pi pika pi pikachu pi pika pi pika pi pika pikachu pika pi pi pikachu pi pikachu pi pika pi pika pika pikachu pi pikachu
pikachu pikachu pi pikachu
pikachu pi pikachu pika pikachu pi pika pi pikachu pikachu pika pika pi pi pikachu pi pika pi pikachu pi pika pikachu pi pika pi pi pikachu pikachu pika pika pikachu pikachu pi pi pikachu pi pikachu pi pikachu pi pi pikachu pikachu pi pikachu pi pikachu pi pika pika pikachu pikachu pika pi pika pikachu pi pikachu pi pi pika pikachu pika pi pikachu pi pika pi pi pikachu pikachu pika pika pikachu pika pika pikachu pi pika pi pika pikachu pi pika pikachu pika pi pika pikachu
pikachu pikachu pika pikachu
pikachu pikachu pika pikachu
pi pi pikachu pi pikachu pika pika pi pikachu pika pika pi pi pika pika pikachu pi pi pikachu pi pika pi pika pikachu pi pikachu pi pikachu pikachu pi pi pika pika pi pika pika pi pika pikachu pikachu pi pikachu pika pi pi pika pi pi pikachu pikachu pika pi pi pika pika pi pika pikachu pi pikachu pi pi pika pi pika pika pikachu pika pi pika pikachu pi pikachu pikachu pi pi pika pi pika pika pikachu pikachu pi pikachu
pikachu pikachu pi pikachu
pikachu pi pikachu pikachu pika pikachu pikachu pika pika pikachu pikachu pika pikachu pi pika pikachu pika pika pi pikachu pi pi pika pi pi pikachu pika pika pikachu pikachu pika pikachu pikachu pi pika pi pi pikachu pikachu pika pi pi pikachu pikachu pika pikachu pika pi pikachu pi pika pi pika pikachu pika pi pikachu pi pikachu pikachu pi pika pikachu pi pikachu pikachu pi pika pi pikachu pikachu pi pikachu pika pika pi pi pikachu
pikachu pi pi pika pi pi pikachu pika pikachu pikachu pika pika pi pi pika pikachu pi pikachu pi pi pika pi pika pi pi pika pikachu pi pika pi pikachu pika pikachu pika pi pi pika pi pi pikachu pi pikachu pikachu pika pi pikachu pi pi pika pi pikachu pi pi pika pi pi pikachu pika pikachu pika pikachu pika pi pikachu pikachu pi pi pika pika pikachu
pikachu pikachu pi pikachu
pikachu pikachu pika pikachu
 ```
 **打印第n个（n≥2）斐波纳契数字的程序（输入n作为输入）**
 ```swift
 pika pika pikachu
pi pika pikachu
pi pikachu pikachu pika pi pikachu pi pika pikachu
pika pi pika pikachu pika pi pi pika pikachu
pikachu pika pi pika pika pikachu
pika pikachu
pika pikachu
pika pikachu
pi pika pika pikachu
pika pi pikachu
pika pi pi pikachu
pikachu pi pika pikachu pikachu pika pikachu
pikachu pikachu pi pi pika pika pikachu
pikachu pika pikachu
pikachu pikachu
pika pikachu pikachu pika pi pika pikachu pika pi pika pi pika pikachu pika pi pikachu pikachu pika pi
pika pika
pika pikachu pika pi pika pika
pika pikachu
pika pikachu
pika pikachu
pika pikachu pika pikachu
 ```
 
