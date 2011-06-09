/**
 * MockAjax is a Mock Object for simulating asyncronous server requests in a synchronous testing environment
 * it is specifically designed for use with jsHamcrest and works well with jsTestDriver and jQuery
 *
 * setup like this
 * MockAjax.integrate.jsTestDriver().jQuery()
 *
 * when MockAjax is used it responds as a normal XMLHttpRequest, but rather than going to the server
 * it responds with a response based on applying hamcrest matches against the requests that the test make
 *
 * by default there is only one response (which matches all requests) which is a 404
 * add additional responses using the following pattern
 *
 * whenRequest({ url: startsWith("/article/1") })
 * 	.respondWith({ data: '{"title":"Something","body":"This is a body"}');
 *
 * note in particular that whenRequest uses hamcrest style matchers
 * both whenRequest and respondWith contain many options which support common tests simply
 * while allowing you to simulate quite complex server interaction
 *
 * see github.com/mobz/mockajax
 */
(function() {
	var version = "1.1";

	var defaultAction = {
		req: { }, // always matches
		res: { status: 404, data: "Mock Error: No matching response to request" }
	};

	var actionCache,	// maps requests to responses
		responseQueue,	// array of responses awaiting delivery 
		timerQueue;		// array of timers waiting to respond
		
	function MockXHR() {	// Mock XMLHttpRequest constructor
		this._action;	 			// the matching record in the actionCache
		this._sig;					// signature for this request

		this.readyState = 0;
		this.status = 0;
	}

	MockXHR.prototype = {
		_removeFromResponseQueue: function() {
			for(var i=0; i < responseQueue.length; i++) {
				if(responseQueue[i] === this) {
					responseQueue.splice(i, 1);
					return true;
				}
			}
		},
		_respond: function() {
			var res = this._response;
			this.status = res.status || 200;
			this.responseXML = res.data || null;
			this.responseText = res.data || "";
			this._removeFromResponseQueue();
			this._readystatechange(4);
		},
		_readystatechange: function(state) {
			this.readyState = state;
			if(this.onreadystatechange) {
				this.onreadystatechange.call(null);
			}
		},
		open: function(pmethod, purl, pasync, pusername, ppassword) {
			this._async = pasync !== false;
			this._sig = { method: pmethod, url: purl, async: this._async, username: pusername || null, password: ppassword || null, headers: {} };
			this._readystatechange(1);
		},
		send: function(data) {
			var sig = this._sig;
			sig.data = data;

			actions: for(var i = actionCache.length - 1; i >= 0; i--) {
				var req = actionCache[i].req;
				for(var param in req) {
					if(Object.hasOwnProperty.call(req, param) && (param in sig)) {
						if(! req[param].matches(sig[param])) {
							continue actions;
						}
					}
				}

				this._action = actionCache[i];

				this._response = (typeof this._action.res === 'function') ? this._action.res(sig, this) : this._action.res;

				// serialise objects if needed			
				if ((this._action.res.type === undefined || this._action.res.type === "json") && typeof this._action.res.data !== "string" ) {
					if (JSON && JSON.stringify) {
						this._action.res.data = JSON.stringify(this._action.res.data);
					} else {
						throw "JSON required for in-line serialisation, but not available";
					}
				}		

				responseQueue.push(this);

				break;
			}

			// if it is a synch request respond immediatly
			if(!this._async) {
				this._respond();
			}
		},
		abort: function() {
			if(this._action) {
				this._removeFromResponseQueue();
				this.readyState = 0; // do not send readystatechange event
			} else {
				this._readystatechange(0);
			}
		},
		setRequestHeader: function(header, value) {
			if(this.readyState !== 1) {
				throw "INVALID_STATE_ERR";
			} else {
				this._sig.headers[header] = value;
			}
		},
		getAllResponseHeaders: function() {
			var self = this,
				resHeaders = this._response.headers || {},
				cannedHeaders = "last-modified,server,content-length,content-type".split(","),
				headers = [],
				pushHeader = function(h) { headers.push(h + ": " + self.getResponseHeader(h)); };
			for(var i = 0; i < cannedHeaders.length; i++) {
				pushHeader(cannedHeaders[i]);
			}
			for(var k in resHeaders) {
				if(Object.hasOwnProperty.call(resHeaders, k)) {
					pushHeader(k);
				}
			}
			return headers.join("\n\r");
		},
		getResponseHeader: function(header) {
			var res = this._response;
			if(res.headers && res.headers[header]) {
				return res.headers[header];
			}
			if(/^last-modified/i.test(header)) {
				return "Thu, 01 Jan 1970 00:00:00 GMT";
			} else if(/^server/i.test(header)) {
				return "MockAjax/"+version;
			} else if(/^content-length/i.test(header)) {
				return (res.data || "").length.toString();
			} else if(/^content-type/i.test(header)) {
				switch(res.type) {
				case "xml" : return "application/xml";
				case "html" : return "text/html";
				case "script" : return "text/javascript";
				case "text" : return "text/plain";
				case "default" : return "*/*";
				default : return "application/json";
				}
			}
			return null;
		}
	}

	var ma = window.MockAjax = {
		Integration: {
			savedGlobals: {},
			// integrates with src lib such that our MockXHR is called rather than the browser implementation
			integrateWithSrcLib: function(cx, name) {
				cx[name] = function() { return new MockXHR(); };
				return this;
			},
			// integrates with test lib such that whenRequest, request and timeout are in the scope that tests are run
			integrateWithTestLib: function(cx) {
				cx.whenRequest = ma.whenRequest;
				cx.respond = ma.respond;
				cx.respondAll = ma.respondAll;
				cx.timeout = ma.timeout;
				return this;
			},
			stealTimers: function(cx) {
				this.savedGlobals.setTimeout = cx.setTimeout;
				this.savedGlobals.clearTimeout = cx.clearTimeout;
				cx.setTimeout = function(f, t) {
					timerQueue.push(f);
					return timerQueue.length - 1; 
				};
				cx.clearTimeout = function(i) {
					if(timerQueue[i]) {
						timerQueue[i] = null;
					}
				}
				return this;
			},
			returnTimers: function(cx) {
				cx.setTimeout = this.savedGlobals.setTimeout;
				cx.clearTimeout = this.savedGlobals.clearTimeout;
				return this;
			},
			jasmine: function() { return this.integrateWithTestLib(window); },
			JsTestDriver: function() { return this.integrateWithTestLib(window); },
			JsUnitTest: function() { return this.integrateWithTestLib(JsUnitTest.Unit.Testcase.prototype); },
			jsUnity: function() { return this.integrateWithTestLib(jsUnity.env.defaultScope); },
			QUnit: function() { return this.integrateWithTestLib(window); },
			Rhino: function() { return this.integrateWithTestLib(window); },
			YUITest: function() { return this.integrateWithTestLib(window); },
			screwunit: function() { return this.integrateWithTestLib(Screw.Matchers); },

			jQuery: function(cx) {
				this.stealTimers(window);
				this.integrateWithSrcLib(( cx || jQuery || $).ajaxSettings, "xhr");
				return this;
			},
			Prototype: function(cx) {
				this.stealTimers(window); // prototypejs does not appear to handle request timeouts natively
				this.integrateWithSrcLib( cx || Ajax, "getTransport" );
				return this;
			},
			Zepto: function() {
				this.stealTimers(window);
				window.XMLHttpRequest = MockXHR;
				return this;
			}
		},
		whenRequest: function(req) {
			var action = { req: req, res: {} };
			actionCache.push(action);
			return {
				thenRespond: function(res) {
					action.res = res;
				}
			};
		},
		respond: function(n) {
			responseQueue[n || 0]._respond();
		},
		respondAll: function() {
			while (responseQueue.length > 0) {
				this.respond();
			};
		},		
		timeout: function() {
			for(var i = 0; i < timerQueue.length; i++) {
				if(timerQueue[i]) {
					timerQueue[i].call(null)
					timerQueue[i] = null;
					break;
				}
			}
		},
		reset: function() {
			actionCache = [ defaultAction ];
			responseQueue = [];
			timerQueue = [];
		}
	};
	
	ma.reset();
})();