/*
 * catalog
 * 根据标题生成目录
 * Copyright 2015-2015
 * Authors: Wang Zhuo
 * All Rights Reserved.

 * Project: https://github.com/wzdark
*/
/* global define */
(function($) {
	if (!$) {
		console.warn("error on loading jquery-catalog. please use jquery before jquery-catalog!");
		return;
	}

	/*目录节点类*/
	/*
	 * @para jqObj 该节点的jquery对象
	 */
	function Node(jqObj) {
		this.top = jqObj.offset().top;
		this.jqObj = jqObj;
		this.childNodes = [];
		this.level = jqObj[0].tagName.substr(1, 1);


		//设置id和name属性 
		this.name = jqObj.text();
		jqObj.attr("id", this.name);
		jqObj.attr("name", this.name);
	}

	/*end 目录节点类*/
	
	

	$.fn.generateCatalog = function(options) {

		var opts = $.extend({}, $.fn.generateCatalog.defaults, options);
		
		//容器
		var catalogContainer = $(this);
		
		//获取所有的h标签并计算位置,按top排序，top越小排名越靠前
		var hItems = getHeaders($(opts.root));
		
		var header = $("<div class='toc-header'>目录</div>").appendTo(catalogContainer);
		
		var wrap = $("<div class='toc-wrap' />").appendTo(catalogContainer);
		for (var i = 0; i < hItems.length; i++) {
			generateHeader(hItems[i], wrap);
		}
		var btn = $("<a class='catalogBtn' data-state='show'>[隐藏]</a>").appendTo(header);

		var wrapHeight =   wrap.height();
		wrap.css("height", wrapHeight);
		
		btn.click(function() {
			//隐藏
			if ("show" == $(this).attr("data-state")) {
				wrap.css("height", "0");
				$(this).attr("data-state", "hide");
				$(this).text("[显示]");
			}
			//显示
			else {
				wrap.css("height", wrapHeight);
				$(this).attr("data-state", "show");
				$(this).text("[隐藏]");
			}

		});

		
	};
	
	/*默认的文章是整个window*/
	$.fn.generateCatalog.defaults = {
		root : window
	};
	
	/*根据node对象生成目录*/
	function generateHeader(node, container) {
		var tempRoot = container;
		for (var i = 1; i <= node.level; i++) {
			var ul = $("<ul></ul>").appendTo(tempRoot);
			var li = $("<li></li>").appendTo(ul);
			tempRoot = li;
		}
		$("<a href='#" + node.name + "'>" + node.name + "</a>").appendTo(tempRoot);
	}
	
	/*获取dom元素root下的所以标题，并且按照top值先后顺序排序*/
	function getHeaders(root) {
		var res = [];
		for (var i = 0; i < 7; i++) {
			var items = root.find('h' + i);
			for (var index = 0; index < items.length; index++) {
				var node = new Node($(items[index]));
				res.push(node);
			}
		}

		res.sort(function(x, y) {
			if (x.top > y.top) {
				return 1;
			} else {
				return -1;
			}
		});

		return res;
	}



}(jQuery));

