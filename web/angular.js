angular.module('skateApp.services', [])
	.factory('Competition', ['$resource', function($resource) {
		return $resource('/competitions/:id', null);
	}]);

var app = angular.module('skateApp', [
	'ngResource',
	'ngRoute',
	'ui.router',
	'angular.filter',
	'skateApp.services'
]);

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

app.config(function($locationProvider, $routeProvider, $resourceProvider) {
	// Fancy HTML5 url's (no hashes).
	// $locationProvider.html5Mode( true );
	
	// Routes
	$routeProvider.
		when('/competitions', {
			templateUrl: 'partials/competitions.html',
			controller: 'CompetitionListCtrl',
			resolve: {
				competitions: function(Competition){
						return Competition.query().$promise;
				}
			}
		}).
		when('/competitions/:id', {
			templateUrl: 'partials/competition.html',
			controller: 'CompetitionDetailCtrl'
		}).
		otherwise({
			redirectTo: '/competitions'
		});
		
	// Don't strip trailing slashes from calculated URLs
	$resourceProvider.defaults.stripTrailingSlashes = false;
});
	
app.controller('CompetitionListCtrl', ["$scope", "$rootScope", "$http", "competitions", function ($scope, $rootScope, $http, competitions) {
	var c = $scope.competitions = _.map(_.groupBy(competitions, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	}), function(list, key){
		return { state: key, value: list };
	});
	$scope.states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];
	$rootScope.venues = _.uniq(_.pluck(c, "venue"), "code").filter(function(a){return a;});
}])

app.controller('CompetitionDetailCtrl', ["$scope", "$routeParams", function ($scope, $routeParams) {
	console.log("Competition Detail");
}])