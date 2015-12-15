var regexDebug = require("./scrape-utils").regexDebug;

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

module.exports = {
	parseSearch: parseSearch,
	parsePersonTimes: parsePersonTimes
}