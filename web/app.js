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
	filter("venue", venues.map(function(v){ return [v.code, v.address.city + " ("+maxLength(v.name, 24)+")"]; }));
}
	
function maxLength(text, l){
	if(text.length > l) {
		return text.substr(0, l-3)+"...";
	}
	return text;
}
	
var master = $('#master');
var detail = $('#master');
window.xhr = $.getJSON("/competitions", function (competitions) {
	window.competitions = competitions;
	triggerCompetitionFilter();
	$(window).trigger("data-change");
}).fail(function(xhr, e) {
	console.error("Error", e);
});

var states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];
var dateOptions = { weekday: 'short' , year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minutes: 'numeric' }; 

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
	
	master.html("");
	var grouped = _.groupBy(comps, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	});
	Object.keys(grouped).sort().reverse().forEach(function (status) {
		$("<h1></h1>").text(states[status]).appendTo(master);
		grouped[status].sort(function(a,b){ return a.starts.localeCompare(b.starts) });
		var trs = grouped[status].map(function (c) {
			var tds = [
				$("<a></a>").attr("href", "/competitions/"+c.id+"/results").text(c.name).on("click", showDetail),
				moment(new Date(c.starts)).format('dd DD-MM-YYYY HH:mm'),
				$("<a></a>").attr("href", "https://inschrijven.schaatsen.nl/#/wedstrijd/"+c.id+"/informatie").html("<i class='glyphicon glyphicon-info-sign' />").attr("target", "_blank"), 
				$("<a></a>").attr("href", "http://emandovantage.com/api/competitions/"+c.id+"/reports/Results/Pdf").html("<i class='glyphicon glyphicon-file' />")
			].map(function(cell, i) { return $("<td></td>").addClass(i == 0 ? "ellipsis" : (i > 1 ? "td-icon" : "")).append(cell); });
			return $("<tr></tr>").append(tds);
		});
		trs.unshift("<tr><th class='ellipsis'>Wedstrijd</th><th style='width:11em'>Start</th><th colspan=2 style='width:4em'></th></tr>");
		var table = $("<table />").addClass("table table-ellipsis table-condensed table-hover table-striped").append(trs).appendTo(master);
	})
})

function showDetail(evt) {
	var master = $("#master").removeClass("col-sm-12").addClass("col-sm-6");
	var detail = $("#detail").removeClass("col-sm-0" ).addClass("col-sm-6");
	
	$('<div class="progress"><div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 100%"></div></div>')
		.appendTo(detail)
		.css({ position: "absolute", top: 0, left: 0, right: 0, height: "10px" });
	
	var name = $(evt.target).closest("tr").find("td:first-child").text();
	$.getJSON($(evt.target).attr("href")).then(function(data) {
		detail.html("<h1>"+name+"</h1>");
		data.forEach(function(part) {
			var trs = part.results.map(function(result) {
				var tds = [
					result.pair,
					result.lane,
					result.name,
					result.category
				];
				tds.push.apply(tds, result.times.map(function(triple) {
					return " " + triple[1] + " (" + triple[2] + ")";
				}));
				return $("<tr />").append(tds.map(function(fill){ return $("<td></td>").text(fill) }));
			});
			
			var distances = _.uniq(_.flatten(_.pluck(part.results, "times").map(function(ts) { return ts.map(function(t) { return t[0]; }); })));
			console.log(distances);
			trs.unshift($("<tr />").append("<th colspan=4>"+part.name+"</th>").append(distances.map(function(d){ return "<td>"+d+"</td>" })));
				
			$("<table />").addClass("table table-condensed table-hover table-striped").append(trs).appendTo(detail);
		})
//		detail.html("<h2>"+name+"</h2><pre><code></code></pre>").find("code").text(JSON.stringify(data, null, '  '));
	});
	return false;
}