---
layout: post
title: "隔壁师大教务系统模拟登录"
summary: "针对江苏师大教务系统的模拟登录爬虫"
featured-img: emile-perron-190221

---

***
# 前言
**最后一篇爬虫技术文**
**师大的教务网对登录加密不是很复杂（准确的说是并没有加密....），但还是走了些坑，不过总体应该只用了一个小时左右，这里记录一种登录验证的新方式**
**以师大教务网的验证方式，盗cookie的杀伤力应该是很大的( :**
***
# 正文
这几天的电工材力机原计算方法简直令人窒息，闲暇之余，问一个好朋友借了师大的账号密码尝试爬教务网站
首先还是看看页面源代码
![教务系统登录界面](https://upload-images.jianshu.io/upload_images/11356161-8f7c658c6f999cf0.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
源代码翻到最下看到登录加密的js
![页面源代码](https://upload-images.jianshu.io/upload_images/11356161-36d94c147e53fbf6.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
```
<script type="text/javascript">var Login = {forwardUrl:'http://myu.jsnu.edu.cn/index.portal',loginURL:'userPasswordValidate.portal',nameField:'Login.Token1',pwdField:'Login.Token2',isVPN:'isVPN',gotoUrl:'http://myu.jsnu.edu.cn/loginSuccess.portal',gotoFailUrl:'http://myu.jsnu.edu.cn/loginFailure.portal',hideCaptcha:true};</script>

```
点击script/portal-login.js查看
主要登录函数为以下两个
```
function doLogin($) {
    Event.stop($);
    hideMsg();
    if (!valid.validate())return;
    if (!hf) {
        var _ = document.createElement("div"), A = ["<form action=\""];
        A.push(Login["loginURL"], "\" method=\"post\" target=\"loginFrame\"><input type=\"hidden\" name=\"", Login["nameField"], "\"/><input type=\"hidden\" name=\"", Login["pwdField"], "\"/><input type=\"hidden\" name=\"", Login["isVPN"], "\"/><input type=\"hidden\" name=\"goto\" value=\"", Login["gotoUrl"], "\"/><input type=\"hidden\" name=\"gotoOnFail\" value=\"", Login["gotoFailUrl"], "\"/></form><iframe name=\"loginFrame\"></iframe>");
        _.innerHTML = A.join("");
        _.style.display = "none";
        document.body.appendChild(_);
        hf = _.firstChild
    }
    hf[Login["nameField"]].value = lf.user.value;
    hf[Login["pwdField"]].value = lf.pwd.value;
    if(lf.isVPN.checked){
        //alert(lf.isVPN.value);
        hf[Login["isVPN"]].value = lf.isVPN.value;
    }
    hf.submit();
    showMask(lf)
}

```
```
function handleLoginSuccessed() {
    location.href = Login["forwardUrl"] ? Login["forwardUrl"] : "index.portal"
}
function handleLoginFailure(_, $) {
    var A = function ($) {
        hideMask();
        lf.captcha.value = "";
        lf.pwd.value = "";
        lf.pwd.focus();
        if (cContent && !cContent.visible())cContent.show();
        reloadCaptcha();
        showMsg(/<error>(.*)<\/error>/i.test($) ? RegExp.$1 : $)
    };
    if (_)new Ajax.Request("thirdpartyUserPasswordValidate.portal", {parameters: "userName=" + lf.user.value + "&password=" + lf.pwd.value + "&s=" + Math.random(), onSuccess: function (_) {
        var $ = _.responseText;
        if ($.indexOf("yes") > -1)handleLoginSuccessed(); else A($)
    }}); else A($)
}

```
之后F12查看了一下请求
惯性思维先查看了post请求
![post请求参数](https://upload-images.jianshu.io/upload_images/11356161-16338bfe0b994760.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
发现是以url的params形式提交的参数，而且好像不是登录凭证

![所有请求](https://upload-images.jianshu.io/upload_images/11356161-37e767d37d67a049.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
之后查看了所有http请求，无一例外没有提交的参数，当时懵逼了一下，想到查看最初js代码里的`loginURL:'userPasswordValidate.portal'`，然而浏览器并没有捕捉到这个请求
***
## burp抓包
接着选择使用burp监听所有http请求
在这里找到了请求loginURL的请求
![](https://upload-images.jianshu.io/upload_images/11356161-ebeb36931dafd86e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
**不出意外提交的登录凭证在这里：login.token**
接着它参数里的goto和gotoonfail又误导了我，此处不多说.....
之后查看了请求页面发现提交了两个cookie
![](https://upload-images.jianshu.io/upload_images/11356161-edec8bfe3a855bef.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
**再回到先前对loginurl的请求初，查看响应头的set-cookie字段，即登录凭证cookie**
![](https://upload-images.jianshu.io/upload_images/11356161-ae7f9896e96c9614.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

![](https://upload-images.jianshu.io/upload_images/11356161-41ea71d89aca76c1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

***

![](https://upload-images.jianshu.io/upload_images/11356161-1fc4f77617b20da0.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
接着用浏览器查看请求的cookie，发现确实如此

**师大的教务网用了ajax，两次请求index.portal页面，第二次通过登录凭证cookie验证**
然后就顺理成章的登录成功
![](https://upload-images.jianshu.io/upload_images/11356161-ebcf5ed134136077.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

![](https://upload-images.jianshu.io/upload_images/11356161-2ed7cd115549e081.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
整个页面分为四到五个部分由ajax异步加载，这里只获取了主页面的html，其余几部分的原理是相同的
***
**最后贴上代码，随手写的，仅供参考**
```swift
import requests
url1 = 'http://myu.jsnu.edu.cn/index.portal'
url2 = 'http://myu.jsnu.edu.cn/userPasswordValidate.portal'
kv = {'Host':'myu.jsnu.edu.cn',
      'Referer':'http://myu.jsnu.edu.cn/index.portal',
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:56.0) Gecko/20100101 Firefox/56.0'}
cv = {
      'Host': 'myu.jsnu.edu.cn',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:56.0) Gecko/20100101 Firefox/56.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'http://myu.jsnu.edu.cn/?user=&pwd=&btn=%E7%99%BB%E5%BD%95&captcha=%E9%AA%8C%E8%AF%81%E7%A0%81',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '170',
      'Connection': 'close',
      'Upgrade-Insecure-Requests': '1'
     }
cv1 = {
      'Host': 'myu.jsnu.edu.cn',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:56.0) Gecko/20100101 Firefox/56.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'http://myu.jsnu.edu.cn/index.portal',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
     }
data = {
       'Login.Token1':'',
       'Login.Token2':'',
       'isVPN':'',
       'goto':'http://myu.jsnu.edu.cn/loginSuccess.portal',
       'gotoOnFail':'http://myu.jsnu.edu.cn/loginFailure.portal'
       }
r=requests.session()
req = r.get(url1,headers = kv)
print(req.cookies)
cookies1 = str(req.cookies).split('=')[1].split(' ')[0]
cv.update({'Cookie':'JSESSIONID='+cookies1})
req1 = r.post(url2,headers = cv,data = data)
cookies2 = str(req1.headers['Set-Cookie'].split('=')[1].split(';')[0])
print(cookies2)
cv1.update({'Cookie':'JSESSIONID='+cookies1+'; iPlanetDirectoryPro='+cookies2})
print(cv1)
req2 = r.get(url1,headers =cv1)
print(req2.text)
```
这里的cookies我是将其转为字符串然后进行切片拼接处理
登录成功的后续爬虫操作就不写了，常规操作，简单的bs4库和RegExp处理一下就好
***
**好了这是最后一篇爬虫文了，毕竟只是把爬虫当成一种娱乐工具，以后就主要更网安学习文**
![](https://upload-images.jianshu.io/upload_images/11356161-92029a510e662f89.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

**P.S写点心情：今天真的很开心，下午打球后做实验，完了晚上回来吹了半小时笛子后写了这篇文，待会健身完洗个澡有一晚上自由支配时间，如果没有专业课压力，能以兴趣为导向，在无负面影响的前提下最大限度的获得对时间支配的自由，应该是最令人向往的事情。**


**P.p.s 巧的是耳机里正放着陈奕迅的任我行，真是很应景啊**
![](https://upload-images.jianshu.io/upload_images/11356161-3c2ab89227e7f870.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

**P.p.p.s当然心情好还有一个原因！明天上午上完课就是清明四天假了!!!**

# end
# 2018.4.3
***
>《任我行》

*天真得只有你*

*令神仙鱼归天要怪谁*

*以为留在原地不够遨游*

*就让它沙滩里戏水*

*那次得你冒险半夜上山*

*争拗中队友不想撑下去*

*那时其实尝尽真正自由*

*但又感到没趣*

*不要紧 山野都有雾*

*顽童亦学乖不敢太勇敢*

*世上有多少个缤纷乐园 任你行*

*从何时你也学会不要离群*

*从何时发觉没有同伴不行*

*从何时惋惜蝴蝶困于那桃源*

*飞多远有谁会对它操心*

*曾迷途才怕追不上满街赶路人*

*无人理睬如何求生*

*顽童大了没那么笨*

*可以聚脚于康庄旅途然后同沐浴温泉*

*为何在雨伞外独行*

*这么多好去处*

*漫游到独家村去探谁*

*既然沿着寻梦之旅出发*

*就站出点吸引赞许*

*逛够几个睡房到达教堂*

*仿似一路飞奔七八十岁*

*既然沿着情路走到这里*

*尽量不要后退*

*亲爱的闯遍所有路灯*

*还是令大家开心要紧*

*抱住两厅双套天空海阔 任你行*

*从何时你也学会不要离群*

*从何时发觉没有同伴不行*

*从何时惋惜蝴蝶困于那桃源*

*飞多远有谁会对它操心*

*曾迷途才怕追不上满街赶路人*

*无人理睬如何求生*

*顽童大了没那么笨*

*可以聚脚于康庄旅途然后同沐浴温泉*

*为何在雨伞外独行*

*亲爱的 等遍所有绿灯*

*还是让自己疯一下要紧*

*马路戏院商店天空海阔 任你行*

*从何时开始忌讳空山无人*

*从何时开始怕遥望星尘*

*原来神仙鱼横渡大海会断魂*

*听不到世人爱听的福音*

*曾迷途才怕追不上满街赶路人*

*无人理睬如何求生*

*顽童大了没那么笨*

*可以聚脚于康庄旅途然后同沐浴温泉*

*为何在赤地上独行*

*顽童大了别再追问*

*可以任我走怎么到头来又随着大队走*

*人群是那么像羊群*
