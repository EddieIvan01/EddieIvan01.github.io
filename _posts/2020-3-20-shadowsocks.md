---
layout: post
featured-img: ss
title: ShadowSocks重定向攻击
summary: 关于ShadowSocks重定向攻击，说点不同的
---

## 漏洞成因/细节/危害

这几点就不再赘述了，网上分析文章够多了

需要提一下的是，随然网上的文章几乎都是用AES-CFB举例子，但该攻击针对的是所有不带MAC的流密码，包括ChaCha，RC4等流密码算法和OFB/CFB/CTR等工作模式。因为攻击点就出在利用随机比特流和密文做异或，却没有做完整性校验

ss压根就不支持ECB/CBC等模式，一方面是这两种分组模式本身太脆弱了，另一方面是针对TCP流转发的加密，使用分组密码则需要做额外的上层分包，对性能有影响。实际上，ECB/CBC是免疫该攻击的，但一般没人选择去用它

那么，最佳实践是什么呢？选一个AEAD算法，比如AES-GCM

## 网络编程的一些问题

### 针对TCP流转发加密的实践

我原来在知乎上回答过这样一个问题：

https://www.zhihu.com/question/28251266/answer/1018182397

提问者的问题在于没有理解流密码，针对这种TCP流转发的加密，有两种做法：

+ 对每一个Socket绑定两个Stream Cipher对象，这两个对象中保存了流密码的状态，分别负责加密和解密
+ 做上层分包，比如`[LEN] [IV] [DATA]`，LEN给2 bytes（TCP MSS），IV给16 bytes。因为TCP流read API的特性，返回的长度是个不确定值。这种做法的安全性是高于前者的，但相应的性能会有所下降

针对ss这种服务型应用，sslocal和ssserver之间的通信我推荐第二种做法，因为这种长期运行的应用安全性是首要

而一些端口转发工具，比如我写的[iox](https://github.com/eddieivan01/iox)，使用的是第一种做法，而且我选择了复用IV（实际可以选择在握手时交换随机IV）。实际上这种工具的加密功能仅仅为了绕过IDS等设备，所以没必要增加额外损耗。当然[iox](https://github.com/eddieivan01/iox)对UDP的转发，因为无连接 + 乱序的特性，只能是第二种做法，当然UDP已经为我分好包了

### ShadowSocks的实现存在的问题

我在学习重定向漏洞时顺带读了ShadowSocks v2.8.2源码，一大亮点是作者将不同系统的多路复用都抽象到了同一个接口的EventLoop中

我在读源码的过程中发现了一个实现上的问题，详情可见我在V2EX上发的帖：

https://www.v2ex.com/t/653962

谈一下13L提的问题

其实解决这个实现问题很简单，为IV设置一个buffer即可。因为ss的实现是异步的EventLoop，所以在检查IV小于16 bytes时直接return并等待下一次ON_READ事件即可，不需要像13L说的那样内部写一个循环

```python
def _on_read():
    data = self._socks.read(BUF_SIZE)
    if self.decipher is None:
        if len(data) + len(self._iv_buf) < 0x10:
            self._iv_buf += data
            return
    	else:
            data = self._iv_buf + data
    self.encryptor.decrypt(data)
```

而13L提到的问题属于slow connection，用过AWVS基本都见过，它的本质就是上层应用没有自己设置超时，而是指望TCP的2 * MSL（也就是4 min）。这里的slow connection和这个实现没有任何关系，如果要解决需要心跳机制或超时机制

### 关于Golang crypto标准库

这里额外提一下Golang里的最佳实践，先上BenchMark

```
goos: windows
goarch: amd64
pkg: crypto/cipher
BenchmarkAESGCMSeal1K-4          3795224               315 ns/op        3255.48 MB/s
BenchmarkAESGCMOpen1K-4          4064497               299 ns/op        3420.72 MB/s
BenchmarkAESGCMSign8K-4          1000000              1060 ns/op        7726.86 MB/s
BenchmarkAESGCMSeal8K-4           600849              1914 ns/op        4280.52 MB/s
BenchmarkAESGCMOpen8K-4           668456              1841 ns/op        4449.46 MB/s
BenchmarkAESCFBEncrypt1K-4        572292              1954 ns/op         521.61 MB/s
BenchmarkAESCFBDecrypt1K-4        601810              1871 ns/op         544.61 MB/s
BenchmarkAESCFBDecrypt8K-4         78639             14597 ns/op         560.85 MB/s
BenchmarkAESOFB1K-4               859376              1255 ns/op         812.24 MB/s
BenchmarkAESCTR1K-4               802176              1501 ns/op         679.04 MB/s
BenchmarkAESCTR8K-4                97852             11079 ns/op         738.97 MB/s
BenchmarkAESCBCEncrypt1K-4        802160              1386 ns/op         738.66 MB/s
BenchmarkAESCBCDecrypt1K-4        802020              1329 ns/op         770.31 MB/s


goos: windows
goarch: 386
pkg: crypto/cipher
BenchmarkAESGCMSeal1K-4            55438             21481 ns/op          47.67 MB/s
BenchmarkAESGCMOpen1K-4            55448             21566 ns/op          47.48 MB/s
BenchmarkAESGCMSign8K-4            13021             90765 ns/op          90.25 MB/s
BenchmarkAESGCMSeal8K-4             6676            165971 ns/op          49.36 MB/s
BenchmarkAESGCMOpen8K-4             6673            166650 ns/op          49.16 MB/s
BenchmarkAESCFBEncrypt1K-4        117954              9986 ns/op         102.04 MB/s
BenchmarkAESCFBDecrypt1K-4        119103              9931 ns/op         102.60 MB/s
BenchmarkAESCFBDecrypt8K-4         14926             79647 ns/op         102.79 MB/s
BenchmarkAESOFB1K-4               129374              9220 ns/op         110.53 MB/s
BenchmarkAESCTR1K-4               130738              9085 ns/op         112.16 MB/s
BenchmarkAESCTR8K-4                16594             72784 ns/op         112.48 MB/s
BenchmarkAESCBCEncrypt1K-4        122776              9504 ns/op         107.74 MB/s
BenchmarkAESCBCDecrypt1K-4        106448             11046 ns/op          92.70 MB/s
```

看到了吗，AMD64下AES-GCM简直是吊打AES-CTR，将近5X-6X，而i386下AES-GCM瞬间gg了

最初看到肯定有疑惑，GCM = CTR + GHASH，理应比CTR慢。但实际上Go标准库里，如果CPU有AES指令集，会使用AESENC指令加速，当然，仅仅GCM有这个待遇，所以你看到的速度比较实际是硬件加速的GCM和pure Go实现的其它工作模式之间的比较。而对GCM的优化也仅仅针对了AMD64、ARM64等架构

```
$ ls src/crypto/aes/*.s
asm_amd64.s  asm_arm64.s  asm_ppc64le.s  asm_s390x.s  gcm_amd64.s  gcm_arm64.s
```

而AES-GCM在Go中是AEAD接口，提供的API并不是流密码的形式，并且需要额外一倍的内存开销（没办法`XORKeyStream(bs, bs)`）

所以在Go里，如果不需要AEAD算法，建议使用Xchacha20(https://github.com/Yawning/chacha20)，经测试在AMD64 & i386下都是4X faster than AES-CTR；如果需要AEAD算法且不在上述两种架构下，建议自己实现

## 对漏洞的一些思考

### 利用场景

网上的分析中大多是通过已知HTTP响应的前7 bytes（`HTTP/1.`）解密，那么能否尝试解密请求的数据包呢？在某些情形下是可以的，但通用性远不如解密响应

我们假设这样一种情况，网关处截获了Bob的所有通信流量，但都是通过ss加密的。攻击者想解密拿到他请求Google搜索的某关键字，该怎么做？先通过明文密文异或拿到`enc_iv`（这里的明文可能是domain，也可能是IP，具体看type字段。是IP的情况下还需考虑CDN的情况，从流量包里找DNS请求的result比较稳妥），然后将监听地址和`enc_iv`异或生成payload，接着暴力尝试所有的请求密文即可解密出所有发往Google的请求

所以你可以看到，这个场景的难点仅仅在于确定你访问了哪些网站

### 加密算法不变的前提下修复漏洞

能否在加密算法不变的前提下修复漏洞？

ShadowSocks协议过于简陋，尝试修改协议可以吗？比如全部基于Socks5协议，sslocal只做流量加密转发，ssserver解密流量后做正常的Socks5服务端。我在[iox](https://github.com/eddieivan01/iox)的README里写，可以将它当ShadowSocks用，它使用的就是上述逻辑（因为加密只是工具的一个可选项，所以必需这样设计），这里我截取[iox](https://github.com/eddieivan01/iox)的加密通信数据，尝试能否重定向攻击：

```
-> 4d25107e
<- 4d27
-> 135aedf2ffaaba384f30
<- 157f165a2d5b237ac137
->7fde6040f33664c1b75db6a003b2d75f70b0819e177c129ccb616c26580df8dd9e8e4ad1bc250ea2185182278b39a8220b5d7eea83063c023ba70abdd5fe32d243c92df0dc2cdfe557
<- ...
```

Socks5报文中指定连接目标的是客户端第二个握手报文的第五个字节开始到结束，也就是`ffaaba384f30`。很不幸，这里解密后的明文依旧是攻击者可控的，即使Socks5握手协议的两端是不对称的，但这并不影响，在知道原始目标的情况下，攻击者依然可以解密请求和响应的所有数据

两种可行的方法：

1. 为协议添加签名字段（当然，需要先签名再加密，否则无效），这和使用AEAD算法本质是相同的

2. 为协议加混淆，如果是我，我会把协议设计成这样：

   ```
   | type | offset | target and obscure | data |
   |-------------------------------------------|
   |  1   |   6    |         256        |      |
   ```

   在第一次请求发送连接目标时，随机生成256 bytes的混淆数据，然后将实际6 bytes的target放在6个随机的offset中

   因为数据是加密的，所以攻击者不知道offset明文，因此无法推导出`enc_iv`，也就无法控制offset解密后的明文。在无法控制offset解密后的明文且不知道offset原始明文的情况下，攻击者即使知道原始target明文，但由于无法确定target密文，所以也无法控制解密后的target明文

   攻击者如果暴力尝试的话，最坏情况下需尝试`256 ^ 6`也就是`2 ^ 48`次，可以有效防范重定向攻击
   
   而该协议的开销，仅仅是每一条TCP连接建立时多传输了256 bytes。相比于AEAD算法需要对通信过程中所有数据做签名，这显然开销要小得多

