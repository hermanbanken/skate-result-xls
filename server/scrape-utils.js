// Try until where the regex succeeds
function regexDebug(re, str) {
	var flags = re.toString().substring(re.toString().lastIndexOf("/")+1);
	var i = 1, lastMatch;
	while(i < str.length){
		try {
			var result = new RegExp(re.source.substring(0, i), flags).exec(str);
			if(!result) break;
			else lastMatch = result;
		} catch(e) {
			if(e.message.indexOf("Invalid regular expression") == -1)
				console.log(e);
		} finally {
			i++;
		}
	}
	return [new RegExp(re.source).toString(), i, re.source.substring(0, i), lastMatch];
}

module.exports = {
	regexDebug: regexDebug
}