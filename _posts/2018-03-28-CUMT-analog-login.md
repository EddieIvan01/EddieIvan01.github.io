---
layout: post
title: CUMT教务系统模拟登录
summary: 针对矿大新版教务系统RSA加密的模拟登录爬虫，以及自动查询成绩
featured-img: shane-rounce-205187

---


## 没爬过自己学校教务网站怎么能说自己会敲爬虫 : )

在此记录模拟登录cumt教务系统

Demo

![](https://upload-images.jianshu.io/upload_images/11356161-905be1d471c051ea.gif?imageMogr2/auto-orient/strip)

## 正文

[教务系统网址](http://202.119.206.62/jwglxt/xtgl/login_slogin.html?language=zh_CN&_t=)

![](https://upload-images.jianshu.io/upload_images/11356161-6208a857aaba9728.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

和许多学校相同，都是正方教务系统（ummm正方和煎蛋难兄难弟）

**查看源代码**

![](https://upload-images.jianshu.io/upload_images/11356161-ca74d528df64b6ec.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

可以看到由五个js进行登录加密，为RSA加密，不了解rsa的看这里：[RSA加密](https://blog.csdn.net/clj198606061111/article/details/9090407)

**提交表单**

![](https://upload-images.jianshu.io/upload_images/11356161-9adc7dac5ae6735e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

post的数据包括csrf令牌以及明文的yhm（即学号，我随便敲的），和base64加密的mm(提交了两次)，即密码

**csrftoken**

用来防止跨站请求伪造

源代码中搜索，找到随机生成的token表单value

![](https://upload-images.jianshu.io/upload_images/11356161-757bfc9d63e2d989.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

**登录加密**

![](https://upload-images.jianshu.io/upload_images/11356161-5df3d30dc1664490.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

查看login.js

找到获取公钥私钥的地址

![](https://upload-images.jianshu.io/upload_images/11356161-8a7333209254b4fd.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

**cookies问题**

使用requests库的requests.session()保持会话即可


## 登录逻辑：从登录页面获取csrftoken，请求login_getpublickey.html提交时间参数获取rsa密钥，对获取到的密钥base64解密，用密钥对登录密码进行rsa加密，对密文再进行base64加密，最后post

*** 

**rsa加密是最麻烦的地方**

由于使用标准库中的`base64`会将hex串转为字节，而这里的`RSA`密钥则是需要完整的hex字符串，例如标准库中`a0 => YTA=`，而我需要`a0 => oA==
`即将`a0`看作一个字节的hex值进行编码。

故写了个`base64 => hex`的算法: 

```python
class HB64(object):

    b64byte = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    b64cpt = "="

    def hex2b64(self, string):
        result = ""
        ptr = 0
        b1 = int("111111000000000000000000", 2)
        b2 = int("000000111111000000000000", 2)
        b3 = int("000000000000111111000000", 2)
        b4 = int("000000000000000000111111", 2)
        lenth = len(string)
        while ptr+6 <= lenth:
            temp = int(string[ptr:ptr+6], 16)
            result += self.b64byte[(temp & b1) >> 18] 
            result += self.b64byte[(temp & b2) >> 12]
            result += self.b64byte[(temp & b3) >> 6]
            result += self.b64byte[temp & b4]
            ptr += 6
        if lenth-ptr == 4:
            temp = int(string[ptr:ptr+4], 16) << 2
            result += self.b64byte[(temp & b2) >> 12]
            result += self.b64byte[(temp & b3) >> 6]
            result += self.b64byte[temp & b4]
            result += self.b64cpt
        elif lenth-ptr == 2:
            temp = int(string[ptr:ptr+2], 16) << 4
            result += self.b64byte[(temp & b3) >> 6]
            result += self.b64byte[temp & b4]
            result += self.b64cpt * 2
        elif lenth-ptr == 0:
            pass
        else:
            raise Exception
        return result

    def b642hex(self, string):
        result = ""
        ptr = 0
        lenth = len(string)
        b1 = int("111111110000000000000000", 2)
        b2 = int("000000001111111100000000", 2)
        b3 = int("000000000000000011111111", 2)
        while ptr+8 <= lenth:
                temp = string[ptr:ptr+4]
                temp_result = 0
                for cell in range(4):
                    temp_result += self.b64byte.index(temp[cell]) << (6 * (3 - cell))
                r1 = hex((temp_result & b1) >> 16)[2:]
                r2 = hex((temp_result & b2) >> 8)[2:]
                r3 = hex(temp_result & b3)[2:]
                if len(r1) == 1:
                    r1 = '0' + r1
                if len(r2) == 1:
                    r2 = '0' + r2
                if len(r3) == 1:
                    r3 = '0' + r3
                result += r1
                result += r2
                result += r3
                ptr += 4
        if string[-1]=="=" and string[-2]=="=":
            temp = string[ptr:ptr+2]
            temp_result = 0
            temp_result += self.b64byte.index(temp[0]) << 18
            temp_result += self.b64byte.index(temp[1] >> 4) << 12
            r1 = hex((temp_result & b1) >> 16)[2:]
            r2 = hex((temp_result & b2) >> 8)[2:]
            if len(r1) == 1:
                r1 = '0' + r1
            if len(r2) == 1:
                r2 = '0' + r2
            result += r1
            result += r2

        elif string[-1]=="=":
            temp = string[ptr:ptr+3]
            temp_result = 0
            for cell in range(2):
                temp_result += self.b64byte.index(temp[cell]) << (6 * (3 - cell))
            temp_result += self.b64byte.index(temp[2] >> 2) << 6
            r1 = hex((temp_result & b1) >> 16)[2:]
            r2 = hex((temp_result & b2) >> 8)[2:]
            r3 = hex(temp_result & b3)[2:]
            if len(r1) == 1:
                r1 = '0' + r1
            if len(r2) == 1:
                r2 = '0' + r2
            if len(r3) == 1:
                r3 = '0' + r3
            result += r1
            result += r2
            result += r3
        elif "=" not in string:
            temp = string[ptr:ptr+4]
            temp_result = 0
            for cell in range(4):
                temp_result += self.b64byte.index(temp[cell]) << (6 * (3 - cell))
            r1 = hex((temp_result & b1) >> 16)[2:]
            r2 = hex((temp_result & b2) >> 8)[2:]
            r3 = hex(temp_result & b3)[2:]
            if len(r1) == 1:
                r1 = '0' + r1
            if len(r2) == 1:
                r2 = '0' + r2
            if len(r3) == 1:
                r3 = '0' + r3
            result += r1
            result += r2
            result += r3
        else:
            raise Exception
        return result
```

`RSA`加密参考stackoverflow文章[戳我](https://stackoverflow.com/questions/40094108/i-have-a-rsa-public-key-exponent-and-modulus-how-can-i-encrypt-a-string-using-p)，用了github上别人写的`JS`加密的python程序

**代码**

```python
class httpmthd():
    sessions = requests.session()
    time = int(time.time())

    def __init__(self,user,passwd):                       
        self.user = str(user).encode("utf8").decode("utf8")
        self.passwd = str(passwd).encode("utf8").decode("utf8")

    def get_public(self):                       #获得rsa公钥json保存在pub字典中
        url = 'http://202.119.206.62/jwglxt/xtgl/login_getPublicKey.html?time='+str(self.time)
        r = self.sessions.get(url)
        self.pub = r.json()

    def get_csrftoken(self):                    #提取token
        url = 'http://202.119.206.62/jwglxt/xtgl/login_slogin.html?language=zh_CN&_t='+str(self.time)
        r = self.sessions.get(url)
        r.encoding = r.apparent_encoding
        soup = BeautifulSoup(r.text,'html.parser')
        self.token = soup.find('input',attrs={'id':'csrftoken'}).attrs['value']

    def process_public(self,str):               #处理密码,rsa加密
        self.exponent = Base64().b64_to_hex(self.pub['exponent'])           #将json中的base64加密公钥解密
        self.modulus = Base64().b64_to_hex(self.pub['modulus'])
        rsa = RSAJS.RSAKey()
        rsa.setPublic(self.modulus, self.exponent)                          #rsa加密
        cry_data = rsa.encrypt(str)
        return Base64().hex_to_b64(cry_data)                                #加密后的数据进行base64加密

    def post_data(self):                        #post数据
        try:
            url = 'http://202.119.206.62/jwglxt/xtgl/login_slogin.html'
            header = {
                'Accept':'text/html,application/xhtml+xm…plication/xml;q=0.9,*/*;q=0.8',	
                'Accept-Encoding':'gzip, deflate',
                'Accept-Language':'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                'Connection':'keep-alive',
                'Content-Length':'470',
                'Content-Type':'application/x-www-form-urlencoded',
                'Host':'202.119.206.62',
                'Referer':'http://202.119.206.62/jwglxt/xtgl/login_slogin.html?language=zh_CN&_t='+str(self.time),
                'Upgrade-Insecure-Requests':'1',
                'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/58.0',	
            }
            self.header = header 
            data = [
                ('csrftoken',self.token),
                ('mm',self.process_public(self.passwd)),             #对密码进行加密
                ('mm',self.process_public(self.passwd)),             #post的data数据有两个相同mm字段
                ('yhm',self.user)
            ]
            self.req = self.sessions.post(url,headers = header,data = data)
            ppot = r'用户名或密码不正确'
            if re.findall(ppot,self.req.text):
                print('用户名或密码错误,请查验..')
                time.sleep(2)
                exit()
        except:
            print('登录失败,请检查网络配置或检查账号密码...')
            time.sleep(1)
            exit()
```



放上代码地址，使用时导入login.py，调用httpmthd类即可

[github地址](https://github.com/EddieIvan01/Analog_Login)

此处的requests库会有一个编码问题，按报错把库文件代码里某处的'latin1'改为'utf-8'就可以解决

模拟登录后顺便做了成绩获取


打算有时间了敲一个多线程暴力抢课脚本，但是很狗的是，敲完程序测试的机会就只有学期末抢课那几天，这学期敲好调试好要等到过一学期才能拿来用 ( :

![](https://upload-images.jianshu.io/upload_images/11356161-c88a2b2117a5fab6.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/113)

好了不管这些，反正模拟登录成功后就可以为所欲为了

![](https://upload-images.jianshu.io/upload_images/11356161-0a8507cde14bfdc9.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/110)

***

**selenium脚本**

![](https://upload-images.jianshu.io/upload_images/11356161-7898c75ede85c5ca.gif?imageMogr2/auto-orient/strip%7CimageView2/2/w/300)

除了利用RSA加密密码外，还可以使用selenium直接提交表单

![](https://upload-images.jianshu.io/upload_images/11356161-472e9d1d7aa98aee.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

缺点是button的click()有几率失效，网上有解决办法，不多讨论

P.s在此强烈谴责selenium喜新厌旧的行为！！！居然抛弃了PhantomJS转投火狐和chrome的无头版本，然而火狐无头实例化耗时比phantom多了不少

而且既然不支持phantom，为啥库文件里还是有phantom的包，直到运行的时候才报错说phantom已经过时了，请使用火狐或谷歌...莫名其妙.jpg

![](https://upload-images.jianshu.io/upload_images/11356161-d752e3235a60d11c.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/259)

***


更多思路

还可以node.js本地运行js加密，或者提交到在线rsa加密网站

反正方法有很多，没有验证码也可以说对爬虫很友好了

![](https://upload-images.jianshu.io/upload_images/11356161-3e0b4dcfe9cfd18d.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/700)

***


## 第一篇博客文章end：)

## 2018.3.28



