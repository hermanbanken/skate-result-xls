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
function parseTime(time) {
  var _ = time.lastIndexOf(":"),
      d = time.lastIndexOf("."),
      c = time.lastIndexOf(",");
  var subseconds = time.length - c - 1;
  var t = parseInt(time.substr(c+1)) / Math.pow(10, subseconds) * 1000;
  var s = parseInt(time.substr(d+1, c - d - 1)) * 1000;
  var m = d >= 0 ? parseInt(time.substr(_+1, d - _ - 1)) * 1000 * 60 : 0;
  var h = _ >= 0 ? parseInt(time.substr(0, _)) * 1000 * 3600 : 0;
  return t + s + m + h;
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
	
app.controller('CompetitionListCtrl', ["$scope", "$rootScope", "$http", "competitions", function ($scope, $rootScope, $http, competitions) {
	
	// Group by availability state
	$scope.competitions = _.map(_.groupBy(competitions, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	}), function(list, key){
		return { state: key, value: list };
	});
	$scope.states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];
	$rootScope.venues = _.uniq(_.pluck(c, "venue"), "code").filter(function(a){return a;});
}])

app.controller('CompetitionDetailCtrl', function ($scope, $routeParams, competition, result) {
	console.log("Competition Detail");
	$scope.competition = competition;
	$scope.result = result.map(function(part) {
		// Find distinct list of passings distances available in this competition part
		part.passings = _.chain(part.results).pluck("times").map(function(ts) { 
			return ts.map(function(t) { return t[0]; });
		}).flatten().uniq().value();
		return part;
	});
})