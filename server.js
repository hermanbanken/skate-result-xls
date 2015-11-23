var express = require('express');
var app = express();
var https = require('https');
var http = require('http');
var examples = require('./examples');
var handle = require('./convert').handle;
var fs = require('fs');
var q = require('q');
var crypto = require('crypto');

app.get('/competitions', function (req, res) {
	res.type('json');
	q.nfcall(cache, "competitions", { postfix: '.json' }, function(cb) { 
		https.get("https://inschrijven.schaatsen.nl/api/competitions", function(response) {
			var body = '';
			response.on('data', function(d) { body += d; });
			response.on('end', function() {
				cb(null, new Buffer(body, 'utf-8'));
			});
		});
	}).then(body => {
		var list = JSON.parse(body);
		list = list.map(simplifyCompetition);
		res.json(list);
	}).fail(e => {
		res.send("Failed: "+e);
	});
});

var excelPattern = "http://emandovantage.com/api/competitions/:id/reports/Results/5";
app.get('/competitions/:id/results', function (req, res) {
	var id = req.params.id;
	q.nfcall(cache, "results"+id, { postfix: '.json' }, function(callback) {
		q
			.nfcall(cache, "results"+id, { postfix: '.xlsx' }, function(callback) { httpGet(excelPattern.replace(":id", id), callback); })
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
		if (!err) {
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