# NCRE成绩查询系统的半自动破解


---
layout: post

---

## 声明：本文仅用于技术交流，请勿将程序用于任何违法用途。造成一切后果本人概不负责

**计算机考试成绩在前几天出来了，不出意外二级裸考过了，三级半裸挂了...考前三天才想起来刷题库，结果时间不够路由器交换机指令那块放弃了。**

**既然网络技术挂了，所以就针对NCRE网站写个程序证明一下，顺带嘲讽刷题应试考证的制度**

**另：写程序的另一个原因是确实想知道一位同学的考试成绩**

***

**查成绩那天发现查询成绩只需要身份证号和姓名对应，且可以无限次错误查询，并没有相应的安全措施。我翻了翻大一班长期间保存的一些信息表格，发现身份证号还是很难查到的（不同于学号）。接着先设想方案，针对任意考生：社工手段查找家乡生日，这样就可以确定身份证号前14位，最后四位在知道性别的前提下只需要尝试5000次（倒数第二位男单女双），这可比平时跑字典尝试1500万+组合要简单多了**

**首先还是审计页面源代码，发现主要的函数集中在`data.js`，`query.js`中，之后发现页面验证码的加载是js动态加载，当验证码窗口`get focus`的时候，所以最开始尝试了用selenium获取页面中的验证码网址，结果发现动态加载的代码是无法在源代码中显示的，只可以在审查元素中看到**

**之后经过对上文两个JS的审计，找到了获取验证码的接口**


```javascript
//data.js
var dq={"code":"NCRE",
		"tab":"NCRE_1803",
		"name":"全国计算机等级考试（NCRE）",
		"sn":"2018年3月全国计算机等级考试（NCRE）",
		"en":"2018年03月全国计算机等级考试（NCRE）",
		"qt":"2018/05/09 11:09:07",
		"bkjb":[
				{"code":"14","name":"14一级计算机基础及WPS Office应用","certi_data":"images/ncre1-2013.jpg|847|600"},
				{"code":"15","name":"15一级计算机基础及MS Office应用","certi_data":"images/ncre1-2013.jpg|847|600"},
				{"code":"16","name":"16一级计算机基础及Photoshop应用","certi_data":"images/ncre1-2013.jpg|847|600"},
				{"code":"24","name":"24二级C语言程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"26","name":"26二级VB语言程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"28","name":"28二级JAVA语言程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"29","name":"29二级ACCESS数据库程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"61","name":"61二级C++语言程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"63","name":"63二级MySQL数据程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"64","name":"64二级Web程序设计","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"65","name":"65二级MS Office高级应用","certi_data":"images/ncre2-2013.jpg|847|600"},
				{"code":"35","name":"35三级网络技术","certi_data":"images/ncre3-2013.jpg|847|600"},
				{"code":"36","name":"36三级数据库技术","certi_data":"images/ncre3-2013.jpg|847|600"},
				{"code":"38","name":"38三级信息安全技术","certi_data":"images/ncre3-2013.jpg|847|600"},
				{"code":"39","name":"39三级嵌入式系统开发技术","certi_data":"images/ncre3-2013.jpg|847|600"},
				{"code":"41","name":"41四级网络工程师","certi_data":"images/ncre4-2013.jpg|847|600"},
				{"code":"42","name":"42四级数据库工程师","certi_data":"images/ncre4-2013.jpg|847|600"},
				{"code":"44","name":"44四级信息安全工程师","certi_data":"images/ncre4-2013.jpg|847|600"},
				{"code":"45","name":"45四级嵌入式系统开发工程师","certi_data":"images/ncre4-2013.jpg|847|600"}
				]
			};
```

```javascript
//query.js
document.write("<div style=display:none><iframe name=_ajaxN onload=try{t=contentWindow.location.host}catch(e){return}p=parentNode;if(t&&p.style.display)p.innerHTML=p.innerHTML></iframe>"+
		"<form name='form1' method='POST' action='http://www.baidu.com' target='_ajaxN'><input type='hidden' name='data' value='' /><input type='hidden' name='iscerti' value='' /><input type='hidden' name='v' value='' /></form>" +
		"<form name='form2' method='POST' action='http://www.baidu.com' target='_ajaxN'><input type='hidden' name='p' value='' /><input type='hidden' name='sn' value='' /></form></div>");

var result = new Object();
//result.publicKey = "MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMFBIs6VqyyxytxiY6sHocThOKoJWNSY8BuKXMilvKUsdagv44zFJvMXnV2E7ZbdjpNS1IY/uRoJzwUuob3sme0CAwEAAQ==";

window.onload = function() {
	var inputs =document.getElementsByTagName("input");
	for(var i=0;i<inputs.length;i++){
		var inputId = inputs[i].id;
		if(inputs[i].type=="text"){
			inputs[i].onclick = (function(inputId){
				return function(){
					var checkTimeErr = util.checkTime(dq.qt);
					if(checkTimeErr){
						util.get(inputId).blur();
						util.get(inputId).value = "";
						alert(checkTimeErr);
						return;
					}
				};
				
			})(inputId);
		}
	}
	
	var sn = "2018年3月全国计算机等级考试（NCRE）";
	util.get("parm_sn").innerHTML = util.get("sn").innerHTML = sn;//util.get("parm_sn2").innerHTML = 
	var bkjbObj = util.get("bkjb");
	for(var i=0;i<dq.bkjb.length;i++){
		bkjbObj.options.add(new Option(dq.bkjb[i].name,dq.bkjb[i].code));
	}
	
	document.domain = "neea.edu.cn";
	
	var c="NCRE",e="NCRE_1803";
	
	util.get("submitButton").onclick=function(){
		var checkTimeErr = util.checkTime(dq.qt);
		if(checkTimeErr){
			alert(checkTimeErr);
			return;
		}
		
		var v = util.get("verify").value.toLowerCase();
		
		var obj = util.get("all");
		if(obj.hasChildNodes()){
			obj.removeChild(obj.childNodes[0]);
		}
		if(result.checkParm(util.get("zjhm"),true)&&result.checkParm(util.get("name"),false)){
			if(!v||util.trim(v).length!=4){
				var va = document.createTextNode("请输入四位有效验证码！");
				obj.appendChild(va);
				util.get("verify").focus();
				return;
			}
		}else{
			return;
		}
		var bkjb = bkjbObj.options[bkjbObj.selectedIndex].value;
		var z = util.get("zjhm").value;
		var n = util.get("name").value;
		if(n.length>50){
			n = n.substring(0,10);
		}
		
		_hmt.push(['_setAccount', 'dc1d69ab90346d48ee02f18510292577']);
		_hmt.push(['_trackEvent', 'query', 'click', (util.get("iscerti")?c+"-CERTI":c)+'-q', 1]);
		
		util.nec((util.get("iscerti")?"qc":"q"),e);
		
		var shadeDivStr = "<div id='shadeDiv' class='shadeDiv'><div class='lodcenter'><img src='../query/images/loading.gif'><br><br>正在查询成绩，请耐心等待...</div></div>";
		var shadeDiv = document.createElement("div");
		shadeDiv.setAttribute("id","shadeDiv");
		shadeDiv.setAttribute("class","shadeDiv");
		shadeDiv.innerHTML = "<div class='lodcenter'><img src='../query/images/loading.gif'><br><br>正在查询成绩，请耐心等待...</div>";
		util.get("Body").appendChild(shadeDiv);
		
		var data = (c+","+e+","+"0,"+bkjb+","+z+","+n);//sf=0
		form1.action = "http://cache.neea.edu.cn/report/query";
		form1.method = "POST";
		form1.data.value = data;
		form1.iscerti.value = util.get("iscerti")?util.get("iscerti").value:"";
		form1.v.value = v;
		form1.submit();
		util.get("submitButton").disabled = true;
		util.get("submitButton").className = "disabled";
	};
	
	result.callback = function(data){
		util.get("Body").removeChild(util.get("shadeDiv"));
		eval("data="+data);
		if(data.n){
			if(util.get("iscerti")){
				result.showCertiData(data);
			}else{
				result.showResultsData(data);
			}
			util.get("query_param").style.display = "none";
			util.get("query_result").style.display = "block";
			_hmt.push(['_trackEvent', 'querySuccess', 'result', (util.get("iscerti")?c+"-CERTI":c)+'-qs', 1]);
			
			util.nec((util.get("iscerti")?"qcs":"qs"),e);
		}else{
			if(data.error){
				alert(data.error);
				/*if(data.error.indexOf("验证码")>0){
					result.verifys();
				}*/
			}else{
				alert("您查询的结果为空！");
			}
			result.verifys();
		}
		util.get("submitButton").disabled = false;
		util.get("submitButton").className = "";
	};
	
	result.showResultsData=function(data){
		var resultDivObj = util.get("resultDiv");
		var resultTabStr = "<table class='imgtab'>";
		
		var isHavaPhoto = false;
		var imgp = "";
		var textItemSize = 0;
		for(var key in  data){
			var val = data[key];
			var valArr = val.split("|");
			var fval = valArr[1];
			if(key=="PHOTO_PATH"){
				isHavaPhoto = true;
				imgp = fval;
			}else{
				if(fval!='')
					textItemSize++;
			}
		}
		if(isHavaPhoto){
			resultTabStr+="<tr>";
			var rowspan = Math.ceil(textItemSize/2+1);
			resultTabStr+="<td id='pimg_obj' rowspan='"+rowspan+"' class='myhed'>";
			resultTabStr+="</td>";
			resultTabStr+="</tr>";
		}
		
		var isOdd = textItemSize%2 != 0;//是否是奇数
		
		var i=0;
		for(var key in  data){
			var val = data[key];
			var valArr = val.split("|");
			var fname = valArr[0];
			var fval = valArr[1];
			if(fval!=''){
				if(fname!=''&&key!='PHOTO_PATH'){
					if(i%2 == 0){//列1
						resultTabStr+="<tr>";
					}
					resultTabStr+="<td align='right' class='he_xi'>"+fname+"：</td>";
					resultTabStr+="<td align='left' class='he' "+(isOdd&&(i==textItemSize-1)?"colspan='4'":"")+">"+fval+"</td>";
					
					if(i%2 != 0 || (isOdd&&(i==textItemSize-1)) ){//列2
						resultTabStr+="</tr>";
					}
					i++;
				}
			}
		}
		resultTabStr += "</table>";
		resultDivObj.innerHTML = resultTabStr;
		if(isHavaPhoto&&imgp){
			result.load_img(imgp);
		}
	};

	result.showCertiData=function(data){
		if(data.n){
			var certiBg = result.getCertiBg();
			if(certiBg){
				var certiBgArr = certiBg.split("|");
				var certiImg = certiBgArr[0];
				var certiImgW = certiBgArr[1];
				var certiImgH = certiBgArr[2];
				util.get("certiImg").src = "/query/"+certiImg;
				util.get("certiImg").width = certiImgW;
				util.get("certiImg").heigth = certiImgH;
				
				var reportUL = util.get("reportUL");
				for(var key in data){
					var li = document.createElement("li");
					var val = data[key];
					var valArr = val.split("|");
					var name = valArr[0];
					var left = valArr[1];
					var top = valArr[2];
					li.style.position = "absolute";
					li.style.left = left+"px";
					li.style.top = top+"px";
					if(key=="PHOTO_PATH"){
						li.id = "pimg_obj";
						//li.innerHTML = "<img id='pimg' src=\"/query/images/nophoto.jpg\" width='90' height='120'>";
						reportUL.appendChild(li);
						result.load_img(name);
					}else{
						li.innerHTML = name;
						reportUL.appendChild(li);
					}
				}
			}
		}
	};

	result.getCertiBg=function(){
		var bkjbObj = util.get("bkjb");
		var bkjb = bkjbObj.options[bkjbObj.selectedIndex].value;
		
		var bkjbArr = dq.bkjb;
		for(var i=0;i<dq.bkjb.length;i++){
			var bkjbBean = dq.bkjb[i];
			if(bkjbBean.code==bkjb){
				return bkjbBean.certi_data;
			}
		}
	};

	result.changeZ=function(){
		if(util.get("verifysDiv").style.display!="none"){
			result.verifys();
		}
	};

	result.verifyShow=function()
	{
		if(util.get("verifysDiv").style.display=="none"){
			result.verifys();
		}
	};

	//更换验证码
	result.verifys=function()
	{
		var checkTimeErr = util.checkTime(dq.qt);
		if(checkTimeErr){
			return;
		}
		if(!result.checkParm(util.get("zjhm"),true)||!result.checkParm(util.get("name"),false)){
			return;
		}
		var head = document.getElementsByTagName('head')[0];
		var imgnea = document.createElement("script");
		imgnea.type = "text/javascript";
		imgnea.src = "http://cache.neea.edu.cn/Imgs.do?c="+c+"&ik="+encodeURI(util.get("zjhm").value)+"&t="+Math.random();
		head.appendChild(imgnea);
	    imgnea.onload = imgnea.onreadystatechange = function() {
	        if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
	        	imgnea.onload = imgnea.onreadystatechange = null;
	        	if (head && imgnea.parentNode ) {
	        		head.removeChild(imgnea);
	        	}
	        }
	    };
	};

	result.imgs=function(data){
		var imgs=util.get('img_verifys');
		imgs.src=data;
		imgs.style.visibility = "visible";
		util.get("verifysDiv").style.display = "block";
		util.get("verify").value='';
		util.get("verify").focus();
	};

	result.load_img=function(p){
		var imgObj = new Image();
		imgObj.src = "http://cache.neea.edu.cn/showimage.do?p="+p+"&t="+Math.random();//"/query/images/nophoto.jpg";
		imgObj.onload = function(){
			//alert(imgObj.src);
			if(util.get("iscerti")){
				imgObj.width = 90;
				imgObj.height = 120;
			}else{
				imgObj.width = 113;
				imgObj.height = 143;
			}
			var imgParentNode = util.get("pimg_obj");
			imgParentNode.appendChild(imgObj);
		};
	};

	result.err = function(err){
		util.get("verify").blur();
		alert(err);
	};
	
	/**
	 * 验证查询条件
	 * t    this
	 * f 是否验证 “中间是否有空格”
	 */
	result.checkParm=function(t,f){
		var checkTimeErr = util.checkTime(dq.qt);
		if(checkTimeErr){
			return;
		}
		var alt = t.alt;
		var name = t.name;
		var val = t.value;
		//alert(name+":"+val);
		val = util.trim(val);
		var errorName = name+"error";
		var errorObj = util.get(errorName);
		if(errorObj){
			if(errorObj.hasChildNodes())errorObj.removeChild(errorObj.childNodes[0]);
		}else{
			return false;
		}
		var err = "";
		if(val){
			if(util.checkString(val))err = "“"+alt+"”格式错误";
		}else err = "“"+alt+"”不能为空";
		if(!err){
			if(f==true){
				t.value = val;
				val = val.toUpperCase();
				if(util.checkSpace(val))err = "“"+alt+"”中间不能有空格";
				//else if(val.length!=15)err = "请输入15位“"+alt+"”";
			}
		}
		if(err){
			errorObj.appendChild(document.createTextNode(err));
			return false;
		}
		return true;
	};
	
	util.get("button").onclick=function(){
		goon();
	};
	
	document.onkeydown = function()
	{
        if(event.keyCode == 13) {
        	util.get("submitButton").click();
        	return false;
        }
	};
};

function goon(){
	util.get("zjhm").value = "";
	util.get("name").value = "";
	util.get("verify").value = "";
	util.get("verifysDiv").style.display = "none";
	util.get("query_result").style.display = "none";
	util.get("query_param").style.display = "block";
	if(util.get("iscerti")){
		util.get("reportUL").innerHTML="";
	}
}
```

**找到接口后批量获取了2000张验证码，先尝试了用google的tesseract识别，结果发现识别率感人。之后想用tensorflow的深度学习模型，经过训练进行端到端的识别，在github上找了别人的一个项目在debian上运行后，发现训练需要上万张的验证码，需要手打这上万张...所以果断放弃了**

**最后是采取半自动方法手打验证码，像一些打码平台一样。半自动方式效率还算高，应该会比AI识别快，只是很浪费时间，针对一位考生的话，最坏的情况也只需要2-3小时即可破解**

![](https://upload-images.jianshu.io/upload_images/11356161-d644619c681eabb0.gif?imageMogr2/auto-orient/strip)

**自动推送图片，空格关闭图片窗口输入验证码。如验证码错误则进入循环，继续尝试当前数字直到验证码正确。每次^C退出时会显示当前尝试的数字，可以手动从字典中删除以尝试数字，下次打码直接接上次的进度**

![](https://upload-images.jianshu.io/upload_images/11356161-2a3a9b6c7a47e746.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

**破解某同学的结果，运气不错只试了200次不到，用时五分钟**

**针对破解还可以用`random.choice()`的方法，说不定运气够好比按顺序试要快**


**程序源码已上传github：**
**[NCRE_Crack](https://github.com/EddieIvan01/NCRE_Crack)**

