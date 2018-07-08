---
layout: post
title: CUMT公选课抢课脚本
summary: 多线程暴力抢课脚本
featured-img: lesson
---

**Demo**

![](https://upload-images.jianshu.io/upload_images/11356161-9d4ba3a89d6d8637.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

又到了一学期一度选课的日子，上午十点开放选课系统开始，花了五个小时，写好了抢课脚本，中间遇到了很多玄学...虽然程序写好了，但因为这些玄学，我陷入了思考人生中....

由于几个月前我写好了[教务系统模拟登录](http://nemesisly.xyz/CUMT-analog-login/)的代码，所以这次只需要导入上次的包，新建一个类继承模拟登录代码就好了。这里总结一下敲代码过程中出现的问题

+ 首先是父类的初始化，Python3只需要super()函数就可以了，而Python2中是需要传入子类的，要求argument>=1
+ super()函数主要是用作多重继承，它只能引用父类的初始成员变量，成员函数动态生成的属性它是无法访问的
+ 关于requests.Session()对象，我一直是用它来保存Cookie，经过这次我发现它的Cookie是会像浏览器一样保存在本地的，甚至火狐浏览器也可以使用它保存的Cookie。而且，在同一个库文件下的继承可以获得同样的Session对象，而当我导入外部包时，从子类中调用父类对象中的Session对象时，它没有父类成员函数运行后保存下来的Cookie，这个地方的原因暂时未知，我猜想可能Session对象保存的Cookie是默认一个文件一个保存？这里最后我在父类新引入了成员变量保存Cookie，在外部包的子类中使用它
+ 在这种I/O密集（网络I/O）的程序下，多线程是个好选择。因为Cpython的GIL是针对CPU运算密集的，加上多进程程序进程切换花销高于线程，故选择多线程。在这里异步I/O的作用也不大，因为程序的核心仅仅是发起请求，不然我还是很想尝试acyncio库和aiohttp库的
+ 为了能在一个线程抢课成功后退出其他线程，我引入了一个全局变量，在每个线程发起请求前会先判断这个全局变量的值，当一个线程抢课成功时会修改这个全局变量，以便达到同步退出。当我最初用多进程的时候，发现多进程会不支持全局变量的共享。
+ 为了解决Cookie过期问题，我在每个线程Target函数前判断请求后的页面长度，假如Cookie过期会返回302会指向登录页面，lenth有40000字节，如正常请求则返回的是几十字节的json。如Cookis过期，再次调用子对象的登录函数刷新成员Cookie变量
+ 为了用户自定义线程数量，我使用了一个列表容器存储线程实例化的对象，此处感叹Python语言的优雅，容器什么都能装，并遍历容器来调用Thread的Start函数
+ 再有就是一些玄学问题，两个headers，cookie，data都相同的post请求一个会返回400 Bad Request；当我用移动宽带或VPS访问的时候也会返回400。此处：400为请求参数错误。玄学问题困扰了我很久。而且在我调试的时候，打印响应的状态码，连着手机热点时请求正常返回200，换到宽带瞬间变成400，[CSDN上有人相同的情况](https://bbs.csdn.net/topics/390131855)，可能是ISP线路问题导致丢包，但浏览器请求完全正常。嗯这一定是玄学

核心代码：
```python
def lessons(self,no):
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

需要将模拟登录代码与抢课代码放于同一目录下，并修改config.json，具体使用说明见README
