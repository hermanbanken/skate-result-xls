'use strict';

require('newrelic');
var express = require('express');
var app = express();
var q = require('q');
var rx = require('rx');
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

// Vars:
var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var excelPattern = vantage+"competitions/:id/reports/Results/5";
var ostaPattern = "http://www.osta.nl/?ZoekStr=:q"
var ssrPattern = "http://speedskatingresults.com/api/json/skater_lookup?familyname=:ln&givenname=:fn"
var ssrProfilePattern = "http://speedskatingresults.com/index.php?p=17&s=:sid"
var ssrSeasonBestPattern = "http://speedskatingresults.com/api/json/season_bests.php?skater=:sid&start=:start&end=:end"
var ssrCompetitonsPattern = "http://speedskatingresults.com/api/json/skater_competitions.php?skater=:sid&season=:season"
var ssrCompetitonPattern = "http://speedskatingresults.com/index.php?p=6&e=:cid"
var ostaTimesPattern = "http://www.osta.nl/?pid=:pid&Seizoen=ALL&Afstand=&perAfstand=0"
var ostaRitPattern = "http://www.osta.nl/rit.php?ID=:rid"
var settingsPattern = base+"competitions/:id/distancecombinations"

var competitionsPromise = () => fetch(base+"competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(10,'d') }});
var competitionPromise = (id) => fetch(base+"competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:"+id, postfix: '.api.json', expired: cache.maxAge(60,'d') } });
var participantsPromise = (id) => fetch(base+"competitions/:id/competitors".replace(":id", id), { dataType: 'json', cache: { key: "competitors:"+id, postfix: '.competitors.json', expired: cache.maxAge(60,'d') }});

function mergeSettingsWithResults(excel, settings) {
	let distances = [].concat.apply([], settings.map(s => s.distances))
	return excel.map(startSerie => {
		let name = startSerie.name
		let number = parseInt(name.split(" - ")[0])
		let distance = distances.find(d => d.number == number)
		distance.results = startSerie.results
		let combination = settings.find(set => set.distances.find(d => d.id == distance.id))
		distance.combinationId = combination.id
		distance.combinationName = combination.name
		return distance
	})
}

function onError(e) {
	let stack = e.stack && e.stack.replace(/\n/g, "\n<br>").replace(/\s/g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") || e;
	this.set('Content-Type', 'text/html')
	this.status(500).send(stack);
}

// List of competitions
app.get('/api/competitions', function (req, res) {
	res.type('json');
	competitionsPromise()
		.then(l => l.map(simplifyCompetition))
		.then(l => res.json(l))
		.fail(onError.bind(res));
});

// Single competition with more detail
app.get('/api/competitions/:id', function (req, res) {
	res.type('json');
	competitionPromise(req.params.id).then(obj => {
		res.json(obj);
	}).fail(onError.bind(res));
});

app.delete('/api/competitions/:id', function (req, res) {
	var id = req.params.id;
	console.log("Deleting", id);
	q
		.all([
			cache.delete("competition:"+id, { postfix: '.api.json' }),
			cache.delete("results:"+id, { postfix: '.json' }),
			cache.delete("xlsx:"+id, { postfix: '.xlsx' }),
		])
		.then(v => res.send(200))
		.fail(onError.bind(res));
});

function parsedResults(id, expiry) {
	return cache("results:"+id, { postfix: '.json', expired: expiry }, () => {
		let excel = httpUtils
			// Fetch XLSX
			.fetch(excelPattern.replace(":id", id), { dataType: 'binary', cache: { encoding: 'binary', key: 'xlsx:'+id, postfix: '.xlsx'  } })
			// Parse XLSX to result JSON output
			.then(data => q.nfcall(handle, data.toString('binary'), {base64: false, checkCRC32: true}))

		let settings = httpUtils
			// Fetch actual settings
			.fetch(settingsPattern.replace(":id", id))
			.then(settings => JSON.parse(settings))
		
		return q.all([excel, settings])
			// Merge settings and settings results
			.spread(mergeSettingsWithResults)
			// Prepare for json file storage
			.then(data => new Buffer(JSON.stringify(data), 'utf8'));
	})
	.then(data => JSON.parse(data))
}

// Resulting times from a competition
app.get('/api/competitions/:id/result', function (req, res) {
	const id = req.params.id;
	parsedResults(id, cache.maxAge(30,'m'))
	.then(times => res.json(times))
	.fail(onError.bind(res));
});

// Query linkable services to user name and birthdate
app.get('/api/skaters/find', function (req, res){
	const name = req.query.first_name + " " + req.query.last_name;
	const id = JSON.stringify([ req.query.first_name, req.query.last_name, req.query.birthdate ]);

	const osta_url = ostaPattern.replace(":q", name);
	const p_osta = httpUtils
		.fetch(osta_url, { cache: { key: "osta."+id, postfix: '.osta.html', expired: cache.maxAge(10, 'd') } })
		.then(osta.parseSearch);

	function addProfileDetails(person) {
		var url = ssrProfilePattern.replace(':sid', person.code);
		return httpUtils
			.fetch(url, { cache: { key: "ssr."+person.code, postfix: '.ssr.json', expired: cache.maxAge(10, 'd') } })
			.then(ssr.parseProfile)
			.then(profile => {
				person.birthdate = profile.birthdate;
				person.current_category = profile.current_category;
				return person;
			});
	}

	const ssr_url = ssrPattern.replace(':ln', req.query.last_name).replace(':fn', req.query.first_name);
	const p_ssr = httpUtils
		.fetch(ssr_url, { cache: { key: "ssr."+id, postfix: '.ssr.json', expired: cache.maxAge(10, 'd') } })
	 	.then(ssr.parseSearch)
		.then(list => q.all(list.map(addProfileDetails)));

	const p_schaatsen = Obs.startAsync(competitionsPromise)
		.flatMap(l => l)
		.where(comp => moment(comp.ends).isBefore())
		.filter(comp => comp.discipline == "SpeedSkating.LongTrack")
		.flatMap(comp => looseCompetitorsPromise(comp.id)
			.filter(pt => pt.competitor.typeName == 'PersonCompetitor')
			.filter(pt => pt.competitor.fullName == name)
			.take(1)
			.map(pt => ({
				type: "schaatsen",
				code: pt.competitor.licenseKey,
				name: pt.competitor.fullName,
				categories: [{ 
					category: pt.competitor.category,
					season: seasonFromCompetition(comp)
				}],
				club: pt.competitor.clubFullName,
			}))
		)
		.distinct(t => t.code)
		.toArray()
		.toPromise();

	q.all([p_osta, p_ssr, p_schaatsen])
 	  .then(result => res.json([].concat.apply([], result)))
	  .fail(onError.bind(res));
});

function seasonFromCompetition(comp) {
	return moment(comp.starts).add(-6, 'month').year()
}

// Query skate result times from Osta
app.get('/api/skaters/osta/:pid', function (req, res){
	const pid = req.params.pid;

	if(req.query.rid) {
		const rid = req.query.rid;
		var validate = (data) => {
			if(data.indexOf("Geen rit informatie opgevraagd.") < 0) return true;
			throw new Error("404 - invalid RID");
		};

		httpUtils
			.fetch(ostaRitPattern.replace(":rid", rid), { validate, cache: { key: "osta.rit:"+rid, postfix: '.osta.html', expired: cache.maxAge(365, 'd') } })
			.then(osta.parseRaceDetail)
			.then(detail => res.json({
				times: detail,
				more: []
			}))
			.fail(onError.bind(res));
			return;
	}

	var validate = (data) => {
		if(data.indexOf('class="seizoen"') >= 0)
			return true;
		throw new Error("404 - id not found");
	};

	httpUtils
		.fetch(ostaTimesPattern.replace(":pid", pid), { validate, cache: { key: "osta.times:"+pid, postfix: '.osta.html', expired: cache.maxAge(1, 'd') } })
		.then(osta.parsePersonTimes)
		.then(times => res.json({
			times: times,
			more: times.filter(t => t.osta_rid).map(t => req.url + "?rid=" + t.osta_rid)
		}))
		.fail(onError.bind(res));
});

// Query skate result times from SSR
app.get('/api/skaters/ssr/:sid', function (req, res){
	const sid = parseInt(req.params.sid);
	const start = ssr.firstYear;
	const end = ssr.currentSeason();
	var fill = (str) => str.replace(":sid", sid).replace(":start", start).replace(":end", end).replace(":season", req.query.season);

	// Parse HTML competition rankings
	if(req.query.competition) {
		const c404 = "Competition not found";
		const url = ssrCompetitonPattern.replace(":cid", req.query.competition);

		// Retrieve profile for name
		var profile = httpUtils.fetch(fill(ssrProfilePattern), { dataType: 'html', cache: { key: "ssr.profile"+sid, postfix: '.ssr.profile.html', expired: cache.maxAge(365, 'd') } })
			.then(ssr.parseProfile);

		// Retrieve full rankings
		var ranks = httpUtils
			.fetch(url, { dataType: 'html', cache: { postfix: '.ssr.comp.html', expired: cache.maxAge(365, 'd') } })
			.then(ssr.parseRanks);

		q.all([ranks, profile])
		  .spread((ranks, profile) => {
				res.json({
					times: ranks.filter(r => r.name == profile.name).sort((a,b) => a.ssr_ranking - b.ssr_ranking),
					more: []
				});
			}).fail(onError.bind(res));
	}
	// Retrieve per season competition list
	else if(req.query.season) {
		var comps = httpUtils.fetch(fill(ssrCompetitonsPattern), { dataType: 'json', cache: { postfix: '.ssr.comps.json', expired: cache.maxAge(1, 'd') } })
		comps.then(data => {
			res.json({
				competitions: data.competitions,
				more: data.competitions.map(comp => req.url + "&competition=" + comp.id)
			});
		}).fail(onError.bind(res));
	}
	// Retrieve all seasons the user skated after 2006, and fastest times
	else {
		var validate = (data) => {
			if(data instanceof Buffer) data = data.toString();
			if(typeof data == 'string') data = JSON.parse(data);
			if(data.seasons && data.seasons.length > 0) return true;
			throw new Error("404 - skater not found");
		};

		var profile = httpUtils.fetch(fill(ssrProfilePattern), { dataType: 'html', cache: { key: "ssr.profile"+sid, postfix: '.ssr.profile.html', expired: cache.maxAge(365, 'd') } })
			.then(ssr.parseProfile);
		var sbs = httpUtils.fetch(fill(ssrSeasonBestPattern), { validate, dataType: 'json', cache: { key: "ssr.sbs:"+sid, postfix: '.ssr.sbs.json', expired: cache.maxAge(1, 'd') } })

		q.all([profile, sbs])
			.spread((profile, data) => ssr.parseSeasonBests(data, profile.name))
			.then(data => {
				data.more = data.seasons.map(season => req.url + "?season=" + season);
				res.json(data);
			})
			.fail(onError.bind(res));
	}

});

app.get('/api/skaters/schaatsen/:licenseKey', function(req, res) {
	const key = req.params.licenseKey;

	// Get times from single user from single competition, utilise XLSX cache
	if(req.query.competition && req.query.name) {
		const name = req.query.name;
		parsedResults(req.query.competition, cache.maxAge(300,'d'))
			.then(settings => settings
				// Verify setting data
				.filter(setting => setting.starts && setting.value)
				.map(setting => {
					let r = setting.results.find(r => r.name == name)
					return r && {
						date: moment(setting.starts).format('YYYY-MM-DD'),
						distance: setting.value,
						name: r.name,
						time: r.times.slice(-1)[0][1],
						laps: r.times.map((t, index) => ({
							distance: parseInt(t[0]),
							time: t[1],
							lap_time: index != 0 ? t[2] : undefined
						}))
					}
				})
				.filter(t => t))
			.then(times => res.json({
				times: times,
				more: []
			}))
			.fail(onError.bind(res))
		return;
	}
	
	// Get list of competitions
	var myCompetitions = Obs.startAsync(competitionsPromise)
		.flatMap(l => l)
		.where(comp => moment(comp.ends).isBefore())
		.filter(comp => comp.discipline == "SpeedSkating.LongTrack")
		.flatMap(comp => looseCompetitorsPromise(comp.id)
			.filter(pt => pt.competitor.typeName == 'PersonCompetitor')
			.filter(pt => pt.competitor.licenseKey == key)
			.take(1)
			.map(pt => req.url + "?competition=" + comp.id + "&name=" + encodeURIComponent(pt.competitor.fullName))
		)
		.toArray()
		.subscribe(
			list => res.json({ more: list, times: [] }), 
			onError.bind(res)
		);
	
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

const Obs = rx.Observable;

var looseCompetitorsPromise = (id) => Obs.just(id)
  .flatMap(participantsPromise)
  .flatMap(l => l)
  .flatMap(s => s.competitors)