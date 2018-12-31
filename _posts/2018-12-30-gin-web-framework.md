---
layout: post
title: Gin-gonic框架源码阅读
summary: Would you like some gin?
featured-img: gin
---

最初在想究竟看看哪个框架，最后觉得`gin[杜松子酒]`挺不错的，是个轻量级框架，`API`很简洁，官方设计的`logo`也不错

学习的是0.1 release的，只有五个文件很简洁（最新版几万行代码杀了我吧）

***

### Gin

0.1版本只有五个文件：

```
gin/
   |__auth.go
   |__gin.go
   |__logger.go
   |__recovery.go
   |__validation.go
```

auth为http认证模块，我暂时还没用过。logger和recovery为两个默认中间件模块，所以重点在gin.go

`gin.Context`，ctx是整合了`http.ResponseWriter`和`http.Request`的上下文对象，成员有：

```go
type Context struct {
    Req      *http.Request
    Writer   http.ResponseWriter
    Keys     map[string]interface{}
    Errors   []ErrorMsg
    Params   httprouter.Params
    handlers []HandlerFunc
    engine   *Engine
    index    int8
}

func (c *Context) Next() {
	c.index++
	s := int8(len(c.handlers))
	for ; c.index < s; c.index++ {
		c.handlers[c.index](c)
	}
}

func (c *Context) Abort(code int) {
	c.Writer.WriteHeader(code)
	c.index = AbortIndex
}

func (c *Context) Fail(code int, err error) {
	c.Error(err, "Operation aborted")
	c.Abort(code)
}

func (c *Context) Error(err error, meta interface{}) {
	c.Errors = append(c.Errors, ErrorMsg{
		Message: err.Error(),
		Meta:    meta,
	})
}

func (c *Context) Set(key string, item interface{}) {
	if c.Keys == nil {
		c.Keys = make(map[string]interface{})
	}
	c.Keys[key] = item
}
func (c *Context) Get(key string) interface{} {
	var ok bool
	var item interface{}
	if c.Keys != nil {
		item, ok = c.Keys[key]
	} else {
		item, ok = nil, false
	}
	if !ok || item == nil {
		log.Panicf("Key %s doesn't exist", key)
	}
	return item
}

func (c *Context) EnsureBody(item interface{}) bool {
	if err := c.ParseBody(item); err != nil {
		c.Fail(400, err)
		return false
	}
	return true

func (c *Context) ParseBody(item interface{}) error {
	decoder := json.NewDecoder(c.Req.Body)
	if err := decoder.Decode(&item); err == nil {
		return Val idate(c, item)
	} else {
		return err
	}
}

func (c *Context) JSON(code int, obj interface{}) {
	if code >= 0 {
		c.Writer.WriteHeader(code)
	}
	c.Writer.Header().Set("Content-Type", "application/json")
	encoder := json.NewEncoder(c.Writer)
	if err := encoder.Encode(obj); err != nil {
		c.Error(err, obj)
		http.Error(c.Writer, err.Error(), 500)
	}
}

func (c *Context) XML(code int, obj interface{}) {
	if code >= 0 {
		c.Writer.WriteHeader(code)
	}
	c.Writer.Header().Set("Content-Type", "application/xml")
	encoder := xml.NewEncoder(c.Writer)
	if err := encoder.Encode(obj); err != nil {
		c.Error(err, obj)
		http.Error(c.Writer, err.Error(), 500)
	}
}

func (c *Context) HTML(code int, name string, data interface{}) {
	if code >= 0 {
		c.Writer.WriteHeader(code)
	}
	c.Writer.Header().Set("Content-Type", "text/html")
	if err := c.engine.HTMLTemplates.ExecuteTemplate(c.Writer, name, data); err != nil {
		c.Error(err, map[string]interface{}{
			"name": name,
			"data": data,
		})
		http.Error(c.Writer, err.Error(), 500)
	}
}

func (c *Context) String(code int, msg string) {
	c.Writer.Header().Set("Content-Type", "text/plain")
	c.Writer.WriteHeader(code)
	c.Writer.Write([]byte(msg))
}

func (c *Context) Data(code int, data []byte) {
	c.Writer.WriteHeader(code)
	c.Writer.Write(data)
}
```

`Keys`是中间件传递参数所用，`Errors`会在`logger`中间件处理，`Handlers`是中间件函数的切片，`engine`也就是`gin`的核心对象。这里的`ctx.Next`函数很重要，我们到后面在说

```go
RouterGroup struct {
    Handlers []HandlerFunc
    prefix   string
    parent   *RouterGroup
    engine   *Engine
}

Engine struct {
    *RouterGroup
    handlers404   []HandlerFunc
    router        *httprouter.Router
    HTMLTemplates *template.Template
}
```

`engine`内嵌了`RouterGroup`对象（所以`Engine`也可以当做`RouterGroup`用），而`RouterGroup`中有`Engine`字段，也就是以这样的形式，实现了`gin`框架`Demo`里的一组前缀相同的路由定义

```go
v1 := router.Group("/v1")
{
    v1.POST("/login", loginEndpoint)
    v1.POST("/submit", submitEndpoint)
    v1.POST("/read", readEndpoint)
}
```

源码中在这里的工厂函数返回了`Group`实例：

```go
func (group *RouterGroup) Group(component string, handlers ...HandlerFunc) *RouterGroup {
	prefix := path.Join(group.prefix, component)
	return &RouterGroup{
		Handlers: group.combineHandlers(handlers),
		parent:   group,
		prefix:   prefix,
		engine:   group.engine,
	}
}
```

这里的方法接收者实际是`Engine`，因为内嵌对象的方法自动提升到被嵌入对象。所以`New`出来的`Engine`是所有想关对象字段里的`parent`，而`Group`实例化的`RouterGroup`共享同一个`Engine`，然后在`Group`后续定义的路由里`join`了这里的`prefix`

再看`gin.New`函数：

```go
func New() *Engine {
	engine := &Engine{}
	engine.RouterGroup = &RouterGroup{nil, "", nil, engine}
	engine.router = httprouter.New()
	engine.router.NotFound = engine.handle404
	return engine
}
```

创建了`Engine`实例并返回，而`Default`函数也是调用了`New`函数，并默认连接了两个中间件

接下来看`Engine`的成员函数，也就是一些`gin`框架`run and serve`的功能函数：

```go
func (engine *Engine) LoadHTMLTemplates(pattern string) {
	engine.HTMLTemplates = template.Must(template.ParseGlob(pattern))
}

func (engine *Engine) NotFound404(handlers ...HandlerFunc) {
	engine.handlers404 = handlers
}

func (engine *Engine) handle404(w http.ResponseWriter, req *http.Request) {
	handlers := engine.combineHandlers(engine.handlers404)
	c := engine.createContext(w, req, nil, handlers)
	if engine.handlers404 == nil {
		http.NotFound(c.Writer, c.Req)
	} else {
		c.Writer.WriteHeader(404)
	}

	c.Next()
}

func (engine *Engine) ServeFiles(path string, root http.FileSystem) {
	engine.router.ServeFiles(path, root)
}

func (engine *Engine) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	engine.router.ServeHTTP(w, req)
}

func (engine *Engine) Run(addr string) {
	http.ListenAndServe(addr, engine)
}
```

最后的路由函数是`handle`请求并处理的功能，即使不使用前缀`URL`，也依旧是调用了`RouterGroup`的方法

```go
// Handle registers a new request handle and middlewares with the given path and method.
// The last handler should be the real handler, the other ones should be middlewares that can and should be shared among different routes.
func (group *RouterGroup) Handle(method, p string, handlers []HandlerFunc) {
	p = path.Join(group.prefix, p)
	handlers = group.combineHandlers(handlers)
	group.engine.router.Handle(method, p, func(w http.ResponseWriter, req *http.Request, params httprouter.Params) {
		group.createContext(w, req, params, handlers).Next()
	})
}

// POST is a shortcut for router.Handle("POST", path, handle)
func (group *RouterGroup) POST(path string, handlers ...HandlerFunc) {
	group.Handle("POST", path, handlers)
}

// GET is a shortcut for router.Handle("GET", path, handle)
func (group *RouterGroup) GET(path string, handlers ...HandlerFunc) {
	group.Handle("GET", path, handlers)
}

// DELETE is a shortcut for router.Handle("DELETE", path, handle)
func (group *RouterGroup) DELETE(path string, handlers ...HandlerFunc) {
	group.Handle("DELETE", path, handlers)
}

// PATCH is a shortcut for router.Handle("PATCH", path, handle)
func (group *RouterGroup) PATCH(path string, handlers ...HandlerFunc) {
	group.Handle("PATCH", path, handlers)
}

// PUT is a shortcut for router.Handle("PUT", path, handle)
func (group *RouterGroup) PUT(path string, handlers ...HandlerFunc) {
	group.Handle("PUT", path, handlers)
}

func (group *RouterGroup) combineHandlers(handlers []HandlerFunc) []HandlerFunc {
	s := len(group.Handlers) + len(handlers)
	h := make([]HandlerFunc, 0, s)
	h = append(h, group.Handlers...)
	h = append(h, handlers...)
	return h
}
```

看到这里的逻辑，中间的几个`http`方法函数都只是给`Handler`封装了一层，重点逻辑在于定义变长的`Handler`函数时，会将路由映射`join`进前缀，并定义函数--URL映射，匿名函数里是实例化ctx调用`Next`方法，也就是前面提到的：

```go
func (c *Context) Next() {
	c.index++
	s := int8(len(c.handlers))
	for ; c.index < s; c.index++ {
		c.handlers[c.index](c)
	}
}
```

这里`Context.index`是`uint8`类型，也就是说针对一个URL所能定义的`handler func`小于`1 << 8`。在`httprouter`处理请求时，会调用刚刚定义的匿名函数，来依次调用处理这个URL的`handler`，最后想要达到的目的就是，中间件会被链式依次调用，且请求与响应时为栈式逆序。结合源码的注释：

```go
// Handle registers a new request handle and middlewares with the given path and method.
// The last handler should be the real handler, the other ones should be middlewares that can and should be shared among different routes.

// Next should be used only in the middlewares.
// It executes the pending handlers in the chain inside the calling handler.
```

假设我们的某个函数有三个中间件，一个请求处理函数一个请求到来时，`router`会自动调用一次`c.Next()`，接着开始调用第一个中间件，中间件函数里会调用`c.Next()`，然后在中间件函数栈里继续遍历`[]handlers`，由于`handle func`传入的是`*Context`，所以`c.index`会随之`++`，接着会调用第二个中间件，然后在第二个中间件的函数栈继续调用第三个中间件，接着第三个里调用`c.Next()`会调用请求处理函数，接着请求处理函数执行完成后，第三个中间件的`c.Next()`返回，接着执行`c.Next()`后面的部分，也就是响应处理，执行完成返回到第二个中间件继续处理响应...etc.。而假如我们想在中间件里传递变量，就需要用到我前面说的`Context.Key`以及它的`property`方法`Get/Set`

也就是说中间件函数以`c.Next()`为分割，之前为请求处理部分，调用顺序是`middleware1 -> middleware2 -> middleware3`，之后为响应处理部分，调用顺序与请求处理相反，简单的导图：

![](https://upload-images.jianshu.io/upload_images/11356161-f4367c5c4fe67cd1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

***

中间件的函数签名如下，其实中间件与请求处理函数签名系统，唯一区别是中间件里调用了`c.Next()`

```go
type HandlerFunc func(*Context)
```

`RouterGroup`用来连接中间件，ctx工厂函数的方法

```go
func (group *RouterGroup) createContext(w http.ResponseWriter, req *http.Request, params httprouter.Params, handlers []HandlerFunc) *Context {
	return &Context{
		Writer:   w,
		Req:      req,
		index:    -1,
		engine:   group.engine,
		Params:   params,
		handlers: handlers,
	}
}

// Adds middlewares to the group, see example code in github.
func (group *RouterGroup) Use(middlewares ...HandlerFunc) {
	group.Handlers = append(group.Handlers, middlewares...)
}
```

最后就是常用的`gin.H`的原型，是一个`string->interface{}`的哈希表，可以用它来方便的传递msg：

```go
type H map[string]interface{}
```

结尾总结一下，`gin`框架的核心是`engine`，它内嵌了`RouterGroup`结构体（也就是OOP的继承），就是用它来连接中间件、处理请求...etc.，请求来临时`httprouter`库会回调定义的匿名函数来运行`ctx.Next`方法，接着就是一连串中间件与请求处理函数

每一个`RouterGroup`对象存在一个`Engine`子对象，子对象里定义了`template`和`Router`，在连接中间件函数时是保存在`RouterGroup`的`Handlers`里，所以对于不同层级的URL，可以定义适用性不同的中间件，比如只在一个组路由中连接一个中间件

对于同一个`Web App`中不同的路由，它们都会共享同一个`Engine`，也就是`gin.New`实例化的`Engine`（`prefix url == ""`），然后由`Engine`定义`单路由/组路由`来定义不同的映射，`router.Handle`方法会在定义路由前`join`父`router`的`prefix url`，以此来连接组合