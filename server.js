var express = require('express');
var app = express();
var https = require('https');
var http = require('http');
var examples = require('./examples');
var handle = require('./convert').handle;
var fs = require('fs');
var q = require('q');
var crypto = require('crypto');

function maxAge(count, type) {
	var delta = 0;
	switch(type) {
		case 'd': delta = count * 1000 * 3600 * 24; break;
		case 'h': delta = count * 1000 * 3600; break;
		case 'm': delta = count * 1000 * 60; break;
		case 's': delta = count * 1000; break;
	}
	return (stats) => (new Date()).getTime() - stats.mtime.getTime() > delta;
}

// Basic JSON api call
var jsonApiPromise = (url, cacheKey, cacheOptions) => q.nfcall(cache, cacheKey, cacheOptions, function(cb) { 
	https.get(url, function(response) {
		var body = '';
		response.on('data', function(d) { body += d; });
		response.on('end', function() {
			cb(null, new Buffer(body, 'utf-8'));
		});
	});
}).then(body => { return JSON.parse(body); });

var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var competitionsPromise = () => jsonApiPromise(base+"competitions", "competitions", { postfix: '.json', expired: maxAge(5,'m') });
var competitionPromise = (id) => jsonApiPromise(base+"competitions/:id".replace(":id", id), "competition", { postfix: '.api.json', expired: maxAge(5,'m') });

app.get('/api/competitions', function (req, res) {
	res.type('json');
	competitionsPromise().then(list => {
		list = list.map(simplifyCompetition);
		res.json(list);
	}).fail(e => {
		res.send("Failed: "+e);
	});
});

app.get('/api/competitions/:id', function (req, res) {
	var id = req.params.id;
	res.type('json');
	competitionPromise(id).then(obj => {
		res.json(obj);
	}).fail(e => {
		res.send("Failed: "+e);
	});
});

var excelPattern = vantage+"competitions/:id/reports/Results/5";
app.get('/api/competitions/:id/result', function (req, res) {
	var id = req.params.id;
	
	q.nfcall(cache, "results"+id, { postfix: '.json', expired: maxAge(5,'m') }, function(callback) {
		q
			.nfcall(cache, "results"+id, { postfix: '.xlsx', expired: maxAge(5,'s') }, function(callback) { httpGet(excelPattern.replace(":id", id), callback); })
			.then(data => {
				return q.nfcall(handle, data.toString("binary"), {base64: false, checkCRC32: true});	
			})
			.then(data => callback(null, new Buffer(JSON.stringify(data), 'binary')))
			.fail(err => callback(err, null));	
	})
	.then(times => res.json(JSON.parse(times)))
	.fail(e => res.send("Failed: "+e));
});

app.use('/', express.static(__dirname + '/web'));

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Converter server listening at http://%s:%s', host, port);
});

var allowed = ["discipline", "starts", "ends", "name", "id", "location", "resultsStatus", "venue"];
function simplifyCompetition(comp){
	Object.keys(comp)
		.filter(key => allowed.indexOf(key) == -1)
		.forEach(key => delete comp[key]);
	return comp;
}

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

function cache(key, options, get, callback){
	if(typeof options == 'function'){
		callback = get;
		get = options;
		options = {};
	}
	
	var hash = crypto.createHash('md5').update(key).digest('hex');
	var file = 'cache/'+(options.prefix || "")+hash+(options.postfix || "");
	fs.stat(file, function (err, stats) {
		if (!err && (typeof options.expired != 'function' || !options.expired(stats))) {
			fs.readFile(file, 'binary', callback);
		} else {
			get(function(err, data) {
				if(err)
					throw err;
				fs.writeFile(file, data, 'binary', function(err, success) {
					callback(err, Buffer.isBuffer(data) ? data.toString("binary") : data);
				});
			});
		}
	});
}