---
layout: post
title: 在开发中优雅的防御CSRF攻击
summary: 由前段时间写代码与面试时引发的一些思考
featured-img: xcsrf
---

来源于最近写代码时的一些思考，且上周阿里面试问了我在实际开发过程对CSRF的规避，故写了此文

p.s. CSRF在国内的SRC几乎是不受重视的，大环境就是如此（Hackerone和补天上提交的漏洞完全是不同画面），但作为一个Web安全从业者&开发者，CSRF一定是需要在开发过程中主动规避的

***

### 常规方法

CSRF是什么就不赘述了，不明白的自己补补课吧

一般来说有以下几种实践方法：

+ 验证referer
+ 验证码
+ SameSite头
+ CSRF token

#### 验证referer

第一种最简单粗暴，浏览器不允许XHR修改一些会导致安全问题的请求头

但它有缺点，可能会误杀，有损用户体验

比如某个页面是操纵转账的`http://example.com/transfer`，基础页面存在一个转账按钮`<a href="?to=user&num=100"><button>tranfer</button></a>`

这时假如验证referer来防御CSRF的话，那么基础页面（也就是不传参的页面）就无法通过URL直接访问了。当然这只是一个举例，想避免这种情况是有办法的，但当整体项目复杂后说不定那天就会跳进很久之前挖的坑里

除此之外，它很容易绕过。设置`<meta name="referrer" content="never">`的referrer策略即可使页面不发送任何referrer信息

#### 验证码

当涉及敏感操作时需输入验证码，实践上没什么问题，但是我没钱买接口......

#### SameSite头

这个安全设置可以从根本上阻止CSRF攻击，但它像验证referer一样可能导致一些坑，且不是所有浏览器都支持

```
Set-Cookie: cookie1=xxx; SameSite=Strict
Set-Cookie: cookie1=xxx; SameSite=Lax
```

以上两种方式都会禁止标签的请求携带第三方Cookie，比如`<img> <script>`等等

且Strict还会禁止开启新窗口或跳转时携带第三方Cookie，比如修改location，或a标签跳转

该头域的细节可以看[这篇文章](https://www.cnblogs.com/ziyunfei/p/5637945.html)

#### CSRF token

这是公认的最佳实践，这篇文章的重点也就在它

当使用类似Flask + Jinja的服务端渲染模型时，需要在Cookie（Session）中存放一个CSRF token，在渲染表单时将token渲染为一个hidden的表单项，然后表单提交后在服务端进行验证

有SOP的限制，恶意站点的JS无法拿到CSRF token，对付CSRF可谓绰绰有余（假如有其他漏洞，如绕过浏览器同源策略的话，就不是局限于CSRF了）

***

### 开发中的实践

几个月前一个学校项目，赶时间半个星期写完的一个比赛系统后端，所以在开发途中没有考虑一些安全细节。当半个月后看代码突然想起CSRF漏洞我完全没有考虑

后台评分路由函数：

```python
##############################################################
# MOVIE
##############################################################
@main.route('/preview/movie', methods=('GET', ))
@manager_required
def movie_preview():
    page = request.args.get('page') or 1
    page = int(page)

    movies = Movie.query.order_by(Movie.create_at.desc()).paginate(
        page=page, per_page=10, error_out=False).items
    return render_template(
        'admin/preview/movie.html',
        movies=movies,
        get_rank=get_rank,
        final_rank=final_rank,
        page=page)


@main.route('/rank/movie', methods=('GET', 'POST'))
@manager_required
def movie_rank():
    movie_id = request.args.get('movie_id')
    if not movie_id:
        return abort(400)

    delete = request.form.get('del', '')

    rank_score = int(request.form.get('rank', 0))
    rank_score = int(rank_score)
    if rank_score < 0 or rank_score > 100:
        return notice(request.url, '分数必须在0~100之间')

    movie = Movie.query.filter_by(id=movie_id).first() or None
    if movie is None:
        return redirect('/admin/preview/movie')

    if delete:
        if current_user.role != 0:
            return notice('/admin/preview/movie', '无权删除!')
        new_work = NewWork.query.filter_by(
            work_name=movie.work_name).first() or None
        rank = MovieRank.query.filter_by(
            work_id=movie_id).first() or None
        db.session.delete(new_work)
        if rank: db.session.delete(rank)
        	db.session.delete(movie)
        return redirect('/admin/preview/movie')

    if rank_score:
        rank = MovieRank.query.filter_by(
            work_id=movie_id).first() or MovieRank(movie.id)
        rank_by_user(rank, rank_score)
        if rank.rank1 and rank.rank2 and rank.rank3 and rank.rank4 and \
                rank.rank5 and rank.rank6:
            movie.ranked = 1
            rank.rank = int((rank.rank1 + rank.rank2 + rank.rank3 + rank.rank4
                             + rank.rank5 + rank.rank6) / 6)

        db.session.add(movie)
        db.session.add(rank)
        return notice('/admin/preview/movie', '评价成功!')

    return render_template(
        'admin/rank/movie.html',
        movie=movie,
        get_rank=get_rank,
        transfer_url=transfer_url)

```

攻击者只需要发送恶意页面给评委即可完成攻击，SOP无法有效的防御它（因为请求发出就完成了攻击，不需要获得响应），这里的ajax请求需设置`withCredentials=true`，才会在跨域请求中携带Cookie

```javascript
$.ajax(
    type: 'POST',
    url: "?movie_id=1", 
    data: {rank: '100'}，
    xhrFields: {
        withCredentials: true,
    },
)
```

由于懒，在发现后我就简单的打了个补丁，验证referer

```python
def x_csrf():
    referer = request.headers.get('Referer', '')
    return referer.startswith('http://example.com/')
```

在每个敏感路由前调用该函数即可

```python
if not x_csrf():
    return abort(403)
```

或者省事的写法

```python
def x_csrf_decorator(fn):
    @wraps(fn)
	def foo():
		if not x_csrf():
			return abort(403)
		return fn()
    
    return foo


......

@main.route(...)
@x_csrf_decorator
@manager_required
def movie_rank():
    pass
```

***

### 前后端分离

最近又有一个项目，前后端分离架构，后端仅提供接口，且不同源。那么像上面的描述的Flask + Jinja模版渲染的那一套CSRF防御逻辑就行不通了

但可以将CSRF token放在Cookie里，让前端JS请求接口时将Cookie里的token取出放在头域或GET/POST传参中，这里有几个问题：

+ Cookie的安全性
+ 第一次请求无Cookie时CSRF token校验失败

#### Cookie的安全性

由于SOP的存在，跨域站点无法访问其它域的`DOM，Cookie，localStorage`等等，那么将CSRF token明文存在Cookie里是完全没有问题的

但是由于需要前端JS操作Cookie，那么不能设置httponly选项，这样可能导致其他攻击如XSS来绕过CSRF的校验，但这就不是单纯的CSRF的防御了，所以可忽略这样微乎其微的风险。或者如果实在安全性要求很高的话，可以开一个接口来设置Cookie并发送token给客户端，接着客户端再发送请求（这样就可规避Cookie的风险，由SOP来保证攻击者无法获得token）

还有一点，后端验证逻辑仅仅是Cookie中的token等于头域中的token，那么假如攻击者前端恶意篡改Cookie和头域的话即可轻松绕过验证，就比如`curl http://example.com -H "Cookie: csrf=a" -H "csrf: a"`。但这个问题是不存在的，XHR无法修改Cookie头（昨天忘了这茬被绕进去了）

#### 第一次请求

用户第一次请求时，没有Cookie那么第一次校验势必不通过，那么就会导致每隔一段时间（Cookie过期）第一次的访问就会异常，这是很影响用户体验的。所以我想了以下几种办法来规避

+ 提供一个`/get-token`接口，每次发送请求前都先请求这个接口来获取Cookie。缺点很明显，请求数直接乘以2
+ 由前端控制，当CSRF校验不通过时重发请求。相比上一个方法要更好，但还是不算完美，有补丁性质
+ 只在私密的API中验证CSRF token，而其它不需鉴权的API就可以设置Cookie。因为按用户习惯，一般不会上来就访问私密接口发请求的。比如我将CSRF token随登录成功后一起发送给浏览器（其实我一直认为登录注册页面完全没必要验证CSRF，因为危害很有限），且设置token和鉴权cookie的expire相同，接着登录后的敏感接口操作都验证CSRF token。这样就保证了用户的私密请求都有CSRF token，不会影响用户体验

***

基于第三种方法我写了一个gin框架的中间件来防范CSRF attack，其他语言框架使用请求的hook函数也很容易实现

```go
package xcsrf

import (
	"math/rand"
	"time"

	"github.com/gin-gonic/gin"
)

var padding = []byte{
	'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
	'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
	'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
	'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
	'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7',
	'8', '9',
}

var (
	// TokenLength is the length of csrf token
	TokenLength = 16

	// TokenKey is the key of csrf token
	// it could be in get-query, post-form or header
	TokenKey = "X-Csrf-Token"

	// TokenCookie is the name of token cookie
	TokenCookie = "X-Csrf-Token"

	// DefaultExpire is the default expire time of cookie
	DefaultExpire = 3600 * 6

	// RandomSec is the flag which represents the random-source
	// will be changed after each period of time
	RandomSec = false

	// randSource will be changed every DefaultExpire time
	randSource = rand.New(rand.NewSource(time.Now().UnixNano()))

	// GenerateToken returns random CSRF token
	GenerateToken = func() string {
		result := make([]byte, TokenLength)
		for i := 0; i < TokenLength; i++ {
			result[i] = padding[randSource.Intn(62)]
		}
		return string(result)
	}
)

func init() {
	if RandomSec {
		go func() {
			for {
				time.Sleep(time.Duration(DefaultExpire) * time.Second)
				randSource = rand.New(rand.NewSource(time.Now().UnixNano()))
			}
		}()
	}
}

// SetCSRFToken set CSRF token in cookie while no token in cookie now
func SetCSRFToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		_, err := c.Cookie(TokenCookie)
		if err != nil {
			c.SetCookie(TokenCookie, GenerateToken(), DefaultExpire, "/", "", false, false)
		}
		c.Next()
	}
}

// XCSRF verify the token
// if not match, returns 403
func XCSRF(tokenLookupWay string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string
		switch tokenLookupWay {
		case "get":
			token = c.Query(TokenKey)
		case "post":
			token = c.PostForm(TokenKey)
		case "header":
			token = c.GetHeader(TokenKey)
		}

		cookie, err := c.Cookie(TokenCookie)
		if token == "" || err != nil || cookie != token {
			c.AbortWithStatus(403)
		}
		c.Next()
	}
}

```

使用时在所有的接口上启用`SetToken`中间件，在私密接口上验证CSRF token

```go
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/eddieivan01/x-csrf"
)

func main(){
    r := gin.Default()

    // custom the CSRF token config as you like
    csrf.TokenLength = 32
	csrf.TokenKey = "the-key-name"
	csrf.TokenCookie = "the-cookie-name"
	csrf.DefaultExpire = 3600 * 6
    csrf.RandomSec = false
    
    // every site will set cookie
    r.Use(xcsrf.SetCSRFToken())

    r.GET("/", func(c *gin.Context){
        c.String(200, "ok")
    })
    
    // secret sites, which need to defend CSRF attack
    g1 := r.Group("/secret")
    g1.Use(xcsrf.XCSRF("header"))
    g1.GET("/", func(c *gin.Context){
        c.String(200, "csrf ok")
    })
    r.Run(":5000")
}

```

