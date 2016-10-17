'use strict';

require('newrelic');

var rx = require('rx');
var moment = require('moment');
// Our utils:
var osta = require('./server/osta');
var ssr = require('./server/ssr');
var Vantage = require('./server/vantage');
var compress = require('compression');
var oboe = require('oboe');
var https = require('https');

const Obs = rx.Observable;

// Vars:
var ostaPattern = "http://www.osta.nl/?ZoekStr=:q"
var ssrPattern = "http://speedskatingresults.com/api/json/skater_lookup?familyname=:ln&givenname=:fn"
var ssrProfilePattern = "http://speedskatingresults.com/index.php?p=17&s=:sid"
var ssrSeasonBestPattern = "http://speedskatingresults.com/api/json/season_bests.php?skater=:sid&start=:start&end=:end"
var ssrCompetitonsPattern = "http://speedskatingresults.com/api/json/skater_competitions.php?skater=:sid&season=:season"
var ssrCompetitonPattern = "http://speedskatingresults.com/index.php?p=6&e=:cid"
var ostaTimesPattern = "http://www.osta.nl/?pid=:pid&Seizoen=ALL&Afstand=&perAfstand=0"
var ostaRitPattern = "http://www.osta.nl/rit.php?ID=:rid"

function maxAge(count, type) {
	var delta = 0;
	switch(type) {
		case 'w': delta = count * 1000 * 3600 * 24 * 7; break;
		case 'd': delta = count * 1000 * 3600 * 24; break;
		case 'h': delta = count * 1000 * 3600; break;
		case 'm': delta = count * 1000 * 60; break;
		case 's': delta = count * 1000; break;
	}
	return (date) => (new Date()).getTime() - date.getTime() > delta;
}

Array.prototype.distinct = function (key) {
	if(typeof key == 'undefined') key = (id) => id;
	var unique = {};
	var distinct = [];
	this.forEach(function (x) {
		if (!unique[key(x)]) {
			distinct.push(x);
			unique[key(x)] = true;
		}
	});
	return distinct;
}

function onError(e) {
	if(!this.headerSent) {
		this.status(500).type("text/html");
	}
	this.write(
		e.stack && e.stack.replace(/\n/g, "\n<br>").replace(/\s/g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") ||
		JSON.stringify(e)
	);
	this.end();
}

const AllCompetitions = rx.Observable
	.interval(1000 * 3600).startWith(0)
	.flatMap(_ => Vantage.competitions().toArray())
	.shareReplay(1);

const Meta = AllCompetitions.take(1).map(
	list => ({
		venues: list.map(c => c.venue).filter(id => id).distinct(v => v.code),
		disciplines: list.map(c => c.discipline).distinct(),
	})
).shareReplay(1);

module.exports = function(app) {

// Meta
app.get('/api/meta', function (req, res) {
	res.type('json');
	Meta.subscribe(meta => res.send(JSON.stringify(meta, undefined, "  ")));
});

// List of competitions
app.get('/api/competitions', function (req, res) {
	res.type('json');

	var check = maxAge(27, 'w');
	function filter(comp) {
		if(req.query.venue && (!comp.venue || comp.venue.code != req.query.venue)) { return false; }
		if(req.query.discipline && comp.discipline != req.query.discipline) { return false; }
		if(check(new Date(comp.starts))) { return false; }
		return true;
	}

	AllCompetitions.take(1).subscribe(
		list => {
			var r = list.filter(filter).map(simplifyCompetition);
			res.send(JSON.stringify(r, undefined, "  "))
		},
		onError.bind(res)
	);
});

// Single competition with more detail
app.get('/api/v2/competitions/:id', function (req, res) {
	Vantage.competition(req.params.id).subscribe(
		c => { res.type('json').send(JSON.stringify(c, undefined, "  ")) }, 
		onError.bind(res)
	);
});

app.del('/api/v2/competitions/:id', function (req, res) {
	var id = req.params.id;
	console.log("Deleting", id);
});

// Resulting times from a competition
app.get('/api/v2/competitions/:id/result', function (req, res) {
	var id = req.params.id;
});

// Query linkable services to user name and birthdate
app.get('/api/v2/skaters/find', function (req, res) {
});

// Query skate result times from Osta
app.get('/api/v2/skaters/osta/:pid', function (req, res) {
});

// Query skate result times from SSR
app.get('/api/v2/skaters/ssr/:sid', function (req, res) {
});

}

var allowed = ["discipline", "starts", "ends", "name", "id", "location", "resultsStatus", "venue"];
function simplifyCompetition(comp) {
	let ret = {};
	Object.keys(comp).forEach(function (key) {
		if(allowed.indexOf(key) >= 0) {
			ret[key] = comp[key];
		}
	});
	ret.venue = comp.venue && comp.venue.code || comp.venue;
	return ret;
}


/*
// in use:
var looseCompetitorsPromise = (id) => Obs.just(id)
  .flatMap(participantsPromise)
  .flatMap(l => l)
  .flatMap(s => s.competitors)
	
var allCompetitors = Obs.startAsync(competitionsPromise)
	.flatMap(l => l)
	// delay until competition is over
	.flatMap(comp => {
		let end = moment(comp.ends)
		return end.isBefore() ? Obs.just(comp) : Obs.empty();//Obs.timer(moment(comp.ends).toDate()).map(_ => comp)
	})
	.flatMap(comp => looseCompetitorsPromise(comp.id).map(pt => {
		pt.competitionId = comp.id;
		return pt;
	}))
	.where(pt => pt.competitor.typeName == 'PersonCompetitor')
	.groupBy(pt => pt.competitor.fullName.toLowerCase())
	.where(g => g.key == "herman banken" || g.key == "erik jansen");
	
function splitPerPerson(obs){
	return obs
		.distinct(v => v.competitor.licenseKey)
		.scan((list, v) => list.push(v.competitor.licenseKey+"-"+v.competitor.licenseDiscipline) && list, [obs.key])
		.last()
}
	
allCompetitors = allCompetitors.flatMap(splitPerPerson)

// module.exports = () => allCompetitors
// 	.subscribe(n => {
// 		console.log(n)
// //		n.map((v, i) => i+1).subscribe(c => console.log(n.key, c))
// 	});
*/
