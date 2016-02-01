'use strict';

var regexDebug = require("./scrape-utils").regexDebug;
var moment = require('moment');

function nlToInternationDate(dateStr) {
	return dateStr.split("-").reverse().join("-");
}

function convertToISODate(dateString, inputFormat) {
	var m = moment.utc(dateString, inputFormat);
	if (!m.isValid()) console.warn("Invalid date", dateString, inputFormat);
	return m.format('YYYY-MM-DD');
}

var re = {
	search: {
		row: /<tr>\n<td><a href="\?pid=(.*)">(.*)<\/a><\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<\/tr>/gi
	},
	times: {
		name: /<h1>(.*)<\/h1>/gi,
		row: /<tr class="tijd">(.*?)<\/tr>/gi,
		cells: /<td>(.*?)<\/td><td>(.{2})<\/td><td>(\d+)<\/td><td>(.*?)<\/td><td>.*<\/td><td class="l">(.*?)<\/td>/gim,
		race: /<a href="rit\.php\?pid=.*?&amp;ID=(.*)">(.+)<\/a>|(.+)/gim,
		tournament: /<a href="OSTAT\/index\.php\?ID=(.*)">(.*)<\/a>|(.+)/gim
	},
	detail: {
		row: /<tr>\s+<td align=right>(\d+)<\/td>\s+<td align=right>([,:.\d]+)<\/td>\s+<td align=right>([,:.\d]*)<\/td>/gim,
		meta: /<h1>(.*)<\/h1>\s+<p class="wedinfo">(\d{4}-\d{2}-\d{2})\s+([^<]*)/gi
	}
};

function parseSearch(data) {
	re.search.row.lastIndex = 0;

	var matches = [];
	var found;
	while (found = re.search.row.exec(data)) {

		// Retrieve categories
		var cats = found[3].split("-");
		var seasons = found[4].split("-").map(function (s) {
			return parseInt(s);
		});
		var categories = [{
			season: seasons[0], category: cats[0]
		}];
		if (seasons[0] != seasons[1] - 1) {
			categories.push({
				season: seasons[1] - 1,
				category: cats[1] || cats[0]
			});
		}

		matches.push({
			type: 'osta',
			code: found[1],
			categories: categories,
			name: found[2],
			club: found[5]
		});
	}
	return matches;
}

function parsePersonTimes(data) {
	re.times.row.lastIndex = 0;
	re.times.name.lastIndex = 0;

	var nameMatch = re.times.name.exec(data);
	var name = nameMatch && nameMatch[1] || undefined;

	var matches = [];
	var found;
	while (found = re.times.row.exec(data)) {
		re.times.cells.lastIndex = 0;
		re.times.race.lastIndex = 0;
		re.times.tournament.lastIndex = 0;
		try {
			var cells = re.times.cells.exec(found[1]);
			if (!cells) matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);else {
				var race = {
					name: name,
					date: convertToISODate(cells[1], "DD-MM-YYYY"),
					venue: cells[2],
					distance: parseInt(cells[3])
				};

				var time = re.times.race.exec(cells[4]);
				race.time = time[2] || time[3] || undefined;
				race.osta_rid = time[1] || undefined;

				var tournament = re.times.tournament.exec(cells[5]) || cells[6];
				race.tournament = Array.isArray(tournament) ? tournament[2] : tournament;
				race.osta_cid = Array.isArray(tournament) ? tournament[1] : undefined;

				matches.push(race);
			}
		} catch (e) {
			matches.push([new Error(e).toString(), found[1]]);
		}
	}

	return matches;
}

function parseRaceDetail(data) {
	re.detail.row.lastIndex = 0;
	re.detail.meta.lastIndex = 0;

	var meta = re.detail.meta.exec(data);
	var name = meta && meta[1];
	var date = meta && meta[2];

	var laps = [];
	var found;
	while (found = re.detail.row.exec(data)) {
		try {
			laps.push({
				distance: parseInt(found[1]),
				time: found[2],
				lap_time: found[3] || undefined
			});
		} catch (e) {
			laps.push([new Error(e).toString(), found[1]]);
		}
	}

	var match = {
		name: name,
		date: date,
		laps: laps,
		distance: laps[laps.length - 1].distance,
		time: laps[laps.length - 1].time
	};

	if (!validateLaps(match)) {
		console.warn(new Error("Invalid laps!"), JSON.stringify(match));
		return [];
	}

	return [match];
}

function validateLaps(match) {
	var lapLength = match.venue != "NY" ? 400 : 333;

	var run = match.laps.reduceRight(function (memo, lap) {
		if (memo[0] && lap.distance === memo[1]) return [true, memo[1] - lapLength];
		return [false, 0];
	}, [true, match.distance]);

	var shouldHave = Math.floor(match.distance / lapLength);
	if (match.distance % lapLength != 0) shouldHave++;

	return run[0] && match.laps.length == shouldHave;
}

module.exports = {
	parseSearch: parseSearch,
	parsePersonTimes: parsePersonTimes,
	parseRaceDetail: parseRaceDetail,
	validateLaps: validateLaps
};