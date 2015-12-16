'use strict';

var regexDebug = require("./scrape-utils").regexDebug;
var moment = require('moment');

function nlToInternationDate(dateStr) {
	return dateStr.split("-").reverse().join("-");
}

function convertToISODate(dateString, inputFormat) {
	var m = moment.utc(dateString, inputFormat);
	if(!m.isValid())
		console.warn("Invalid date", dateString, inputFormat);
	return m.format('YYYY-MM-DD');
}

const re = {
	search: {
		row: /<tr>\n<td><a href="\?pid=(.*)">(.*)<\/a><\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<\/tr>/gi
	},
	times: {
		row: /<tr class="tijd">(.*?)<\/tr>/gi,
		cells: /<td>(.*?)<\/td><td>(.{2})<\/td><td>(\d+)<\/td><td>(.*?)<\/td><td>.*<\/td><td class="l">(.*?)<\/td>/gim,
		race: /<a href="rit\.php\?pid=.*?&amp;ID=(.*)">(.+)<\/a>|(.+)/gim,
		tournament: /<a href="OSTAT\/index\.php\?ID=(.*)">(.*)<\/a>|(.+)/gim,
	},
	detail: {
		row: /<tr>\s+<td align=right>(\d+)<\/td>\s+<td align=right>([,:.\d]+)<\/td>\s+<td align=right>([,:.\d]*)<\/td>/gim,
		meta: /<h1>(.*)<\/h1>\s+<p class="wedinfo">(\d{4}-\d{2}-\d{2})\s+([^<]*)/gi,
	}
}

function parseSearch(data) {
	re.search.row.lastIndex = 0;

	let matches = [];
	var found;
	while (found = re.search.row.exec(data)) {

		// Retrieve categories
		let cats = found[3].split("-");
		let seasons = found[4].split("-").map(s => parseInt(s));
		let categories = [{
			season: seasons[0], category: cats[0]
		}];
		if(seasons[0] != seasons[1]-1) {
			categories.push({
				season: seasons[1] - 1,
				category: cats[1] || cats[0]
			});
		}

		matches.push({
			type: 'osta',
			code: found[1],
			categories,
			name: found[2],
			club: found[5]
		})
	}
	return matches;
}

function parsePersonTimes(data) {
	re.times.row.lastIndex = 0;

	let matches = [];
	var found;
	while (found = re.times.row.exec(data)) {
		re.times.cells.lastIndex = 0;
		re.times.race.lastIndex = 0;
		re.times.tournament.lastIndex = 0;
		try {
			let cells = re.times.cells.exec(found[1]);
			if(!cells)
				matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
			else {
				let race = {
					date: convertToISODate(cells[1], "DD-MM-YYYY"),
					venue: cells[2],
					distance: parseInt(cells[3])
				};

				let time = re.times.race.exec(cells[4]) || cells[4];
				race.time = Array.isArray(time) ? time[2] : time;
				race.osta_rid = Array.isArray(time) ? time[1] : undefined;

				let tournament = re.times.tournament.exec(cells[5]) || cells[6];
				race.tournament = Array.isArray(tournament) ? tournament[2] : tournament;
				race.osta_cid = Array.isArray(tournament) ? tournament[1] : undefined;

				matches.push(race);
			}
		} catch(e) {
			matches.push([new Error(e).toString(), found[1]]);
		}
	}

	return matches;
}

function parseRaceDetail(data) {
	re.detail.row.lastIndex = 0;
	re.detail.meta.lastIndex = 0;

	let meta = re.detail.meta.exec(data);
	let name = meta && meta[1];
	let date = meta && meta[2];

	let matches = [];
	var found;
	while (found = re.detail.row.exec(data)) {
		try {
			matches.push({
				distance: parseInt(found[1]),
				time: found[2],
				lap_time: found[3] || undefined
			})
		} catch(e) {
			matches.push([new Error(e).toString(), found[1]]);
		}
	}

	if(matches.length == 0)
		throw new Error("No times found");
	if(matches[0].lap_time != undefined)
		throw new Error("Invalid recording!");
	
	return [{
		name,
		date,
		laps: matches,
		distance: matches[matches.length-1].distance,
		time: matches[matches.length-1].time
	}]
}

module.exports = {
	parseSearch: parseSearch,
	parsePersonTimes: parsePersonTimes,
	parseRaceDetail: parseRaceDetail
}