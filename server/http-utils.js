var q = require('q');
var https = require('https');
var http = require('http');
var querystring = require('querystring');
var urlTool = require('url');
var cache = require('./cache');

function httpGet(url, cb) {
	var data = [];
	http.get(url, function (res) {
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			if (chunk !== null) {
				data.push(Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, "utf8"));
			}
		});
		res.on('end', function() {
			cb(null, Buffer.concat(data));
		});
		res.on('error', function(err) {
			console.error("Error during HTTP request");
			cb(err, null);
		});
	});
}

function httpPost(url_path, post_data, cb) {
	var data = [];
	
	post_data = querystring.stringify({
      'compilation_level' : 'ADVANCED_OPTIMIZATIONS',
      'output_format': 'json',
      'output_info': 'compiled_code',
        'warning_level' : 'QUIET',
        'js_code' : post_data
  });
	
	var options = urlTool.parse(url_path);
	options.method = "POST";
	options.headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': Buffer.byteLength(post_data)
	};
	
	var req = http.request(options, function (res) {
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			if (chunk !== null) {
				data.push(Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, "utf8"));
			}
		});
		res.on('end', function() {
			cb(null, Buffer.concat(data));
		});
		res.on('error', function(err) {
			console.error("Error during HTTP request");
			cb(err, null);
		});
	});
	
	req.write(post_data);
	req.end();
}

// Basic JSON api call
function jsonApiPromise(url, cacheKey, cacheOptions) {
	return q.nfcall(cache, cacheKey, cacheOptions, function(cb) { 
		https.get(url, function(response) {
			var body = '';
			response.on('data', function(d) { body += d; });
			response.on('end', function() {
				cb(null, new Buffer(body, 'utf-8'));
			});
		});
	}).then(body => { return JSON.parse(body); });
}

function fetch(url, options) {
	if(typeof url == 'object'){
			options = url;
	}
	if(typeof options == 'undefined') {
		options = {};
	}
	
	var output = [];
	
	// Bare retrieval of data
	function retrieve() {
		var httpOptions = options.url || options.httpOptions || typeof url == 'string' && urlTool.parse(url);	
		var tool = (options.https || httpOptions.protocol == "https:" ? https : http);
		var method = tool[options.method || 'get'];
		var source = q.defer();
		
		method(httpOptions, function(response) {
			if(options.dataType == 'binary')
				response.setEncoding('binary');

			response.on('data', function(d) { 
				if(d == null) return;
				if(options.dataType == 'binary') {
					output.push(Buffer.isBuffer(d) ? d : new Buffer(d, "binary"));
					return;
				}
				output.push(d);
			});

			response.on('error', function(e) {
				source.reject(new Error(e));
			});

			response.on('end', function() {
				if(options.dataType == 'binary') {
					source.resolve(Buffer.concat(output));
				} else {
					source.resolve(new Buffer(output.join(""), 'utf-8'));
				}
			});
		});
		
		if(typeof options.validate == 'function')
			return source.promise.then(data => {
				if(!options.validate(data))
					throw new Error("Invalid response");
				return data;
			});
		else
			return source.promise;
	}
	
	var promise = q.defer().promise;
	
	// Utilise cache or note
	if(options.cache) {
		if(!options.cache.key)
			options.cache.key = typeof url == 'string' ? url : JSON.stringify(url);
		promise = cache(options.cache.key, options.cache, retrieve);
	} else {
		promise = retrieve();
	}
	
	// Validate cache too	
	if(typeof options.validate == 'function')
		promise = promise.then(data => {
			if(!options.validate(data))
				throw new Error("Invalid response");
			return data;
		});

	// Unwrap buffer
	if(options.dataType != 'binary')
		promise = promise.then(buffer => Buffer.isBuffer(buffer) ? buffer.toString() : buffer);
	
	// Parse json
	if(options.dataType == 'json')
		promise = promise.then(data => JSON.parse(data));
		
	return promise;
}

module.exports = {
	httpGet: httpGet,
	httpPost: httpPost,
	jsonApiPromise: jsonApiPromise,
	fetch: fetch
}