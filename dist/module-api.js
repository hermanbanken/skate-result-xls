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
	return fetch(base + "competitions", { dataType: 'json', cache: { key: "competitions", postfix: '.json', expired: cache.maxAge(5, 'm') } });
};
var competitionPromise = function competitionPromise(id) {
	return fetch(base + "competitions/:id".replace(":id", id), { dataType: 'json', cache: { key: "competition:" + id, postfix: '.api.json', expired: cache.maxAge(5, 'm') } });
};

function toIdList(service, id) {
	var obj = {};
	obj[typeof service == 'string' ? service : service.name] = id;
	return [obj];
}

function SSR() {}
function OSTA() {}
function INSCHRIJVEN() {}

SSR.features = ["competitions.list", "competitions.times", "persons.competitions.list", "persons.records.list", "persons.search", "persons.search.birthdate", "persons.search.category"];

OSTA.features = ["competitions.list", "competitions.times", "persons.search", "persons.search.category"];

INSCHRIJVEN.features = ["competitions.list", "competitions.times"];

INSCHRIJVEN.generaliseCompetitor = function (input) {
	return {
		category: input.competitor.category,
		fullName: input.competitor.fullName,
		gender: ['m', 'f', 'o'][input.competitor.gender],
		ids: toIdList(INSCHRIJVEN.name, input.competitor.id),
		licenseKey: input.competitor.licenseKey,
		start: {
			number: input.competitor.startNumber,
			status: input.status,
			reserve: input.reserve,
			listId: input.competitor.listId
		}
	};
};

function API() {}

API.prototype.listServices = function () {
	return [SSR, OSTA, INSCHRIJVEN];
};

function Competition(data, optionalService) {
	for (var n in data) {
		if (!data.hasOwnProperty(n)) continue;
		this[n] = data[n];
	}
	this.service = optionalService;
}

Competition.prototype.participants = function () {
	var result = q.reject();

	if (this.service === INSCHRIJVEN.name) {
		var url = "https://inschrijven.schaatsen.nl/api/competitions/:id/competitors";
		result = httpUtils.fetch(url.replace(":id", this.id)).then(function (d) {
			return JSON.parse(d);
		}).then(function (settings) {
			return _.chain(settings).pluck("competitors").flatten().value();
		}).then(function (ps) {
			return ps.map(INSCHRIJVEN.generaliseCompetitor);
		});
	}

	return result;
};

/**
 * List all competitions
 *
 * @param service to retrieve from
 * @param cursor where to start retrieval
 * @return { results: [], next: Cursor }
 */
Competition.list = function (service, optionalCursor) {
	if (typeof service === 'string') {
		service = new API().listServices().find(function (s) {
			return s.name === service;
		});
	}

	var data = q.reject();
	switch (service.name) {
		case INSCHRIJVEN.name:
			var url = "https://inschrijven.schaatsen.nl/api/competitions";
			data = httpUtils.fetch(url).then(function (d) {
				return JSON.parse(d);
			}).then(function (list) {
				return {
					count: list.length,
					results: list.map(function (c) {
						return new Competition(c, service.name);
					}),
					next: false
				};
			});
			break;
	}

	return data;
};

API.Competition = Competition;
module.exports = API;