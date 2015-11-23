var disciplines = {
	"SpeedSkating.Inline": "Skeeleren",
	"SpeedSkating.LongTrack": "Langebaan",
	"SpeedSkating.Marathon": "Marathon",
	"SpeedSkating.ShortTrack": "Shorttrack"
};
var competitions = [];

function filter(name, data) {
	if(!Array.isArray(data) && typeof data == 'object'){
		data = _.pairs(data);
	}
	$("[name="+name+"]").append(data.map(function(pair){
		return '<option value="'+pair[0]+'">'+pair[1]+'</option>';
	})).on("change", function(evt){
		localStorage.setItem(name, evt.target.value);
		$(window).trigger("data-change");
	}).val(localStorage.getItem(name));
}
filter("discipline", disciplines);
$("[name=discipline]").on("change", triggerCompetitionFilter);

function triggerCompetitionFilter(){
	var venues = _.uniq(_.pluck(competitions, "venue"), "code")
		.filter(function(a){return a;})
		.filter(function(v){return v.discipline == localStorage.getItem("discipline") });
	$("[name=venue]").find("[value!='']").remove();
	venues.sort(function(a, b) { return a.address.city.localeCompare(b.address.city); });
	filter("venue", venues.map(function(v){ return [v.code, v.address.city + " ("+v.name+")"]; }));
}
	
	
var body = $('<div class="container body-content">').appendTo($("body"));
window.xhr = $.getJSON("/competitions", function (competitions) {
	window.competitions = competitions;
	triggerCompetitionFilter();
	$(window).trigger("data-change");
}).fail(function(xhr, e) {
	console.error("Error", e);
});

var states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];

$(window).on('data-change', function(){
	var comps = competitions.slice(0);
	// Apply filters
	var filter = {
		discipline: localStorage.getItem("discipline"),
		venue: localStorage.getItem("venue")
	}
	if(filter.discipline){
		comps = comps.filter(function(c){ return c.discipline == filter.discipline });
	}
	if(localStorage.getItem("venue")){
		comps = comps.filter(function(c){ return c.venue && c.venue.code == filter.venue });		
	}
	
	// Get only past matches
	// c.map(c => new Date(c.starts)).filter(d => d < new Date());

	body.html("");
	var grouped = _.groupBy(comps, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	});
	Object.keys(grouped).sort().reverse().forEach(function (status) {
		$("<h1></h1>").text(states[status]).appendTo(body);
		grouped[status].sort(function(a,b){ return a.starts.localeCompare(b.starts) });
		var lis = grouped[status].map(function (c) {
			// console.log(c.id, c.name);
			var a = $("<a></a>").attr("href", "https://inschrijven.schaatsen.nl/#/wedstrijd/"+c.id+"/informatie").text(c.name);
			var li = $("<li></li>");
			a.appendTo(li);
			li.append(" - ");
			$("<a></a>").attr("href", "/competitions/"+c.id+"/results").text("results").appendTo(li);
			li.append(" - ");
			$("<a></a>").attr("href", "http://emandovantage.com/api/competitions/"+c.id+"/reports/Results/5").text("original").appendTo(li);
			return li;
		});
		$("<ul />").append(lis).appendTo(body);
	})
})