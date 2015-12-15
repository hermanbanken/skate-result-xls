function currentSeason() {
	// minus 1 for stupid JavaScript dates
	var MONTH_JUNE = 5;
	var SEASON = new Date().getFullYear() + (new Date().getMonth() <= MONTH_JUNE ? -1 : 0);
	return SEASON;
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
	const seasons = data.seasons.map(s => s.start);
	const times = data.seasons.reduce((memo, season) => {
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

function parseRanks(data){
	const re_row = /<tr.*?>(((.|\n)*?)class="ordinal"((.|\n)*?))<\/tr>/gi;
	const re_cells = /<td class="ordinal">(\d+)<\/td>\s*<td class="name"><a href="index.php\?p=\d+&amp;s=(\d+)">(.*)<\/a><\/td>\s*<td class="age">(.*?)<\/td>\s*<td.*?<\/td>\s*<td class="time">(.*?)<\/td>\s*<td.*?>(.*)<\/td>/gim
	const re_name = /<h1 class="underline">(.*)<\/h1>/ig;
	const re_meta = /<h2 class="compinfo">(.*)<span class="date">(.*?)<\/span>(<span class="source">Source: (.*?)<\/span>)<\/h2>/gim;

	const name = re_name.exec(data);
	const tournament = name && name[1] || undefined; 

	const meta = re_meta.exec(data);
	const date = meta ? new Date(meta[2]).toISOString().split("T")[0] : undefined;
	const ssr_venue = meta ? meta[1] : undefined;

	const matches = [];
	var found;
	while (found = re_row.exec(data)) {
		re_cells.lastIndex = 0;
		try {
			var cells = re_cells.exec(found[0]);
			if(!cells) {
				matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
				continue;
			}
			
			matches.push({
				date,
				ssr_venue,
				tournament,
				distance: undefined,
				ssr_ranking: parseInt(cells[1]),
				ssr_sid: parseInt(cells[2]),
				name: cells[3],
				ssr_age: cells[4].replace("L","D").replace("M","H"),
				time: convertToMetricTime(cells[5]),
				ssr_records: cells[6] && cells[6].split(" ") || undefined
			});
		} catch(e) {
			matches.push([new Error(e).toString(), found[1]]);
		}
	}
	return matches;
}

function parsePersonTimes(data) {
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
			const cells = re_cells.exec(found[1]);
			if(!cells)
				matches.push([new Error("Row did not conform to OSTA scrape format.").toString(), found[1], regexDebug(re_cells, found[1])]);
			else {
				var race = {
					date: cells[1],
					venue: cells[2],
					distance: parseInt(cells[3])
				};
				
				const time = re_race.exec(cells[4]) || cells[4];
				race.time = Array.isArray(time) ? time[2] : time;
				race.osta_rid = Array.isArray(time) ? time[1] : undefined;
				
				const tournament = re_tournament.exec(cells[5]) || cells[6];
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