---
layout: post
title: CUMT公选课抢课脚本
summary: Lessons Robber多线程暴力抢课脚本
featured-img: lesson
---

**Demo**

![](https://upload-images.jianshu.io/upload_images/11356161-9d4ba3a89d6d8637.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

又到了一学期一度选课的日子，上午十点开放选课系统开始，花了三个小时，写好了抢课脚本，中间遇到了一点玄学...虽然程序写好了，但因为这些玄学，我陷入了思考人生中....

由于几个月前我写好了[教务系统模拟登录](http://nemesisly.xyz/CUMT-analog-login/)的代码，所以这次只需要导入上次的包，继承`Loginer`再用`sessions`成员发请求就好了。这里总结一下敲代码过程中出现的问题

+ 首先是父类的初始化，Python3只需要`super()`函数就可以了，而Python2中是需要传入子类的，要求argument>=1。当调用初始化函数`__init__()`时需`super().__init__()`来初始化父类中的成员变量，调用构造函数`__new__()`时需：`super().__new__(cls)`，即使用父类来构建子类实例。 `super()`函数主要是用作菱形继承中的`MRO`父类初始化，它只能引用父类的初始成员变量，成员函数动态生成的属性它是无法访问的
+ 在这种I/O密集（网络I/O）的程序下，多线程是个好选择。因为Cpython的GIL是针对CPU运算密集的，当处于I/O等待时多线程会自动切换，且多进程程序进程切换花销高于线程，故选择多线程。其实最佳是事件循环的协程
+ 为了能在一个线程抢课成功后退出其他线程，引入了一个全局变量，在每个线程发起请求前会先判断这个全局变量的值，当一个线程抢课成功时会修改这个全局变量，以便达到同步退出。当我最初用多进程的时候，发现多进程不支持全局变量的共享，因为在每一个子进程中都会有一个全局变量的数据副本，如想共享内存，应使用`multiprocessing.Value`或在进程池中使用`multiprocessing.manager`（manager基于网络通信）。
+ 为了解决`Cookie`过期问题，在每个线程`Target`函数前判断请求后的页面长度，假如`Cookie`过期会返回302指向登录页面，`requests`默认会跟进302，故lenth有40000字节，如正常请求则返回的是几十字节的`json`。如`Cookis`过期，再次调用子对象的登录函数刷新成员`Cookie`变量
+ 再有就是玄学问题，两个headers，cookie，data都相同的post请求一个会返回400 Bad Request；当我用移动宽带或VPS访问的时候也会返回400。此处400为请求参数错误。玄学问题困扰了我很久。而且在我调试的时候，打印响应的状态码，连着手机热点时请求正常返回200，换到宽带瞬间变成400，[CSDN上有人相同的情况](https://bbs.csdn.net/topics/390131855)，可能是ISP线路问题导致丢包，但浏览器请求完全正常。嗯这一定是玄学

核心请求函数：

```python
def lessons(self, no):
        global THREAD_FLAG
        url = 'http://jwxt.cumt.edu.cn/jwglxt/xsxk/zzxkyzb_xkBcZyZzxkYzb.html?gnmkdm=N253512&su='+self.user
        print('[*]Thread-'+no+' Start')
        while True:
            if THREAD_FLAG:
                try:
                    response = requests.post(url,data = self.rob_data,headers = self.header_2,timeout = 5)
                    if len(response.text) > 10000:
                        #self.reflush_time()
                        #self.get_public()
                        #self._get_csrftoken()
                        #self.post_data()
                        self.login_us()
                    print('[*]Thread-'+no+'  请求成功')
                    if response.json()['flag'] != '1':
                        print('[*]Thread-'+no+'  异常!')
                        print('[*]异常状态码: '+response.json()['msg'])
                        raise Exception
                    print('[*]Thread-'+no+'  Success!')
                    print('[*]'+self.kcmc+'  抢课成功!')
                    print('[*]程序即将退出...')
                    THREAD_FLAG = False
                except KeyboardInterrupt:
                    sys.exit()
                except:
                    print('[*]Thread-'+no+'  Fail')
            else:
                print('[*]Thread-'+no+' Close')
                return
```

***

想要挂在VPS上抢课，但东京的IP访问不到教务系统，o(︶︿︶)o 

抢课程序的弊端，post到服务器的变量全是拼音拼写（不知道哪儿请的外包程序员），有很多暂时不清楚啥意思，实在猜不出来，故可能针对不同学院不同年级会出现普适性差的情况。再有就是这个程序需要课程代码，所以很难做到在系统开放前就启动程序的场景，大多数时候是挂着监控捡漏。

***

[CUMT公选课抢课脚本](https://github.com/EddieIvan01/Lessons_Robber)

需要将模拟登录代码与抢课代码放于同一目录下，并修改`config.json`，具体使用说明见README

***

2018/7/8  23:45

![](https://upload-images.jianshu.io/upload_images/11356161-f0b8307e59fd11e0.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

洗个澡的功夫抢课成功了，终于修满公选课学分了
