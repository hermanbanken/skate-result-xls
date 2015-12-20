'use strict';
var moment = require('moment');

const SSR_DATE_FORMAT = "DD MMMM YYYY";

function currentSeason() {
	// minus 1 for stupid JavaScript dates
	var MONTH_JUNE = 5;
	var SEASON = new Date().getFullYear() + (new Date().getMonth() <= MONTH_JUNE ? -1 : 0);
	return SEASON;
}

function convertToISODate(dateString, format) {
	var m = moment.utc(dateString, format);
	if(!m.isValid()) {
		console.warn(dateString, "is not a valid moment time");
	}
	return m.format('YYYY-MM-DD');
}

function parseSearch(data) {
	// HTML
	if(data.indexOf("No matches found") >= 0) {
		console.warn("No matching skaters found in SSR html.");
		return [];
	}

	// JSON
	try {
		var result = JSON.parse(data);
		return result.skaters.map(s => ({
			type: 'ssr',
			code: s.id,
			name: s.givenname + " " + s.familyname,
			categories: [{
				season: currentSeason(),
				category: (s.gender == "m" && 'H' || s.gender == "f" && 'D' || '') + s.category
			}]
		}));
	} catch(e) {
		// HTML
		var re = /<td class="name"><a href="index.php\?p=.+&amp;s=(\d+)">(.*), (.*)<\/a><\/td>\n<td class="age">(.*)<\/td>\n<td class="flag">.*<\/td>/gi;
		var matches = [], found;
		while (found = re.exec(data)) {

			matches.push({
				type: 'ssr',
				code: found[1],
				name: found[3] + " " + found[2],
				categories: [{ season: -1, category: found[4] }]
			})
		}

		return matches;
	}
}

function parseSeasonBests(data, addName) {
	let seasons = data.seasons.map(s => s.start);
	let times = data.seasons.reduce((memo, season) => {
		memo.push.apply(memo, season.records.map(record => ({
			name: addName,
			date: record.date,
			distance: record.distance,
			ssr_venue: record.location,
			time: convertToMetricTime(record.time)
		})));
		return memo;
	}, []);
	return {
		times,
		seasons
	};
}

const re = {
	profile: {
		name: /<h1 class="underline">(.*)<\/h1>/ig,
	},
	rank: {
		row: /<h2>(\d+)m (Ladies|Men|Mixed)[^<]*(<span class="date">(.*)<\/span>)?<\/h2>|<tr.*?>(((.|\n)*?)class="ordinal"((.|\n)*?))<\/tr>/gi,
		cells: /<td class="ordinal">(\d+)<\/td>\s*<td class="name"><a href="index.php\?p=\d+&amp;s=(\d+)">(.*)<\/a><\/td>\s*<td class="age">(.*?)<\/td>\s*<td.*?<\/td>\s*<td class="time">(.*?)<\/td>\s*<td.*?>(.*)<\/td>/gim,
		name: /<h1 class="underline">(.*)<\/h1>/ig,
		meta: /<h2 class="compinfo">(.*)<span class="date">(.*?)<\/span>(<span class="source">Source: (.*?)<\/span>)?<\/h2>/gim
	},
	profile: {
		birthday: /<span class="date">([^<]*) \((.{2,3})\)<\/span>/i
	}
}

function parseProfile(data) {
	re.rank.name.lastIndex = 0;
	re.profile.birthday.lastIndex = 0;
	let name = re.rank.name.exec(data);
	let birth = re.profile.birthday.exec(data);
	return {
		name: name && name[1] || undefined,
		birthdate: birth && birth[1] && convertToISODate(birth[1], SSR_DATE_FORMAT) || undefined,
		current_category: birth && birth[2] || undefined,
	};
}

function parseTextualRanks(data) {
	let text = /<pre>((.|[\r\n])*)<\/pre>/mi.exec(data);
	let lines = text[1].trim().split("\n", 4);
	let header = lines.slice(0, 3);
	let tournament = header[0], ssr_venue = header[1], date = header[2];

	if(date.indexOf("-") >= 0) {
		date = undefined;
	} else if(moment(date, SSR_DATE_FORMAT).isValid()) {
		date = convertToISODate(date, SSR_DATE_FORMAT);
	}

	let re_row = /^((\d+)m (Ladies|Men|Mixed).*? ?-? ?([^\-\n]*)|(\d+)\s+(.*)\s(L..|M..)\s+([A-Z]{3})\s+([\d.,:]*)\s+([\sA-Z]*)?)$/mg
	let matches = [];
	var found, tournament_day_date, tournament_distance;
	while (found = re_row.exec(text[1])) {
		// Header row with date
		if(found[2]) {
			tournament_distance = found[2];

			if(moment(found[4], SSR_DATE_FORMAT).isValid())
				tournament_day_date = convertToISODate(found[4], SSR_DATE_FORMAT);
		}

		if(!found[6])
			continue;

		// Race result row
		matches.push({
			date: date || tournament_day_date || undefined,
			ssr_venue,
			tournament,
			distance: tournament_distance,
			ssr_ranking: parseInt(found[5]),
			name: found[6].trim(),
			ssr_age: found[7].replace("L","D").replace("M","H"),
			time: convertToMetricTime(found[9]),
			ssr_records: found[10] && found[10].split(" ") || undefined
		})
	}

	return matches;
}

function parseRanks(data){
	re.rank.row.lastIndex = 0;
	re.rank.name.lastIndex = 0;
	re.rank.meta.lastIndex = 0;

	let name = re.rank.name.exec(data);
	let tournament = name && name[1] || undefined;

	let meta = re.rank.meta.exec(data);
	var tournament_day_date = null;
	var tournament_distance = null;
	let date;

	if(meta && meta[2].indexOf("-") > 0) {
		// Multi day
		date = false;
	} else if(meta) {
		// Single day
		date = convertToISODate(meta[2], SSR_DATE_FORMAT);
	}

	let ssr_venue = meta ? meta[1] : undefined;
	let source = meta ? meta[3] : undefined;

	let matches = [];
	var found;
	while (found = re.rank.row.exec(data)) {
		re.rank.cells.lastIndex = 0;
		try {
			// Row containing specific tournament info
			if(found[1]) {
				tournament_distance = parseInt(found[1]);
				tournament_day_date = found[4] && convertToISODate(found[4], SSR_DATE_FORMAT);
				continue;
			}
			else {
				let cells = re.rank.cells.exec(found[0]);

				// Just wrong data
				if(!cells) {
					matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
					continue;
				}

				// Normal time row
				matches.push({
					date: date || tournament_day_date || undefined,
					ssr_venue,
					tournament,
					ssr_source: source,
					distance: tournament_distance,
					ssr_ranking: parseInt(cells[1]),
					ssr_sid: parseInt(cells[2]),
					name: cells[3],
					ssr_age: cells[4].replace("L","D").replace("M","H"),
					time: convertToMetricTime(cells[5]),
					ssr_records: cells[6] && cells[6].split(" ") || undefined
				});
			}
		} catch(e) {
			matches.push([new Error(e).toString(), found[0]]);
		}
	}

	return matches;
}

function convertToMetricTime(time) {
	return time.replace(".", ":").replace(",", ".");
}

module.exports = {
	// First year of data in SSR
	firstYear: 2006,
	currentSeason: currentSeason,

	parseSearch: parseSearch,
	parseProfile: parseProfile,
	parseSeasonBests: parseSeasonBests,
	parseRanks: parseTextualRanks,

	convertToMetricTime: convertToMetricTime,
	convertToVenueCode: function(venue) {
		// TODO
	},
}