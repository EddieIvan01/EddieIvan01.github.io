---
layout: post
title: 记今晚群内机器人被玩崩的过程
summary: 吸取教训：权限配置是多么的重要 [:doge]
featured-img: th
---
# 前言：
# 前几天技术群里一个大兄弟弄了一个机器人，super指令可以调用机器人执行代码。如`super shell echo 1`，`super c++ #include ........`，`super eval (1+1)*2`，`super python print "hello world"`等等等等，详细技术文档见下图

![](https://upload-images.jianshu.io/upload_images/11356161-8f8993046f07567b.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

![](https://upload-images.jianshu.io/upload_images/11356161-a298bfe3da67b4e3.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

## 此处30号小可爱即为机器人

***
# 正文

# 既然能执行代码那就等于拿到shell了啊，然后那位大兄弟说php是用了他朋友的服务器，shell是调用web api。既然这样，群友们当然要帮他完善啊！[:doge]

## 首先试了`super php echo $GLOBALS`，`super php strcmp()`这些，之后在调用`super php --help`时居然爆出了路径，那好了，unlink函数可以试试了（unlink是php的删除本地文件函数，linux下也有unlink，在删除文件时的效果等同与rm指令，区别是不能删除文件夹）

![](https://upload-images.jianshu.io/upload_images/11356161-8b47afaba178d444.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


**发现在输入绝对路径时没执行成功，于是决定从后往前试**


![](https://upload-images.jianshu.io/upload_images/11356161-793fa9bedb5968d1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


**然后就删除成功了，eval.php被删除，机器人php服务器成功挂掉，指令执行后全是报错信息**

```html
@旧日昼 !DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"> 
<html xmlns="http://www.w3.org/1999/xhtml"> 
<head> 
<title>IIS 7.5 详细错误 - 404.0 - Not Found</title> 
<style type="text/css"> 
<!-- 
body{margin:0;font-size:.7em;font-family:Verdana,Arial,Helvetica,sans-serif;background:#CBE1EF;} 
code{margin:0;color:#006600;font-size:1.1em;font-weight:bold;} 
.config_source code{font-size:.8em;color:#000000;} 
pre{margin:0;font-size:1.4em;word-wrap:break-word;} 
ul,ol{margin:10px 0 10px 40px;} 
ul.first,ol.first{margin-top:5px;} 
fieldset{padding:0 15px 10px 15px;} 
.summary-container fieldset{padding-bottom:5px;margin-top:4px;} 
legend.no-expand-all{padding:2px 15px 4px 10px;margin:0 0 0 -12px;} 
legend{color:#333333;padding:4px 15px 4px 10px;margin:4px 0 8px -12px;_margin-top:0px; 
 border-top:1px solid #EDEDED;border-left:1px solid #EDEDED;border-right:1px solid #969696; 
 border-bottom:1px solid #969696;background:#E7ECF0;font-weight:bold;font-size:1em;} 
a:link,a:visited{color:#007EFF;font-weight:bold;} 
a:hover{text-decoration:none;} 
h1{font-size:2.4em;margin:0;color:#FFF;} 
h2{font-size:1.7em;margin:0;color:#CC0000;} 
h3{font-size:1.4em;margin:10px 0 0 0;color:#CC0000;} 
h4{font-size:1.2em;margin:10px 0 5px 0; 
}#header{width:96%;margin:0 0 0 0;padding:6px 2% 6px 2%;font-family:"trebuchet MS",Verdana,sans-serif; 
 color:#FFF;background-color:#5C87B2; 
}#content{margin:0 0 0 2%;position:relative;} 
.summary-container,.content-container{background:#FFF;width:96%;margin-top:8px;padding:10px;position:relative;} 
.config_source{background:#fff5c4;} 
.content-container p{margin:0 0 10px 0; 
}#details-left{width:35%;float:left;margin-right:2%; 
}#details-right{width:63%;float:left;overflow:hidden; 
}#server_version{width:96%;_height:1px;min-height:1px;margin:0 0 5px 0;padding:11px 2% 8px 2%;color:#FFFFFF; 
 background-color:#5A7FA5;border-bottom:1px solid #C1CFDD;border-top:1px solid #4A6C8E;font-weight:normal; 
 font-size:1em;color:#FFF;text-align:right; 
}#server_version p{margin:5px 0;} 
table{margin:4px 0 4px 0;width:100%;border:none;} 
td,th{vertical-align:top;padding:3px 0;text-align:left;font-weight:bold;border:none;} 
th{width:30%;text-align:right;padding-right:2%;font-weight:normal;} 
thead th{background-color:#ebebeb;width:25%; 
}#details-right th{width:20%;} 
table tr.alt td,table tr.alt th{background-color:#ebebeb;} 
.highlight-code{color:#CC0000;font-weight:bold;font-style:italic;} 
.clear{clear:both;} 
.preferred{padding:0 5px 2px 5px;font-weight:normal;background:#006633;color:#FFF;font-size:.8em;} 
--> 
</style> 
 
</head> 
<body> 
<div id="header"><h1>应用程序“JHKG0E2F”中的服务器错误</h1></div> 
<div id="server_version"><p>Internet Information Services 7.5</p></div> 
<div id="content"> 
<div class="content-container"> 
 <fieldset><legend>错误摘要</legend> 
  <h2>HTTP 错误 404.0 - Not Found</h2> 
  <h3>您要找的资源已被删除、已更名或暂时不可用。</h3> 
 </fieldset> 
</div> 
<div class="content-container"> 
 <fieldset><legend>详细错误信息</legend> 
  <div id="details-left"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>模块</th><td>IIS Web Core</td></tr> 
    <tr><th>通知</th><td>MapRequestHandler</td></tr> 
    <tr class="alt"><th>处理程序</th><td>YVSYPHP</td></tr> 
    <tr><th>错误代码</th><td>0x80070002</td></tr> 
     
   </table> 
  </div> 
  <div id="details-right"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>请求的 URL</th><td>http://web2.doy.men:80/phps/php/eval.php</td></tr> 
    <tr><th>物理路径</th><td>e:\web\jhkg0e2f\WwwRoot\phps\php\eval.php</td></tr> 
    <tr class="alt"><th>登录方法</th><td>匿名</td></tr> 
    <tr><th>登录用户</th><td>匿名</td></tr> 
     
   </table> 
   <div class="clear"></div> 
  </div> 
 </fieldset> 
</div> 
<div class="content-container"> 
 <fieldset><legend>最可能的原因:</legend> 
  <ul> 	<li>指定的目录或文件在 Web 服务器上不存在。</li> 	<li>URL 拼写错误。</li> 	<li>某个自定义筛选器或模块(如 URLScan)限制了对该文件的访问。</li> </ul> 
 </fieldset> 
</div> 
<div class="content-container"> 
 <fieldset><legend>可尝试的操作:</legend> 
  <ul> 	<li>在 Web 服务器上创建内容。</li> 	<li>检查浏览器 URL。</li> 	<li>创建跟踪规则以跟踪此 HTTP 状态代码的失败请求，并查看是哪个模块在调用 SetStatus。有关为失败的请求创建跟踪规则的详细信息，请单击<a href="http://go.microsoft.com/fwlink/?LinkID=66439">此处</a>。</li> </ul> 
 </fieldset> 
</div> 
 
 
<div class="content-container"> 
 <fieldset><legend>链接和更多信息</legend> 
  此错误表明文件或目录在服务器上不存在。请创建文件或目录并重新尝试请求。 
  <p><a href="http://go.microsoft.com/fwlink/?LinkID=62293&IIS70Error=404,0,0x80070002,7601">查看更多信息 &raquo;</a></p> 
   
 </fieldset> 
</div> 
</div> 
</body> 
</html> 
```

## 然后，那个大兄弟就想着怎么跟他朋友负荆请罪去了[:doge]


***


## 接着过了两个小时，机器人再次上线，这次加了python功能，也是调用web api，试了urllib2和socket库发现网都不能联，接着调用os.system发现/etc目录权限都没有，所以这个不会像php一样被玩坏了

## p.s  php也上线了，不过也是调用web api

![](https://upload-images.jianshu.io/upload_images/11356161-0e3f5698210bc8c1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

![](https://upload-images.jianshu.io/upload_images/11356161-13612d7a7790fd2a.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

***

## 在接下来又加入了linux shell功能，发现这次有权限进一些目录，但是没root权限还是干不了什么坏事，甚至连关机重启都得sudo才行


## 之后那位大兄弟把python也迁移到了shell服务器上，就是他自己的那台服务器，在查看了半天/usr/bin之类的目录后，发现/etc/init.d的系统服务目录里有reboot


![](https://upload-images.jianshu.io/upload_images/11356161-5c195f9415d2405c.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


## 然后就`super python import os;os.system("service reboot start/stop")`，发现居然执行了


![](https://upload-images.jianshu.io/upload_images/11356161-e63ec720e28bdf4e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


## emmm，所以说收获颇丰[:doge]，一晚上把两台服务器按在地上摩擦


***


## p.s 解释下我的群名片为什么叫旧日昼，因为群里一个叫新月夜的小新同学


![](https://upload-images.jianshu.io/upload_images/11356161-fc7e36749f1e67a3.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
![](https://upload-images.jianshu.io/upload_images/11356161-a3422d4db18c585b.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


## 我一想到IT行业是多么辛苦，头发掉的是多么快啊！于是我毅然决然的和她一起每天发出善意的劝告


# end
