'use strict';
var moment = require('moment');

function currentSeason() {
	// minus 1 for stupid JavaScript dates
	var MONTH_JUNE = 5;
	var SEASON = new Date().getFullYear() + (new Date().getMonth() <= MONTH_JUNE ? -1 : 0);
	return SEASON;
}

function convertToISODate(dateString) {
	return moment.utc(dateString).format('YYYY-MM-DD');
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

function parseSeasonBests(data) {
	let seasons = data.seasons.map(s => s.start);
	let times = data.seasons.reduce((memo, season) => {
		memo.push.apply(memo, season.records.map(record => ({
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
	rank: {
		tournament_date: /<h2>.*<span class="date">(.*)<\/span><\/h2>/gi,
		row: /<h2>.*<span class="date">(.*)<\/span><\/h2>|<tr.*?>(((.|\n)*?)class="ordinal"((.|\n)*?))<\/tr>/gi,
		cells: /<td class="ordinal">(\d+)<\/td>\s*<td class="name"><a href="index.php\?p=\d+&amp;s=(\d+)">(.*)<\/a><\/td>\s*<td class="age">(.*?)<\/td>\s*<td.*?<\/td>\s*<td class="time">(.*?)<\/td>\s*<td.*?>(.*)<\/td>/gim,
		name: /<h1 class="underline">(.*)<\/h1>/ig,
		meta: /<h2 class="compinfo">(.*)<span class="date">(.*?)<\/span>(<span class="source">Source: (.*?)<\/span>)?<\/h2>/gim
	},
	
}

function parseRanks(data){
	let name = re.rank.name.exec(data);
	let tournament = name && name[1] || undefined;
	
	let meta = re.rank.meta.exec(data);
	let date;
	var tournament_day_date = null;
	if(meta && meta[2].indexOf("-") > 0) {
		// Multi day
		date = false;
	} else if(meta) {
		// Single day
		date = convertToISODate(meta[2]);
	}
	let ssr_venue = meta ? meta[1] : undefined;
	let source = meta ? meta[3] : undefined;

	let matches = [];
	var found;
	while (found = re.rank.row.exec(data)) {
		re.rank.cells.lastIndex = 0;
		re.rank.tournament_date.lastIndex = 0;
		try {
			let cells = re.rank.cells.exec(found[0]);
			
			if(!cells && re.rank.tournament_date.test(found[0])) {
				// Row containing specific tournament date
				tournament_day_date = convertToISODate(found[1]);
			} else if(!cells) {
				// Just wrong data
				matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
				continue;
			}
			
			// Normal time row
			matches.push({
				date: date || tournament_day_date || undefined,
				ssr_venue,
				tournament,
				ssr_source: source,
				distance: undefined,
				ssr_ranking: parseInt(cells[1]),
				ssr_sid: parseInt(cells[2]),
				name: cells[3],
				ssr_age: cells[4].replace("L","D").replace("M","H"),
				time: convertToMetricTime(cells[5]),
				ssr_records: cells[6] && cells[6].split(" ") || undefined
			});
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
	parseSeasonBests: parseSeasonBests,
	parseRanks: parseRanks,
	
	convertToMetricTime: convertToMetricTime,
	convertToVenueCode: function(venue) {
		// TODO
	},
}