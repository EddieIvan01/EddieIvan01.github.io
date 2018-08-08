---
layout: post
featured-img: pool
title: 构建一个代理IP池
summary: 用Go语言编写的代理池，采集免费代理存入数据库，并在本地2333端口提供json API
---

**Demo:** 

![](https://upload-images.jianshu.io/upload_images/11356161-fd30cb2c50e026bb.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

***

[项目地址](https://github.com/EddieIvan01/ProxyPool)

[README](https://github.com/EddieIvan01/ProxyPool/blob/master/README.md)

**流程**：

爬取免费代理，验证可用性存入本地sqlite3数据库，并在本地开启json API Server监听2333端口

**API**:

+ /index：判断是否监听成功
+ /proxy：操作代理数据
  + ?act=get：获取数据库全部代理
  + ?act=reflush：刷新数据库
+ 状态码：
  + 200：正常
  + 201：数据库为空，调用reflush
  + 202：请求参数错误
+ 数据形式：

anonymous: 是否高匿

ssl：是否https

```
data{
    "code" : 200,
    "proxies" : [
        {
            "ip" : "118.190.95.43",
            "port" : "9001",
            "anonymous" : "1",
            "ssl" : "0"
        },
        {
            "ip" : "171.39.1.149",
            "port" : "8123",
            "anonymous" : "1",
            "ssl" : "1"
        }
        .
        .
        .
    ]
}
```

**架构**：

判断本地是否已存在数据库:

+ =>True: 返回数据库句柄，pass
+ =>False: 建立数据库，进行创建表等初始化工作，请求代理网站并筛选，将IP插入数据库，返回句柄

开启监听，提供API:

+ /proxy?get: 查询数据库，并返回数据库中全部代理
+ /proxy?reflush: 检查数据库已存在代理的可用性；请求代理网站获取IP，将可用IP插入数据库

**验证策略**：

请求[chinaz](http://ip.chinaz.com/getip.aspx)

+ http代理: 代理IP与响应IP相同 && 请求成功 && 请求响应 <= 5s

+ https代理: 请求成功 && 请求响应 <= 5s

**代理**：

- [西刺](http://www.xicidaili.com)
- [66ip](http://www.66ip.cn)
- [proxylist](https://list.proxylistplus.com)

***

**学习总结**

+ `json.Marshal`只编码包级公有变量
+ `range`遍历channel时会阻塞直到channel被关闭，变量push完成后应`defer close(channel)`
+ 缓冲channel当FIFO队列很好用
+ `http.Client`的很多属性是`Transport` 提供的
+ `[]byte`不能与`nil`外的类型进行`==`比较，`string`可以，所以可转换`string([]byte)`后比较
+ Http Server是由`http.NewServeMux`运作，如未显式声明（`http.ListenAndServe`函数传参`http.Handler`为`nil`）则是默认`DefaultMux`