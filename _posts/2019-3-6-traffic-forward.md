---
layout: post
featured-img: traffic
title: Traffic forward
summary: 总结流量转发，以及Python/Golang的高效实现
---

`首发于安恒公众号`

***

1. 内网穿透
2. 端口转发
3. 代理跳板
4. 反向代理
5. etc.

***

#### 内网穿透

当使用MSF生成诸如reverse_tcp等payload时，往往自己的主机处于NAT中，有以下三种方法接收到返回的shell：

+ 用有公网IP的服务器监听反弹的shell
+ 设置网关的端口映射
+ 内网穿透

第一种方法很简单，可服务器需要安装一系列利用工具，不如自己主机方便

第二种方法在简单的网络环境中是可行的，比如家庭的网络（假设家庭有一个公网IP），只需设置网关的端口映射，比如将公网IP的12345端口转发到内网主机的2333端口。但假如主机处于不止一层的NAT下（比如很多大学寝室），端口映射就行不通了

第三种内网穿透的方法就是要介绍的，frp/ngrok等工具便是相关的工具

**内网穿透的原理：**

有公网IP的服务器将流量通过Tcp长连接转发到处于内网的某个主机中

**内网穿透的实现：**

假设公网IP为222.x.x.x，监听客户端连接的port为2333，监听shell连接的port为12345

客户端将shell转发至本机的4444端口

+ 公网服务器listen 222.x.x.x:2333等待客户端连接
+ 公网服务器listen 222.x.x.x:12345等待受害者连接
+ 客户端connect->222.x.x.x:2333
+ 客户端connect->127.0.0.1:4444
+ 公网服务器和客户端现在都handle两个socket
+ 当shell反弹至公网服务器12345端口时，公网服务器转发Tcp流量到:2333的socket，内网主机此时接收到222.x.x.x:2333的tcp流量，将其转发至127.0.0.1:4444端口
+ 一直双向转发流量直到某一方reset connection

***

#### 端口转发

端口转发在内网渗透中经常被使用，假设以下场景：

+ 受害者主机开启了Redis/MySQL/RDP等服务，但只监听了127.0.0.1
+ 受害者主机所在内网存在主机群，但无法连接公网

这时，假如我们已经获得受害主机的控制权，就可以利用端口转发，将无法访问的主机端口抓发到公网服务器。或将内网中无法访问的主机端口转发到已控制主机的某些端口，具体的实现与内网穿透转发Tcp流量类似

lcx工具、ssh、netsh等都有转发的功能，都可在此场景下利用

***

#### 代理跳板

这个最容易理解，利用某些主机作代理，转发我们的流量，达到隐藏自身的目的

场景：

+ 获得某些主机控制权后，将其作为跳板来转发我们的流量
+ t0r(0ni0n)的socks4代理
+ $$r(小飞机)的socks5代理

当然，在转发的过程中需要解析请求，假设是转发http流量的话，可以使用http代理协议/socks代理协议来解析

+ http代理的两种情况

```
// 普通代理
GET http://null.com/ HTTP/1.1
Host: null.com
```

```
// 隧道代理，往往用于HTTPS

// client
CONNECT null.com:443 HTTP/1.1
Host: null.com:443

// server
HTTP/1.1 200 Connection Established
```

  这两种代理的情况都很容易代码实现目标主机的解析，然后代理只需连接目标主机，接着转发两端流量即可

+ socks5代理

  自己实现一个极简socks5代理解析，Golang实现：

  ```go
  func parseSocks5(conn net.Conn) {
  	buf := make([]byte, 256)
  
  	n, err := conn.Read(buf)
  	handleErr(err)
  
  	if buf[0] != 0x05 || n < 3 {
  		conn.Close()
  		return
  	}
  	n, err = conn.Write([]byte{0x05, 0x00})
  	handleErr(err)
  
  	n, err = conn.Read(buf)
  	handleErr(err)
  	if buf[0] != 0x05 || buf[1] != 0x01 {
  		conn.Close()
  		return
  	}
  
  	var host []byte
  	var port int
  	switch buf[3] {
      // IPv4
  	case 0x01:
  		host = buf[4 : n-2]
      // domain
  	case 0x03:
  		length := buf[4]
  		addr, err := net.ResolveIPAddr("ip", string(buf[5:5+length]))
  		handleErr(err)
  		host = addr.IP
      // IPv6
  	case 0x04:
  		host = buf[4 : n-2]
  	}
  
  	port = (int(buf[n-2]) << 8) + int(buf[n-1])
  	tAddr := &net.TCPAddr{
  		IP:   host,
  		Port: port,
  	}
  
  	dstConn, err := net.DialTCP("tcp", nil, tAddr)
  	if err != nil {
  		conn.Close()
  		return
  	}
  	conn.Write([]byte{0x05, 0x00, 0x00, 0x01,
  		0x00, 0x00, 0x00, 0x00,
  		0x00, 0x00})
  
  	forward(conn, dstConn)
  }
  ```

  完整的socks5代理细节请参考RFC1928

  ***

  除了简单直白的代理转发，我们还可以加上一些加密混淆，这便是$$r的原理了，在client/server端各建立一个proxy，这两个proxy的职责就是对两端socket的流量进行加密与解密，以此达到绕过G*W的目的

  一个简单的实现可以参考我的项目[https://github.com/EddieIvan01/iox](https://github.com/EddieIvan01/iox)

***

#### 反向代理

+ Nginx的服务器反代
+ Tcp层面的流量过滤器

***

#### etc.

流量转发的其他用处：

很多大学抢课都是一大难题，我曾经写过抢课的脚本，但最终也无法做到在抢课开始的时间点进行秒杀（类似某东购物秒杀），原因是学校服务器扛不住过大的并发量，所以最后的抢课脚本只能起到监控抢课的作用

而后我想到新的思路：

在抢课开始时间点前与教务系统建立4-8个Tcp连接（HTTP 1.1长连接可复用Tcp通道，这里是为并发量考虑），维护一个连接池，当时间点来到时直接发送Http报文即可。但这样做有一个问题，我们需要发送原始的Tcp报文，也就是拿原始Tcp socket来完成我们的请求而不是requests这种好用的库，所以，我们需要一个流量转发的代理

假如我使用socks5代理：

+ 首先我建立一个Tcp连接池
+ 当开始抢课时，依然使用requests发请求，但代理设置为socks5代理
+ 本地socks5代理解析客户端的socks5请求（其实不算解析，应答即可，最终目标主机都是教务系统），从连接池中选取一个连接，socks5过程结束后只需无脑转发两端流量即可

***

#### 流量转发的代码实现

简单的流量转发代码实现其实并不难，但我们需要考虑一下因素

+ 效率
+ 并发
+ 关闭socket

socket通信中，有以下几处操作会阻塞：

+ server accept
+ client connect
+ recieve

需要注意的是，send不会阻塞，它只负责将数据拷贝到Tcp协议栈就返回

在上述几处阻塞的地方，假如不加处理，那么写出来的转发代理一次只能处理一个连接，效率未免太低，所以我们可以选择：

+ select/poll/epoll I/O多路复用
+ coroutine
+ multi-thread
+ multi-process

后两种当然会排除，因为它们太重了

Python实现前两种选择的主体函数如下，思路是哪个socket可读就往另一个socket写，直到一方断开连接

```python
# I/O多路复用

def proxy_pass(server):
    client_conn, addr = server.accept()
    print(f'[+]get client {addr[0]}:{addr[1]}')
    client_conn.setblocking(False)
    # set socket SO_LINGER, to make sure closing socket
    client_conn.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, 
                          struct.pack('ii', 1, 0))
    
    socks5_conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    socks5_conn.setblocking(False)
    socks5_conn.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER,
                          struct.pack('ii', 1, 0))
    try:
        socks5_conn.connect(('127.0.0.1', 1080))
    except BlockingIOError:
        pass
    done = False
    
    def on_socks_connected():
        s.unregister(socks5_conn)
        s.register(client_conn, selectors.EVENT_READ, client_2_socks5)
        s.register(socks5_conn, selectors.EVENT_READ, socks5_2_client)
        
    def client_2_socks5():
        nonlocal done
        if done:
            s.unregister(client_conn)
            client_conn.close()
            return        
        try:
            data = client_conn.recv(4096)
            if data:
                socks5_conn.sendall(data)               
            else:
                done = True
        except (BlockingIOError, ConnectionResetError):
            done = True
    
    def socks5_2_client():
        nonlocal done        
        if done:          
            s.unregister(socks5_conn)
            socks5_conn.close()
            return        
        try:
            data = socks5_conn.recv(4096)
            if data:
                client_conn.sendall(data)
            else:
                done = True
        except (BlockingIOError, ConnectionResetError):
            done = True
            
    s.register(socks5_conn, selectors.EVENT_WRITE, on_socks_connected)
       
```

```python
# coroutine

async def proxy_pass(reader, writer):
    socks_r, socks_w = await asyncio.open_connection('127.0.0.1', 1080) 
    
    async def a_2_b(reader, writer):
        data = await reader.read(4096)
        while 1:
            try:                
                if data:
                    writer.write(data)
                    await writer.drain()
                    data = await reader.read(4096)
                else:
                    writer.close()
                    break
            except ConnectionResetError:
                writer.close()
                break


    asyncio.run_coroutine_threadsafe(a_2_b(reader, socks_w), loop)
    asyncio.run_coroutine_threadsafe(a_2_b(socks_r, writer), loop)
```

完整的代码见[https://gist.github.com/EddieIvan01/24e54513ab416f6025a575bd8fa1673e](https://gist.github.com/EddieIvan01/24e54513ab416f6025a575bd8fa1673e)

还有Golang的流量转发实现就更简单了：

```go
func forward(conn1 net.Conn, conn2 net.Conn) {
	defer conn1.Close()
	defer conn2.Close()
	var wg sync.WaitGroup
	wg.Add(2)

	go func(src net.Conn, dst net.Conn) {
		defer wg.Done()
		io.Copy(dst, src)
	}(conn1, conn2)
	go func(src net.Conn, dst net.Conn) {
		defer wg.Done()
		io.Copy(dst, src)
	}(conn2, conn1)

	wg.Wait()
}
```

io.Copy是标准库中文件拷贝函数，正常它会一直循环读取8*1024的字节块直到EOF（针对socket则是断开连接）

***

#### End