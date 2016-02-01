'use strict';

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
var fetch = httpUtils.fetch;
var cache = require('./server/cache');

// Vars:
var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var excelPattern = vantage + "competitions/:id/reports/Results/5";
var ostaPattern = "http://www.osta.nl/?ZoekStr=:q";
var ssrPattern = "http://speedskatingresults.com/api/json/skater_lookup?familyname=:ln&givenname=:fn";
var ssrProfilePattern = "http://speedskatingresults.com/index.php?p=17&s=:sid";
var ssrSeasonBestPattern = "http://speedskatingresults.com/api/json/season_bests.php?skater=:sid&start=:start&end=:end";
var ssrCompetitonsPattern = "http://speedskatingresults.com/api/json/skater_competitions.php?skater=:sid&season=:season";
var ssrCompetitonPattern = "http://speedskatingresults.com/index.php?p=6&e=:cid";
var ostaTimesPattern = "http://www.osta.nl/?pid=:pid&Seizoen=ALL&Afstand=&perAfstand=0";
var ostaRitPattern = "http://www.osta.nl/rit.php?ID=:rid";

var competitionsPromise = function competitionsPromise() {
	return fetch(base + "competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(5, 'm') } });
};
var competitionPromise = function competitionPromise(id) {
	return fetch(base + "competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:" + id, postfix: '.api.json', expired: cache.maxAge(5, 'm') } });
};

function onError(e) {
	this.send(500, e.stack.replace(/\n/g, "\n<br>").replace(/\s/g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"));
}

// List of competitions
app.get('/api/competitions', function (req, res) {
	res.type('json');
	competitionsPromise().then(function (l) {
		return l.map(simplifyCompetition);
	}).then(function (l) {
		return res.json(l);
	}).fail(onError.bind(res));
});

// Single competition with more detail
app.get('/api/competitions/:id', function (req, res) {
	res.type('json');
	competitionPromise(req.params.id).then(function (obj) {
		res.json(obj);
	}).fail(onError.bind(res));
});

app.del('/api/competitions/:id', function (req, res) {
	var id = req.params.id;
	console.log("Deleting", id);
	q.all([cache.delete("competition:" + id, { postfix: '.api.json' }), cache.delete("results:" + id, { postfix: '.json' }), cache.delete("xlsx:" + id, { postfix: '.xlsx' })]).then(function (v) {
		return res.send(200);
	}).fail(onError.bind(res));
});

// Resulting times from a competition
app.get('/api/competitions/:id/result', function (req, res) {
	var id = req.params.id;
	cache("results:" + id, { postfix: '.json', expired: cache.maxAge(5, 'm') }, function () {
		return httpUtils
		// Fetch XLSX
		.fetch(excelPattern.replace(":id", id), { dataType: 'binary', cache: { encoding: 'binary', key: 'xlsx:' + id, postfix: '.xlsx' } })
		// Parse XLSX to result JSON output
		.then(function (data) {
			return q.nfcall(handle, data.toString('binary'), { base64: false, checkCRC32: true });
		})
		// Prepare for json file storage
		.then(function (data) {
			return new Buffer(JSON.stringify(data), 'utf8');
		});
	}).then(function (times) {
		return res.json(JSON.parse(times));
	}).fail(onError.bind(res));
});

// Query linkable services to user name and birthdate
app.get('/api/skaters/find', function (req, res) {
	var name = req.query.first_name + " " + req.query.last_name;
	var id = JSON.stringify([req.query.first_name, req.query.last_name, req.query.birthdate]);

	var osta_url = ostaPattern.replace(":q", name);
	var p_osta = httpUtils.fetch(osta_url, { cache: { key: "osta." + id, postfix: '.osta.html', expired: cache.maxAge(10, 'd') } }).then(osta.parseSearch);

	function addProfileDetails(person) {
		var url = ssrProfilePattern.replace(':sid', person.code);
		return httpUtils.fetch(url, { cache: { key: "ssr." + person.code, postfix: '.ssr.json', expired: cache.maxAge(10, 'd') } }).then(ssr.parseProfile).then(function (profile) {
			person.birthdate = profile.birthdate;
			person.current_category = profile.current_category;
			return person;
		});
	}

	var ssr_url = ssrPattern.replace(':ln', req.query.last_name).replace(':fn', req.query.first_name);
	var p_ssr = httpUtils.fetch(ssr_url, { cache: { key: "ssr." + id, postfix: '.ssr.json', expired: cache.maxAge(10, 'd') } }).then(ssr.parseSearch).then(function (list) {
		return q.all(list.map(addProfileDetails));
	});

	q.all([p_osta, p_ssr]).then(function (result) {
		return res.json([].concat.apply([], result));
	}).fail(onError.bind(res));
});

// Query skate result times from Osta
app.get('/api/skaters/osta/:pid', function (req, res) {
	var pid = req.params.pid;

	if (req.query.rid) {
		var rid = req.query.rid;
		var validate = function validate(data) {
			if (data.indexOf("Geen rit informatie opgevraagd.") < 0) return true;
			throw new Error("404 - invalid RID");
		};

		httpUtils.fetch(ostaRitPattern.replace(":rid", rid), { validate: validate, cache: { key: "osta.rit:" + rid, postfix: '.osta.html', expired: cache.maxAge(365, 'd') } }).then(osta.parseRaceDetail).then(function (detail) {
			return res.json({
				times: detail,
				more: []
			});
		}).fail(onError.bind(res));
		return;
	}

	var validate = function validate(data) {
		if (data.indexOf('class="seizoen"') >= 0) return true;
		throw new Error("404 - id not found");
	};

	httpUtils.fetch(ostaTimesPattern.replace(":pid", pid), { validate: validate, cache: { key: "osta.times:" + pid, postfix: '.osta.html', expired: cache.maxAge(1, 'd') } }).then(osta.parsePersonTimes).then(function (times) {
		return res.json({
			times: times,
			more: times.filter(function (t) {
				return t.osta_rid;
			}).map(function (t) {
				return req.url + "?rid=" + t.osta_rid;
			})
		});
	}).fail(onError.bind(res));
});

// Query skate result times from SSR
app.get('/api/skaters/ssr/:sid', function (req, res) {
	var sid = parseInt(req.params.sid);
	var start = ssr.firstYear;
	var end = ssr.currentSeason();
	var fill = function fill(str) {
		return str.replace(":sid", sid).replace(":start", start).replace(":end", end).replace(":season", req.query.season);
	};

	// Parse HTML competition rankings
	if (req.query.competition) {
		var c404 = "Competition not found";
		var url = ssrCompetitonPattern.replace(":cid", req.query.competition);

		// Retrieve profile for name
		var profile = httpUtils.fetch(fill(ssrProfilePattern), { dataType: 'html', cache: { key: "ssr.profile" + sid, postfix: '.ssr.profile.html', expired: cache.maxAge(365, 'd') } }).then(ssr.parseProfile);

		// Retrieve full rankings
		var ranks = httpUtils.fetch(url, { dataType: 'html', cache: { postfix: '.ssr.comp.html', expired: cache.maxAge(365, 'd') } }).then(ssr.parseRanks);

		q.all([ranks, profile]).spread(function (ranks, profile) {
			res.json({
				times: ranks.filter(function (r) {
					return r.name == profile.name;
				}).sort(function (a, b) {
					return a.ssr_ranking - b.ssr_ranking;
				}),
				more: []
			});
		}).fail(onError.bind(res));
	}
	// Retrieve per season competition list
	else if (req.query.season) {
			var comps = httpUtils.fetch(fill(ssrCompetitonsPattern), { dataType: 'json', cache: { postfix: '.ssr.comps.json', expired: cache.maxAge(1, 'd') } });
			comps.then(function (data) {
				res.json({
					competitions: data.competitions,
					more: data.competitions.map(function (comp) {
						return req.url + "&competition=" + comp.id;
					})
				});
			}).fail(onError.bind(res));
		}
		// Retrieve all seasons the user skated after 2006, and fastest times
		else {
				var validate = function validate(data) {
					if (data instanceof Buffer) data = data.toString();
					if (typeof data == 'string') data = JSON.parse(data);
					if (data.seasons && data.seasons.length > 0) return true;
					throw new Error("404 - skater not found");
				};

				var profile = httpUtils.fetch(fill(ssrProfilePattern), { dataType: 'html', cache: { key: "ssr.profile" + sid, postfix: '.ssr.profile.html', expired: cache.maxAge(365, 'd') } }).then(ssr.parseProfile);
				var sbs = httpUtils.fetch(fill(ssrSeasonBestPattern), { validate: validate, dataType: 'json', cache: { key: "ssr.sbs:" + sid, postfix: '.ssr.sbs.json', expired: cache.maxAge(1, 'd') } });

				q.all([profile, sbs]).spread(function (profile, data) {
					return ssr.parseSeasonBests(data, profile.name);
				}).then(function (data) {
					data.more = data.seasons.map(function (season) {
						return req.url + "?season=" + season;
					});
					res.json(data);
				}).fail(onError.bind(res));
			}
});

app.use('/', express.static(__dirname + '/web'));

var server = app.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log('Converter server listening at http://%s:%s', host, port);
});

var allowed = ["discipline", "starts", "ends", "name", "id", "location", "resultsStatus", "venue"];
function simplifyCompetition(comp) {
	Object.keys(comp).filter(function (key) {
		return allowed.indexOf(key) == -1;
	}).forEach(function (key) {
		return delete comp[key];
	});
	return comp;
}