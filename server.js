var express = require('express');
var app = express();
var q = require('q');
// Our lib:
var examples = require('./examples');
var handle = require('./convert').handle;
// Our utils:
var osta = require('./server/osta');
var ssr = require('./server/ssr');
var httpUtils = require('./server/http-utils');
var httpGet = httpUtils.httpGet;
var jsonApiPromise = httpUtils.jsonApiPromise;
var cache = require('./server/cache');

// Vars:
var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var excelPattern = vantage+"competitions/:id/reports/Results/5";
var ostaPattern = "http://www.osta.nl/?ZoekStr=:q"
var ssrPattern = "http://speedskatingresults.com/api/json/skater_lookup?familyname=:ln&givenname=:fn"

var competitionsPromise = () => jsonApiPromise(base+"competitions", "competitions", { postfix: '.json', expired: cache.maxAge(5,'m') });
var competitionPromise = (id) => jsonApiPromise(base+"competitions/:id".replace(":id", id), "competition", { postfix: '.api.json', expired: cache.maxAge(5,'m') });

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

app.get('/api/competitions/:id/result', function (req, res) {
	var id = req.params.id;
	
	q.nfcall(cache, "results"+id, { postfix: '.json', expired: cache.maxAge(5,'m') }, function(callback) {
		q
			.nfcall(cache, "results"+id, { postfix: '.xlsx', expired: cache.maxAge(5,'s') }, function(callback) { httpGet(excelPattern.replace(":id", id), callback); })
			.then(data => {
				return q.nfcall(handle, data.toString("binary"), {base64: false, checkCRC32: true});	
			})
			.then(data => callback(null, new Buffer(JSON.stringify(data), 'binary')))
			.fail(err => callback(err, null));	
	})
	.then(times => res.json(JSON.parse(times)))
	.fail(e => res.send("Failed: "+e));
});

app.get('/api/skaters/find', function (req, res){
	var name = req.query.first_name + " " + req.query.last_name;
	var id = JSON.stringify([ req.query.first_name, req.query.last_name, req.query.birthdate ]);
	
	var p_osta = q
		.nfcall(cache, "osta"+name, { postfix: '.osta.html', expired: cache.maxAge(10, 'd') }, function(callback) {
			httpGet(ostaPattern.replace(":q", name), callback);
		})
		.then(osta.parseSearch);
	
	var p_ssr = q
	  .nfcall(cache, "ssr"+name, { postfix: '.ssr.json', expired: cache.maxAge(10, 'd') }, function(callback) {
			httpGet(ssrPattern.replace(':ln', req.query.last_name).replace(':fn', req.query.first_name), callback);
		})
		.then(ssr.parseSearch);
		
	q.all([p_osta, p_ssr])
 	  .then(result => res.json([].concat.apply([], result)))
	  .fail(err => res.send("Failed: "+e));
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