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

module.exports = {
	parseSearch: parseSearch
}