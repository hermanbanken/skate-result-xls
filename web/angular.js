angular.module('skateApp.services', [])
.factory('Competition', ['$resource', function($resource) {
	return $resource('/api/competitions/:id', null);
}])
.factory('CompetitionResult', ['$resource', function($resource) {
	return $resource('/api/competitions/:id/result', null, {
		get: { method: "GET", isArray: true }
	});
}]);

var app = angular.module('skateApp', [
	'ngResource',
	'ngRoute',
	'ui.router',
	'angular.filter',
	'skateApp.services'
])
.run(function ($rootScope, $state, $stateParams) {
  $rootScope.$on("$stateChangeError", console.log.bind(console));
	// It's very handy to add references to $state and $stateParams to the $rootScope
	// so that you can access them from any scope within your applications.
	$rootScope.$state = $state;
	$rootScope.$stateParams = $stateParams;
});

/**
 * Parse date format to millis
 */
function parseTime(time, isEnglish) {
	var separators = [
		isEnglish ? ["?", ":", "."] : [":", ".", ","], // english == format without hours?
		isEnglish ? [":", ".", ","] : [":", ",", "."]
	];
	for(var i = 0; i < separators.length; i++) {
		var _ = time.lastIndexOf(separators[i][0]),
				d = time.lastIndexOf(separators[i][1]),
				c = time.lastIndexOf(separators[i][2]);
		var subseconds = time.length - c - 1;
		var t = parseInt(time.substr(c+1)) / Math.pow(10, subseconds) * 1000;
		var s = parseInt(time.substr(d+1, c - d - 1)) * 1000;
		var m = d >= 0 ? parseInt(time.substr(_+1, d - _ - 1)) * 1000 * 60 : 0;
		var h = _ >= 0 ? parseInt(time.substr(0, _)) * 1000 * 3600 : 0;
		if(!isNaN(t+s+m+h))
			return t+s+m+h;
	}
	console.log(time, "expecting h:mm.ss,ddd or h:mm,ss.ddd", t, s, m, h);
}

app.controller('appCtrl', ["$scope", "$rootScope", "$http", function ($scope, $rootScope, $http) {
	
	// Filtering
	$rootScope.filter = JSON.parse(localStorage.getItem("filter")) || { venue: null, discipline: null };
	$scope.doFilter = function(){
		var old = JSON.parse(localStorage.getItem("filter")) || {};
		if(old.discipline != $rootScope.filter.discipline) {
			$rootScope.filter.venue = null;
		}
		localStorage.setItem("filter", JSON.stringify($rootScope.filter));
	}
	$scope.doFilter();

}]);

app.config(function($locationProvider, $stateProvider, $urlRouterProvider, $resourceProvider) {
	// Fancy HTML5 url's (no hashes).
	//$locationProvider.html5Mode( true );
	
	// Routes
	var root = $stateProvider.state('competitions', {
		abstract: true,
		url: "/competitions",
		template: "<ui-view />",
		resolve: {
			competitions: function(Competition){
				return Competition.query().$promise;
			}
		},
		onEnter: function($rootScope, competitions){
			// Populate filter lists
			$rootScope.states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];
			$rootScope.venues = _.uniq(_.pluck(competitions, "venue"), "code").filter(function(a){return a;});
		}
	})
	
	root.state('competitions.list', {
		url: "",
		templateUrl: 'partials/competitions.html',
		controller: 'CompetitionListCtrl',
	})
	
	root.state('competitions.detail', {
		url: '/:id',
		templateUrl: 'partials/competition.html',
		controller: 'CompetitionDetailCtrl',
		resolve: {
			competition: function(Competition, $stateParams){
				return Competition.get({ id: $stateParams.id }).$promise;
			},
			result: function(CompetitionResult, $stateParams){
				return CompetitionResult.get({ id: $stateParams.id }).$promise;
			}
		}
	});

	$urlRouterProvider.otherwise("/competitions");

	// Don't strip trailing slashes from calculated URLs
	$resourceProvider.defaults.stripTrailingSlashes = false;
});
	
//$('<div class="progress"><div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 100%"></div></div>')
	
app.controller('CompetitionListCtrl', ["$scope", "$rootScope", "$http", "competitions", function ($scope, $rootScope, $http, competitions) {
	
	// Group by availability state
	$scope.competitions = _.map(_.groupBy(competitions, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	}), function(list, key){
		return { state: key, value: list };
	});
	
}]);

app.controller('CompetitionDetailCtrl', function ($scope, $stateParams, result, competition) {
	$scope.result = result.map(function(part) {
		// Find distinct list of passings distances available in this competition part
		part.passings = _.chain(part.results).pluck("times").map(function(ts) { 
			return ts.map(function(t) { return t[0]; });
		}).flatten().uniq().value();
		return part;
	});
	
	// Compute
	var sums = result.map(function(part, index){
		// Per user an id and a distance
		var pilars = part.results.map(function(user){
			var id = user.name + ":" + user.category;
			var last = _.last(user.times);
			var distance = last[0].replace('m', "");
			var time = last[1];
			return { id, distance, time };
		});
		
		// Most probable distance
		var distance = _.chain(pilars).countBy("distance").value();
		var mostHave = _.chain(distance).pairs().max(function(p){ return p[1]; }).value();
		
		// Return bucket of [id : index] pairs and probability
		return {
			name: part.name, index,
			original: part,
			simple: pilars,
			buckets: _.chain(pilars).filter(u => u.distance == mostHave[0]).pluck("id").map(function(id){ return { id, index }; }).value(),
			distance: mostHave[0], certainty: mostHave[1] / part.results.length };
	});

	// Merge buckets and count how many times each distance combinations exists
	var buckets = _.chain(sums).pluck("buckets").flatten().groupBy("id").mapObject(function(list){
		return _.pluck(list, "index");
	}).countBy(function(ds, user){
		return ds.join("-");
	}).mapObject(function(count, id){
		return { count, id };
	}).values().value();
	
	// Find non-overlapping combinations. Warning: complex combinations are thus never returned
	var combinations = _.chain(result).map(function(part, index){
		var combination  = _.chain(buckets)
			.filter(function(b){ return b.id.split("-").indexOf(index+"") >= 0 })
			.max(function(b){ return b.count; }).value().id;
		return combination;
	}).uniq().value();
	// console.log(competition, combinations);

	// Calculate points per user
	var ranks = combinations.map(c => {
		var distances = c.split("-").map(d => parseInt(d));
		var rank = distances.map(i => sums[i]).map((list,listIndex) => {
			var d = parseInt(list.distance);
			return list.simple.map(user => ({
				id: user.id,
				col: { index: listIndex, distance: list.distance, time: user.time, ok: user.distance == list.distance },
				points:  (parseTime(user.time, true) / d * 500), 
				ok: user.distance == list.distance
			}))
		});
		rank.distances = distances.map(i => sums[i]).map((list,i) => [i,parseInt(list.distance)]).sort();
		return rank;
	}).map(rank => {
		var output = _.chain(rank).flatten().groupBy("id").pairs().map(pair => {
			var list = pair[1];
			return {
				name: pair[0].split(":")[0],
				category: pair[0].split(":")[1],
				cols: _.chain(list).pluck("col").indexBy("index").value(),
				points: _.chain(list).pluck("points").reduce((s,n) => s+n, 0).value(),
				distances: list.filter(u => u.ok).length
			}
		}).value();
		output.distances = rank.distances;
		return output;
	})
	console.log(ranks)

	$scope.ranks = ranks;	
	$scope.competition = competition;
});