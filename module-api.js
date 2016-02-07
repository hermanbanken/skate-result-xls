'use strict';

var q = require('q');
var rx = require('rx');
var _ = require('underscore');
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

var competitionsPromise = () => fetch(base+"competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(5,'m') }});
var competitionPromise = (id) => fetch(base+"competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:"+id, postfix: '.api.json', expired: cache.maxAge(5,'m') } });





function toIdList(service, id) {
	return [{
		service: typeof service == 'string' ? service : service.name,
		id: id
	}];
}

function SSR() {}
function OSTA() {}
function INSCHRIJVEN() {}

SSR.features = [
	"competitions.list",
	"competitions.times",
	"persons.competitions.list",
	"persons.records.list",
	"persons.search",
	"persons.search.birthdate",
	"persons.search.category",
];

OSTA.features = [
	"competitions.list",
	"competitions.times",
	"persons.search",
	"persons.search.category",
];

INSCHRIJVEN.features = [
	"competitions.list",
	"competitions.times",
];

INSCHRIJVEN.generaliseCompetitor = function(input){
	return {
		category: input.competitor.category,
		fullName: input.competitor.fullName,
		gender: ['m','f','o'][input.competitor.gender],
		ids: toIdList(INSCHRIJVEN.name, input.competitor.id),
		licenseKey: input.competitor.licenseKey,
		licenseDiscipline: input.competitor.licenseDiscipline,
		start: {
			number: input.competitor.startNumber,
			status: input.status,
			reserve: input.reserve,
			listId: input.competitor.listId
		},
	};
}

function API(options) {
	var fetch = this.fetch = options && options.fetch || httpUtils.fetch;
	
	function Competitor(data, optionalService) {
		for(var n in data) {
			if(n === 'id') continue;
			if(!data.hasOwnProperty(n)) continue;
			this[n] = data[n];
		}

		if(this.licenseDiscipline && this.licenseKey) {
			this.licenses = [{
				licenseDiscipline: this.licenseDiscipline,
				licenseKey: this.licenseKey,
				validFrom: this.validFrom,
				validTo: this.validTo,
				flags: this.flags,

				season: this.season,
				category: this.category,
				sponsor: this.sponsor,
				club: this.sponsor,
				venueCode: this.venueCode,
				transponder1: this.transponder1,
				transponder2: this.transponder2,
				number: this.number,
				numberPrefix: this.numberPrefix,
			}];
			delete this.licenseDiscipline;
			delete this.licenseKey;
			delete this.validFrom;
			delete this.validTo;
			delete this.key;
			delete this.flags;

			delete this.season;
			delete this.category;
			delete this.sponsor;
			delete this.club;
			delete this.venueCode;
			delete this.transponder1;
			delete this.transponder2;
			delete this.number;
			delete this.numberPrefix;
		}

		this.service = optionalService || this.service;
	}

	Competitor.lookup = function (service, data){
		var result = q.reject();

		if(service === INSCHRIJVEN.name) {
			const url = "https://inschrijven.schaatsen.nl/api/licenses/KNSB/:discipline/:key";
			if(data.licenseKey && data.licenseDiscipline) {
				let _url = url.replace(":key", data.licenseKey).replace(":discipline", data.licenseDiscipline);
				result = fetch(_url)
					.then(d => JSON.parse(d))
					.then(d => new Competitor(_.extend({}, data, d), INSCHRIJVEN.name));
			}
		}

		return result;
	}

	function Competition(data, optionalService){
		for(var n in data) {
			if(n === 'id') continue;
			if(!data.hasOwnProperty(n)) continue;
			this[n] = data[n];
		}

		if(data.id) {
			this.ids = optionalService ? toIdList(optionalService, data.id) : [data.id];
		}

		this.service = optionalService;
	}

	Competition.prototype.participants = function() {
		var result = q.reject();

		if(this.service === INSCHRIJVEN.name) {
			const url = "https://inschrijven.schaatsen.nl/api/competitions/:id/competitors";
			result = fetch(url.replace(":id", this.serviceId(INSCHRIJVEN.name)))
				.then(d => JSON.parse(d))
				.then(settings => _.chain(settings).pluck("competitors").flatten(true).value())
				.then(ps => ps.map(INSCHRIJVEN.generaliseCompetitor))
		}

		return result;
	}

	Competition.prototype.serviceId = function(service) {
		var item = this.ids.find(id => id.service === service)
		return item && item.id || item;
	}

	/**
	 * List all competitions
	 *
	 * @param service to retrieve from
	 * @param cursor where to start retrieval
	 * @return { results: [], next: Cursor }
	 */
	Competition.list = function(service, optionalCursor) {
		if(typeof service === 'string') {
			service = new API().listServices().find(s => s.name === service);
		}

		var data = q.reject();
		switch(service.name) {
			case INSCHRIJVEN.name:
				const url = "https://inschrijven.schaatsen.nl/api/competitions";
				data = fetch(url)
					.then(d => JSON.parse(d))
					.then(list => ({
						count: list.length,
						results: list.map(c => new Competition(c, service.name)),
						next: false
					}));
				break;
		}

		return data;
	}

	this.Competitor = Competitor;
	this.Competition = Competition;
}

API.prototype.listServices = function(){
	return [
		SSR,
		OSTA,
		INSCHRIJVEN,
	];
}

module.exports = API;