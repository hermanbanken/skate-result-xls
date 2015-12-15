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
var diff = require('diff').diffJson;

// Vars:
var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var excelPattern = vantage+"competitions/:id/reports/Results/5";
var ostaPattern = "http://www.osta.nl/?ZoekStr=:q"
var ssrPattern = "http://speedskatingresults.com/api/json/skater_lookup?familyname=:ln&givenname=:fn"
var ssrSeasonBestPattern = "http://speedskatingresults.com/api/json/season_bests.php?skater=:sid&start=:start&end=:end"
var ssrCompetitonsPattern = "http://speedskatingresults.com/api/json/skater_competitions.php?skater=:sid&season=:season"
var ssrCompetitonPattern = "http://speedskatingresults.com/index.php?p=4&e=:cid&g=:gender"
var ostaTimesPattern = "http://www.osta.nl/?pid=:pid&Seizoen=ALL&Afstand=&perAfstand=0"
var ostaRitPattern = "http://www.osta.nl/rit.php?ID=:rid"

var competitionsPromise = () => fetch(base+"competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(5,'m') }});
var competitionPromise = (id) => fetch(base+"competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:"+id, postfix: '.api.json', expired: cache.maxAge(5,'m') } });

function onError(e) {
	this.send(500, e.stack.replace(/\n/g, "\n<br>").replace(/\s/g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"));
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

// Resulting times from a competition
app.get('/api/competitions/:id/result', function (req, res) {
	const id = req.params.id;
	cache("results:"+id, { postfix: '.json', expired: cache.maxAge(5,'m') }, () => {
		return httpUtils
			// Fetch XLSX
			.fetch(excelPattern.replace(":id", id), { dataType: 'binary', cache: { key: 'xlsx:'+id, postfix: '.xlsx'  } })
			// Parse XLSX to result JSON output
			.then(data => q.nfcall(handle, data.toString('binary'), {base64: false, checkCRC32: true}))
			// Prepare for json file storage
			.then(data => new Buffer(JSON.stringify(data), 'binary'));
	})
	.then(times => res.json(JSON.parse(times)))
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
	
	const ssr_url = ssrPattern.replace(':ln', req.query.last_name).replace(':fn', req.query.first_name);
	const p_ssr = httpUtils
		.fetch(ssr_url, { cache: { key: "ssr."+id, postfix: '.ssr.json', expired: cache.maxAge(10, 'd') } })
	 	.then(ssr.parseSearch);
		
	q.all([p_osta, p_ssr])
 	  .then(result => res.json([].concat.apply([], result)))
	  .fail(onError.bind(res));
});

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
		const isThisSkater = (rank) => rank.ssr_sid == sid;
		
		// For each gender, retrieve full rankings
		var ranks = [0, 1].map(g => httpUtils
			.fetch(url.replace(":gender", g), { dataType: 'html', cache: { postfix: '.ssr.comp.html', expired: cache.maxAge(365, 'd') } })
			.then(ssr.parseRanks)
		);
		q.all(ranks).then(ranks => {
			res.json({
				times: [].concat.apply([], ranks).filter(isThisSkater).sort((a,b) => a.ssr_ranking - b.ssr_ranking),
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
	// Retrieve all seasons the user skated after 2006, and fasted times
	else {
		var validate = (data) => {
			if(data instanceof Buffer) data = data.toString();
			if(typeof data == 'string') data = JSON.parse(data);
			if(data.seasons && data.seasons.length > 0) return true;
			throw new Error("404 - skater not found");
		};
		httpUtils.fetch(fill(ssrSeasonBestPattern), { validate, dataType: 'json', cache: { key: "ssr.sbs:"+sid, postfix: '.ssr.sbs.json', expired: cache.maxAge(1, 'd') } })
			.then(ssr.parseSeasonBests)
			.then(data => {
				data.more = data.seasons.map(season => req.url + "?season=" + season);
				res.json(data);
			})
			.fail(onError.bind(res));	
	}
	
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