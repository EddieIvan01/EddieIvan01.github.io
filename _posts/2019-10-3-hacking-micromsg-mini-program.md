---
title: hacking MicroMsg mini program
summary: 微信小程序——小游戏神手的简单破解
featured-img: wx-ss
layout: post
---

前段时间迷上了一个小游戏神手，对锻炼左右脑很有好处o_o。好久没玩，下午突然想到便尝试了对其的破解（之前也写过用ADB来hack跳一跳的，不过那个算纯黑盒）

微信小程序在传统意义上属于前端应用，所以本质就是不安全的。仅仅想依靠前端的混淆来隐藏源码和接口，依靠签名来保证接口不被盗用用，依靠SSL certificate来保证不被mitm是不靠谱的，仅仅能够增加攻击成本而已

***

简单介绍一下，微信小程序使用前端三件套进行开发（虽然换了个名字）

首先使用Fiddler+Android模拟器代理抓包，本以为需要Xposed绕过SSL pinning，但发现小程序的开发者SSL证书没有被app本身pinning，所以这一步省掉也只需要导入Fiddler cert为根证书了

登录过程的数据包是这样的（没图床，脑补一张fiddler数据包图），可以看到通信的域名为`max.wanzhushipin.cn`

接着试着玩一局，因为我不清楚每个参数的含义，所以可以多玩几局来推断。设置几个模拟按键来尝试

抓了两个report数据包

```
GET https://mas.wanzhushipin.cn/uo/1.1.5/uo/report?continue=0&help=0&id=0&level=0&mark=43.75875000000009&shares=0&tick=1570094323&uid=xxxxx&key=4c15bad54ad61f12d6b19318502714ab HTTP/1.1


GET https://mas.wanzhushipin.cn/uo/1.1.5/uo/report?continue=0&help=0&id=0&level=0&mark=147.72954000000078&shares=0&tick=1570094346&uid=xxxxx&key=5e2cea478b859137d507b3c1b691f926 HTTP/1.1
```

响应是

```
HTTP/1.1 200 OK
Date: Thu, 03 Oct 2019 09:19:08 GMT
Content-Type: text/html
Connection: keep-alive
Server: nginx
Vary: Accept-Encoding
Access-Control-Allow-Origin: *
Vary: Accept-Encoding
Content-Length: 72

{"id":3668836013,"challengeid":0,"cards":"8","rank":0,"code":0}
```

裸猜一下，mark是分数 * 10，tick是timestamp，key是signature，uid我打码了

那么重放一下试试

```python
import requests

url = 'https://mas.wanzhushipin.cn/uo/1.1.5/uo/report?continue=0&help=0&id=0&level=0&mark=1177.4020999998797&shares=0&tick=1570089005&uid=xxxxx&key=67427f970e98c42130eb64e1009064b4'


h = {
        'charset': 'utf-8',
        'Accept-Encoding': 'gzip',
        'referer': 'https://servicewechat.com/wx3c889b4f402e924e/110/page-frame.html',
        'content-type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; google Pixel 2 Build/LMY47I; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36 MicroMessenger/7.0.6.1460(0x27000634) Process/appbrand2 NetType/WIFI Language/zh_CN',
        'Host': 'mas.wanzhushipin.cn',
        'Connection': 'Keep-Alive',
}

r = requests.get(url, headers=h)
print(r.text)
```

没问题的，说明后端没有对时间戳进行校验。接着尝试修改一下分数或其他参数，发现后端返回非法调用

```
{"error":"\u975e\u6cd5\u8c03\u7528","code":-1}
```

说明后端将整个query参数进行签名，因为具体参数拼接方式和是否加了salt未知，所以仅仅依靠fuzz很难通过签名校验了

***

于是尝试下载小程序的源码，使用模拟器的文件管理器就可以了（root都免了）

路径是`/data/data/com.tencent.mm/MicroMsg/[32bytes hash]/appbrand/pkg`

小程序的打包后缀名是`.wxapkg`

down下来使用`https://github.com/qwerty472123/wxappUnpacker`解包

`npm i`装完依赖后，`node wuWxapkg.js xx.wxapkg`

***

拿到源码发现是用Webpack打包过的，应该不会有人会去硬读3W行代码。所以更好的办法装一个微信开发者工具来debug，但是抵制小程序从开发者做起，就不往磁盘里塞垃圾了

`grep -rn "1.1.5/uo/report"`瞅一眼

```
PS C:\Users\40691\Desktop\wx\ss> grep -rn "1.1.5/uo/report"
code.js:17937:        var s = this.mURL + "1.1.5/uo/report?" + util.getUrlParams(i, "1.0.3");
```

定位到getUrlParams.......算了，这并不是一篇教程，所以具体怎么回溯就不细写了，太麻烦了，过程其实挺简单的

拼出签名脚本，整个逻辑也就是根据版本号选择salt，再将salt和query params拼接生成签名，将签名当作key参数

```javascript
var md5 = require('./md5.js')

let t = {}

t.mKeys = {
        "1.0.1": "fatality",
        "1.0.3": "vicky2009",
        "1.0.5": "kivi2017",
        "1.0.7": "kivi2018",
        "1.0.9": "fczlm3",
        "1.1.0": "vicky2017"
};

var p = [];
p.mark = 11077.4020999998797
p.uid = xxxxxx
p.id = 0
p.level = 0
p.shares = 0
p.continue = 0
p.help = 0

getUrlParams = (e, i) => {
        void 0 === i && (i = "1.0.1");
        var s = !1, n = new Array();
        for (var a in e) if ("string" == typeof e[a] || "number" == typeof e[a]) {
            "tick" == a && (s = !0);
            var r = a.toLocaleLowerCase();
            e[r] = e[a], n.push(r);
        }
        if (0 == s) {
            var o = new Date();
            e.tick = Math.floor(o.getTime() / 1e3), n.push("tick");
        }
        n.sort(function(t, e) {
            return t > e ? 1 : -1;
        });
        for (var h = "", l = 0; l < n.length; l++) h = h + n[l] + "=" + e[n[l]] + "&";
        var u = "";
        return u = md5(null != t.mKeys[i] ? h + "key=" + t.mKeys[i] : h + "key=fatality"), 
        h + "key=" + u;
    }

console.log(getUrlParams(p, "1.0.3"))
```

md5.js是util库，从src里copy出来的。然后把mark改为要刷的分 * 10，把生成的query params粘贴到上面的重放脚本里就行了

为了方便，合并一下

```python
import requests
import time
from hashlib import md5

mark = 20120.872159698898
tick = int(time.time())

args = ('continue=0&help=0&id=0&level=0&'
        'mark={}&shares=0&'
        'tick={}&uid=xxxxx&key=').format(mark, tick)
args = args + md5(args.encode()+b'vicky2009').hexdigest()

url = 'https://mas.wanzhushipin.cn/uo/1.1.5/uo/report?' + args

h = {
        'charset': 'utf-8',
        'Accept-Encoding': 'gzip',
        'referer': 'https://servicewechat.com/wx3c889b4f402e924e/110/page-frame.html',
        'content-type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; google Pixel 2 Build/LMY47I; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36 MicroMessenger/7.0.6.1460(0x27000634) Process/appbrand2 NetType/WIFI Language/zh_CN',
        'Host': 'mas.wanzhushipin.cn',
        'Connection': 'Keep-Alive',
}

r = requests.get(url, headers=h)
print(r.text)
```

然后就可以任意刷分了。当然，刷分并不是目的，hacking的过程才是最有趣的
