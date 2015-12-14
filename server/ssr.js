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

module.exports = {
	parseSearch: parseSearch
}