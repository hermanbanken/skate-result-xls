'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

require('newrelic');
var express = require('express');
var app = express();
var q = require('q');
var rx = require('rx'),
    Obs = rx.Observable;
var moment = require('moment');
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
var compress = require('compression');

app.use(compress());
require("./rx-server")(app);

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
var settingsPattern = base + "competitions/:id/distancecombinations";

var competitionsPromise = function competitionsPromise() {
	return fetch(base + "competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(10, 'd') } });
};
var competitionPromise = function competitionPromise(id) {
	return fetch(base + "competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:" + id, postfix: '.api.json', expired: cache.maxAge(60, 'd') } });
};
var participantsPromise = function participantsPromise(id) {
	return fetch(base + "competitions/:id/competitors".replace(":id", id), { dataType: 'json', cache: { key: "competitors:" + id, postfix: '.competitors.json', expired: cache.maxAge(60, 'd') } });
};

function mergeSettingsWithResults(excel, settings) {
	var distances = [].concat.apply([], settings.map(function (s) {
		return s.distances;
	}));
	return excel.map(function (startSerie) {
		var name = startSerie.name;
		var number = parseInt(name.split(" - ")[0]);
		var distance = distances.find(function (d) {
			return d.number == number;
		});
		distance.results = startSerie.results;
		var combination = settings.find(function (set) {
			return set.distances.find(function (d) {
				return d.id == distance.id;
			});
		});
		distance.combinationId = combination.id;
		distance.combinationName = combination.name;
		return distance;
	});
}

function onError(e) {
	var stack = e.stack && e.stack.replace(/\n/g, "\n<br>").replace(/\s/g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") || e;
	this.set('Content-Type', 'text/html');
	this.status(500).send(stack);
}

// List of competitions
// => handled by Rx-server

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

function parsedResults(id, expiry) {
	return cache("results:" + id, { postfix: '.json', expired: expiry }, function () {
		var excel = httpUtils
		// Fetch XLSX
		.fetch(excelPattern.replace(":id", id), { dataType: 'binary', cache: { encoding: 'binary', key: 'xlsx:' + id, postfix: '.xlsx' } })
		// Parse XLSX to result JSON output
		.then(function (data) {
			return q.nfcall(handle, data.toString('binary'), { base64: false, checkCRC32: true });
		});

		var settings = httpUtils
		// Fetch actual settings
		.fetch(settingsPattern.replace(":id", id)).then(function (settings) {
			return JSON.parse(settings);
		});

		return q.all([excel, settings])
		// Merge settings and settings results
		.spread(mergeSettingsWithResults)
		// Prepare for json file storage
		.then(function (data) {
			return new Buffer(JSON.stringify(data), 'utf8');
		});
	}).then(function (data) {
		return JSON.parse(data);
	});
}

// Resulting times from a competition
app.get('/api/competitions/:id/result', function (req, res) {
	var id = req.params.id;
	parsedResults(id, cache.maxAge(30, 'm')).then(function (times) {
		return res.json(times);
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

	// const p_schaatsen = Obs.startAsync(competitionsPromise)
	// 	.flatMap(l => l)
	// 	.where(comp => moment(comp.ends).isBefore())
	// 	.filter(comp => comp.discipline == "SpeedSkating.LongTrack")
	// 	.flatMap(comp => looseCompetitorsPromise(comp.id)
	// 		.filter(pt => pt.competitor.typeName == 'PersonCompetitor')
	// 		.filter(pt => pt.competitor.fullName == name)
	// 		.take(1)
	// 		.map(pt => ({
	// 			type: "schaatsen",
	// 			code: pt.competitor.licenseKey,
	// 			name: pt.competitor.fullName,
	// 			categories: [{ 
	// 				category: pt.competitor.category,
	// 				season: seasonFromCompetition(comp)
	// 			}],
	// 			club: pt.competitor.clubFullName,
	// 		}))
	// 	)
	// 	.distinct(t => t.code)
	// 	.toArray()
	// 	.toPromise();

	q.all([p_osta, p_ssr]).then(function (result) {
		return res.send(JSON.stringify([].concat.apply([], result)));
	}).fail(onError.bind(res));
});

function seasonFromCompetition(comp) {
	return moment(comp.starts).add(-6, 'month').year();
}

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

app.get('/api/skaters/schaatsen/:licenseKey', function (req, res) {
	var key = req.params.licenseKey;

	// Get times from single user from single competition, utilise XLSX cache
	if (req.query.competition && req.query.name) {
		var _ret = function () {
			var name = req.query.name;
			parsedResults(req.query.competition, cache.maxAge(300, 'd')).then(function (settings) {
				return settings
				// Verify setting data
				.filter(function (setting) {
					return setting.starts && setting.value;
				}).map(function (setting) {
					var r = setting.results.find(function (r) {
						return r.name == name;
					});
					return r && {
						date: moment(setting.starts).format('YYYY-MM-DD'),
						distance: setting.value,
						name: r.name,
						time: r.times.slice(-1)[0][1],
						laps: r.times.map(function (t, index) {
							return {
								distance: parseInt(t[0]),
								time: t[1],
								lap_time: index != 0 ? t[2] : undefined
							};
						})
					};
				}).filter(function (t) {
					return t;
				});
			}).then(function (times) {
				return res.json({
					times: times,
					more: []
				});
			}).fail(onError.bind(res));
			return {
				v: void 0
			};
		}();

		if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
	}

	// Get list of competitions
	var myCompetitions = Obs.startAsync(competitionsPromise).flatMap(function (l) {
		return l;
	}).where(function (comp) {
		return moment(comp.ends).isBefore();
	}).filter(function (comp) {
		return comp.discipline == "SpeedSkating.LongTrack";
	}).flatMap(function (comp) {
		return looseCompetitorsPromise(comp.id).filter(function (pt) {
			return pt.competitor.typeName == 'PersonCompetitor';
		}).filter(function (pt) {
			return pt.competitor.licenseKey == key;
		}).take(1).map(function (pt) {
			return req.url + "?competition=" + comp.id + "&name=" + encodeURIComponent(pt.competitor.fullName);
		});
	}).toArray().subscribe(function (list) {
		return res.json({ more: list, times: [] });
	}, onError.bind(res));
});

app.use('/', express.static(__dirname + '/../web'));

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

// in use:
var looseCompetitorsPromise = function looseCompetitorsPromise(id) {
	return Obs.just(id).flatMap(participantsPromise).flatMap(function (l) {
		return l;
	}).flatMap(function (s) {
		return s.competitors;
	});
};

var allCompetitors = Obs.startAsync(competitionsPromise).flatMap(function (l) {
	return l;
})
// delay until competition is over
.flatMap(function (comp) {
	var end = moment(comp.ends);
	return end.isBefore() ? Obs.just(comp) : Obs.empty(); //Obs.timer(moment(comp.ends).toDate()).map(_ => comp)
}).flatMap(function (comp) {
	return looseCompetitorsPromise(comp.id).map(function (pt) {
		pt.competitionId = comp.id;
		return pt;
	});
}).where(function (pt) {
	return pt.competitor.typeName == 'PersonCompetitor';
}).groupBy(function (pt) {
	return pt.competitor.fullName.toLowerCase();
}).where(function (g) {
	return g.key == "herman banken" || g.key == "erik jansen";
});

function splitPerPerson(obs) {
	return obs.distinct(function (v) {
		return v.competitor.licenseKey;
	}).scan(function (list, v) {
		return list.push(v.competitor.licenseKey + "-" + v.competitor.licenseDiscipline) && list;
	}, [obs.key]).last();
}

allCompetitors = allCompetitors.flatMap(splitPerPerson);

// module.exports = () => allCompetitors
// 	.subscribe(n => {
// 		console.log(n)
// //		n.map((v, i) => i+1).subscribe(c => console.log(n.key, c))
// 	});