/*
 * this is a test that tests mockAjax, NOT an example of how to use mockAjax in real life
 * Note that JsHamcrest is so awesome that I used in both as the tests assert library, AND inside the code under test
 */

MockAjaxTest = TestCase("mockAjax");

MockAjaxTest.prototype = {
	testMockAjax: function() {
		assertThat(window, hasMember("MockAjax"), "MockAjax exists fail");
	},
	testIntegration: function() {
		assertThat(window.MockAjax, hasMember("Integration"), "MockAjax has an Integration binder fail");
		var cx = {};
		MockAjax.Integration.integrateWithSrcLib(cx, "xhr");
		assertThat(cx, hasFunction("xhr"), "integrateWithSrcLib fail");
		MockAjax.Integration.integrateWithTestLib(cx);
		assertThat(cx, hasFunction("whenRequest"), "integrateWithTestLib fail");
		assertThat(cx, hasFunction("respond"), "respond function integrated with test lib fail");
		assertThat(cx, hasFunction("respondAll"), "respondAll function integrated with test lib fail");
		assertThat(cx, hasFunction("timeout"), "timeout function integrated with test lib fail");
	},
	testReadyStateChange: function() {
		MockAjax.reset();
		var eventRS;
		var cx = {};
		MockAjax.Integration.integrateWithSrcLib(cx, "xhr");
		var xhr = cx.xhr();
		xhr.onreadystatechange = function() { eventRS = xhr.readyState; };
		assertThat(xhr.readyState, is(0), "readyState intitially 0 fail");
		xhr.open("GET", "/articles/1", false);
		assertThat(xhr.readyState, is(1), "readyState after open is 1 fail");
		assertThat(eventRS, is(1), "onreadystatechange fires after open fail");
		xhr.send();
		assertThat(xhr.readyState, is(4), "readyState after sync send is 4 fail");
		assertThat(eventRS, is(4), "onreadystatechange fires 4 after sync send fail");
	},
	testAsyncReadyStateChange: function() {
		MockAjax.reset();
		var eventRS;
		var cx = {};
		MockAjax.Integration.integrateWithSrcLib(cx, "xhr");
		var xhr = cx.xhr();
		xhr.onreadystatechange = function() { eventRS = xhr.readyState; };
		assertThat(xhr.readyState, is(0), "readyState intitially 0 fail");
		xhr.open("GET", "/articles/1", true);
		assertThat(xhr.readyState, is(1), "readyState after open is 1 fail");
		assertThat(eventRS, is(1), "onreadystatechange fires after open fail");
		xhr.send();
		MockAjax.respond();
		assertThat(xhr.readyState, is(4), "readyState after sync send is 4 fail");
		assertThat(eventRS, is(4), "onreadystatechange fires 4 after sync send fail");
	},
	testHamcrestMatching: function() {
		var lastStatus, lastData;
		var q = { ajax: function(url) {
			var xhr = this.xhr();
			xhr.open("GET", url, false); // don't use async
			xhr.onreadystatechange = function() {
				if(xhr.readyState === 4) {
					lastStatus = xhr.status;
					lastData = xhr.responseText;
				}
			};
			xhr.send();
		} };
		MockAjax.Integration.integrateWithSrcLib(q, "xhr");
		
		MockAjax.reset();
		MockAjax
			.whenRequest({ url: startsWith("/good") })
			.thenRespond({ status: 200, data: '200 - all good' });
		MockAjax
			.whenRequest({ url: startsWith("/auth") })
			.thenRespond({ status: 401, data: '401 - auth required!' });
		MockAjax
			.whenRequest({ url: startsWith("/error") })
			.thenRespond({ status: 500, data: '500 - internal server error' });
		q.ajax("/good");
		assertThat(lastStatus, is(200), "found 200 url");
		q.ajax("/auth");
		assertThat(lastStatus, is(401), "found 401 url");
		q.ajax("/error");
		assertThat(lastStatus, is(500), "found 500 url");
		q.ajax("/somethingelse");
		assertThat(lastStatus, is(404), "found 404 url");
	},
	testComplexMatching: function() {
		var lastStatus, lastData;
		var q = { ajax: function(method, url, username, password) {
			var xhr = this.xhr();
			xhr.open(method, url, false, username, password); // don't use async
			xhr.onreadystatechange = function() {
				if(xhr.readyState === 4) {
					lastStatus = xhr.status;
					lastData = xhr.responseText;
				}
			};
			xhr.send();
		} };
		MockAjax.Integration.integrateWithSrcLib(q, "xhr");

		MockAjax.reset();
		MockAjax
			.whenRequest({ method: is("HEAD"), url: startsWith("/good") })
			.thenRespond({ data: '' });
		MockAjax
			.whenRequest({ method: is("GET"), url: startsWith("/good") })
			.thenRespond({ data: "200-ok" });
		MockAjax
			.whenRequest({ username: is("me"), password: is("secret") })
			.thenRespond({ data: "auth-ok" });
		MockAjax
			.whenRequest({ method: anyOf(is("GET"), is("POST")), url: endsWith("&pretty=true") })
			.thenRespond({ data: "pretty-print" });
		MockAjax
			.whenRequest({ method: anyOf("PUT", "DELETE"), url: matches(/blog\/\d+/), username: is("admin") })
			.thenRespond({ data: "manipulate-ok" });
		
		q.ajax("HEAD", "/good?foo=bar");
		assertThat(lastData, equalTo(""), "matches multiple params fail");
		q.ajax("GET", "/good/1");
		assertThat(lastData, equalTo("200-ok"));
		q.ajax("GET", "/good/1");
		assertThat(lastData, equalTo("200-ok"), "reuse request fail");
		q.ajax("POST", "/good");
		assertThat(lastStatus, is(404), "should match all matchers fail");
		q.ajax("GET", "/something/else?foo=bar&pretty=true");
		assertThat(lastData, equalTo("pretty-print"), "end matching with anyOf fail");
		q.ajax("PUT", "/my/blog/143", "admin");
		assertThat(lastData, equalTo("manipulate-ok"), "3 matchers and regexp fail");
	},
	testJQueryIntegration: function() {
		MockAjax.reset();
		MockAjax.Integration.jQuery($);
		
		var cx = { reset: function() { this.data = null; this.callbacks = []; } };
		$.ajaxSetup({
			context: cx,
			success: function(d,s,x) { this.data = d; this.callbacks.push("success="+x.status); }, 
			error: function(x,e) { this.callbacks.push("error="+e+","+x.status); },
			complete: function(x) { this.callbacks.push("complete"); }
		});
		
		MockAjax.whenRequest({ url: equalTo("/bar") }).thenRespond({ data: '{"foo":"bar"}' });

		cx.reset();
		$.ajax({ url: "/foo" });
		MockAjax.respond();
		assertThat(cx.callbacks.join("|"), equalTo("error=error,404|complete"), "jquery correctly generates error fail");

		cx.reset();
		$.ajax({ url: "/bar" });
		MockAjax.respond();
		assertThat(cx.callbacks.join("|"), equalTo("success=200|complete"), "jquery correctly generates success fail:");
		assertThat(cx.data, hasMember("foo"), "jquery correctly processes json response");

		// test timeout behaviour
		cx.reset();
		$.ajax({ url: "/bar", timeout: 60000 });
		MockAjax.timeout();
		assertThat(cx.callbacks.join("|"), equalTo("error=timeout,0|complete"), "jquery timeout request fail");

		cx.reset();
		$.ajax({ url: "/bar", timeout: 60000 });
		MockAjax.respond();
		assertThat(cx.callbacks.join("|"), equalTo("success=200|complete"), "jquery did not timeout request fail");
		
		// test out of order responses
		MockAjax.reset();
		cx.reset();
		MockAjax.whenRequest({ url: is("/foo") }).thenRespond({ data: '{"d":"foo"}' });
		MockAjax.whenRequest({ url: is("/bar") }).thenRespond({ data: '{"d":"bar"}' });
		MockAjax.whenRequest({ url: is("/baz") }).thenRespond({ data: '{"d":"baz"}' });
		
		// fire off three simultaneous async requests
		$.ajax({ url: "/foo" });
		$.ajax({ url: "/bar" });
		$.ajax({ url: "/baz" });
		
		MockAjax.respond(1); // responds with the inflight request in array index 1 (the middle of 3 requests)
		assertThat(cx.data.d, equalTo("bar"), "middle request returned first fail");
		MockAjax.respond(1); // responds with the inflight request in array index 1 (the last of 2 requests)
		assertThat(cx.data.d, equalTo("baz"), "last request returned next fail");
		MockAjax.respond(0); // responds with the final inflight request
		assertThat(cx.data.d, equalTo("foo"), "first request returned last fail");
	},
	testReverseIntegration: function() {
		MockAjax.Integration.returnTimers(window);
	},
	testJSObjectResponse: function() {
		MockAjax.reset();
		MockAjax.Integration.jQuery($);
		
		var cx = { reset: function() { this.data = null; this.callbacks = []; } };
		$.ajaxSetup({
			context: cx,
			success: function(d,s,x) { this.data = d; this.callbacks.push("success="+x.status); }, 
			error: function(x,e) { this.callbacks.push("error="+e+","+x.status); },
			complete: function(x) { this.callbacks.push("complete"); }
		});
		
		MockAjax.whenRequest({ url: equalTo("/bar") }).thenRespond({ data: {foo:"bar"} });

		cx.reset();
		$.ajax({ url: "/foo" });
		MockAjax.respond();
		assertThat(cx.callbacks.join("|"), equalTo("error=error,404|complete"), "jquery correctly generates error fail");

		cx.reset();
		$.ajax({ url: "/bar" });
		MockAjax.respond();
		assertThat(cx.callbacks.join("|"), equalTo("success=200|complete"), "jquery correctly generates success fail:");
		assertThat(cx.data, hasMember("foo"), "jquery correctly processes json response");
		assertThat(cx.data.foo, is("bar"), "mockAjax correctly processes JavaScript Object response");
	}
};