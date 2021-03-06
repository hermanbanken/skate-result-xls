// minus 1 for stupid JavaScript dates
var MONTH_JUNE = 5;
var SEASON = new Date().getFullYear() + (new Date().getMonth() <= MONTH_JUNE ? -1 : 0);

if(!Function.identity) {
	Function.identity = function(id) { return id; };
}

function ageToCategory(age) {
	if(age < 7)
		return "PF";
	if(age < 13)
		return "P" + ("FEDCBA"[age - 7]);
	if(age < 19)
		return ("CBA"[(age - 13) / 2]) + ((age - 13) % 2 + 1);
	if(age < 23)
		return "N" + (age - 19 + 1);
	if(age < 30)
		return "SA";
	if(age < 39)
		return "SB";
	if(age < 69)
		return "" + (40 + Math.floor((age - 39) / 5) * 5);

	return "70";
}

function parseCategory(date, inSeason) {
	if(!date)	return;
	if(!inSeason) inSeason = SEASON;
	
	var age = inSeason - date.getFullYear() - (date.getMonth() <= MONTH_JUNE ? 0 : 1);
	return ageToCategory(age);
}

/**
 * Parse date format to millis
 */
function parseTime(time, isEnglish) {
	var output = 0;
	var multipliers = [1, 1000, 1000 * 60, 1000 * 3600];
	var multi, part, parts = time.split(/[:,\.]/g);
	if(parts[parts.length-1].length == 2) 
		multipliers[0] = 10;
	do {
		part = parts.pop();
		multi = multipliers.shift();
		output += multi * parseInt(part);
	}
	while (parts.length && multipliers.length);
	return output;
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

function formatTime(millis) {
  var us = millis % 1000,
      ss = ((millis - us) / 1000) % 60,
      ms = ((millis - ss * 1000 - us) / 60000) % 60;
	return (ms > 0 ? (ms + ":") : "") + pad(ss,2) + "." + pad(us,3).substr(0,2);
}

app.factory('skaterService', function() {
	function Skater(data){
		for(var key in data) {
			if(key in Skater.prototype) continue;
			if(!data.hasOwnProperty(key)) continue;
			this[key] = data[key];
		}
		if(this.birthdate)
			this.birthdate = new Date(this.birthdate);
	}
	
	Skater.prototype.category = function(season) {
		if(!season) season = SEASON;
		if(!this.birthdate) return "?";
		return parseCategory(new Date(this.birthdate), season);
	};
	
	Skater.prototype.href = function(link) {
		switch(link.type) {
			case "ssr": return "http://speedskatingresults.com/index.php?p=17&s=:id".replace(":id", link.code);
			case "osta": return "http://www.osta.nl/?pid=:id".replace(":id", link.code);
			case "knsb":
			default: return "";
		}
	};
	
	Skater.prototype.remove = function(){
		var i = service.skaters.indexOf(this);
		if(i >= 0){
			service.skaters.splice(i, 1);
			service.save();
		}
	};
	
	Skater.prototype.equals = function(obj, ignoreBirthdate){
		var equal =
			this.first_name == obj.first_name && 
			this.last_name == obj.last_name &&
			(ignoreBirthdate || (this.birthdate instanceof Date && this.birthdate.getTime()) == (obj.birthdate instanceof Date && obj.birthdate.getTime()))
		return equal;
	};

	var service = {
		skaters: (JSON.parse(localStorage.getItem("skaters")) || []).map(data => new Skater(data)),
		save: function(){
			localStorage.setItem("skaters", JSON.stringify(service.skaters));
		},
		add: function(data){
			service.skaters.push(new Skater(data));
		},
		parseTime: parseTime,
		formatTime: formatTime,
		ageToCategory: ageToCategory
	};
	
	service.save();
  return service;
});