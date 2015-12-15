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

function parseSearch(data) {
	var re = /<tr>\n<td><a href="\?pid=(.*)">(.*)<\/a><\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<td>(.*)<\/td>\n<\/tr>/gi; 
	var matches = [], found;
	while (found = re.exec(data)) {
		
		// Retrieve categories
		var cats = found[3].split("-");
		var seasons = found[4].split("-").map(s => parseInt(s));
		var categories = [{
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
	const re_row = /<tr class="tijd">(.*?)<\/tr>/gi;
	const re_cells = /<td>(.*?)<\/td><td>(.{2})<\/td><td>(\d+)<\/td><td>(.*?)<\/td><td>.*<\/td><td class="l">(.*?)<\/td>/gim
	const re_race = /<a href="rit\.php\?pid=.*?&amp;ID=(.*)">(.+)<\/a>|(.+)/gim;
	const re_tournament = /<a href="OSTAT\/index\.php\?ID=(.*)">(.*)<\/a>|(.+)/gim;
	
	const matches = [];
	var found;
	while (found = re_row.exec(data)) {
		re_cells.lastIndex = 0;
		re_race.lastIndex = 0;
		re_tournament.lastIndex = 0;
		try {
			var cells = re_cells.exec(found[1]);
			if(!cells)
				matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
			else {
				let race = {
					date: convertToISODate(cells[1], "DD-MM-YYYY"),
					venue: cells[2],
					distance: parseInt(cells[3])
				};
				
				var time = re_race.exec(cells[4]) || cells[4];
				race.time = Array.isArray(time) ? time[2] : time;
				race.osta_rid = Array.isArray(time) ? time[1] : undefined;
				
				var tournament = re_tournament.exec(cells[5]) || cells[6];
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
	const re_row = /<tr>\s+<td align=right>(\d+)<\/td>\s+<td align=right>([,:.\d]+)<\/td>\s+<td align=right>([,:.\d]*)<\/td>/gim;
	const re_meta = /<h1>(.*)<\/h1>\s+<p class="wedinfo">(.*?)\s+.*?<\/p>/gi;
	
	const meta = re_meta.exec(data);
	const name = meta && meta[1];
	const date = meta && meta[2];
	
	const matches = [];
	var found;
	while (found = re_row.exec(data)) {
		try {
			matches.push({
				distance: found[1], 
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
		time: matches[matches.length-1].time
	}]
}

module.exports = {
	parseSearch: parseSearch,
	parsePersonTimes: parsePersonTimes,
	parseRaceDetail: parseRaceDetail
}