var q = require('q');
var https = require('https');
var http = require('http');
var querystring = require('querystring');
var url = require('url');
var cache = require('./cache');

function httpGet(url, cb) {
	var data = [];
	http.get(url, function (res) {
		res.setEncoding('binary');
		res.on('data', function(chunk) {
			if (chunk !== null) {
				data.push(Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, "binary"));
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
	
	var options = url.parse(url_path);
	options.method = "POST";
	options.headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': Buffer.byteLength(post_data)
	};
	
	var req = http.request(options, function (res) {
		res.setEncoding('binary');
		res.on('data', function(chunk) {
			if (chunk !== null) {
				data.push(Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, "binary"));
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

module.exports = {
	httpGet: httpGet,
	httpPost: httpPost,
	jsonApiPromise: jsonApiPromise
}