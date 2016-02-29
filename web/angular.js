const OLD_MINDAYS = -9;

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

app.filter('hideOld', function() {
  return function(inputArray, filter) {
		return inputArray.filter(c => {
			return filter.showOld || moment(c.starts).isAfter(moment().add(OLD_MINDAYS, 'day'));
		})
  };
});

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
	var root = $stateProvider;
	
	root.state('competitions', {
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

app.run(function($rootScope){
	$rootScope.$on('$stateChangeStart', function(event, toState, toParams, fromState, fromParams){
		$(".page-loading .modal").modal('show');
	});
	$rootScope.$on('$stateChangeSuccess', function(event, toState, toParams, fromState, fromParams){
		$(".page-loading .modal").modal('hide');
	});
});

//$('<div class="progress"><div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 100%"></div></div>')
	
app.controller('CompetitionListCtrl', ["$scope", "$rootScope", "$http", "competitions", "$filter", function ($scope, $rootScope, $http, competitions, $filter) {
	
	// Group by availability state
	$scope.competitions = _.map(_.groupBy(competitions, function(c) {
		if(new Date(c.ends) > new Date())
			return 0;
		return c.resultsStatus;
	}), function(list, key){
		return { state: key, value: list };
	});
	
	$scope.showOld = function(){
		$rootScope.filter.showOld = true;
	}
	$scope.countOlder = function(cs) {
		cs = cs
			.filter(c => c.discipline == $scope.filter.discipline)
			.filter(c => c.venue && c.venue.code == $scope.filter.venue)
		
		return cs.filter(c => moment(c.starts).isBefore(moment().add(OLD_MINDAYS, 'day'))).length;
	}
	
}]);

app.controller('CompetitionDetailCtrl', function ($scope, $state, $stateParams, result, competition, skaterService) {
	$scope.jump = function(id){
		$("#"+id)[0].scrollIntoView()
		document.body.scrollTop -= $(".navbar").height() + 10;
	}
	
	$scope.competition = competition;
	
	$scope.result = result.map(function(part) {
		// Find distinct list of passings distances available in this competition part
		part.passings = _.chain(part.results).pluck("times").map(function(ts) { 
			return ts.map(function(t) { return t[0]; });
		}).flatten().uniq().value();
		return part;
	});
	
	function firstStart(dists) {
		return _.chain(dists).pluck("number").min().value();
	}
	
	/**
	 * Convert single skaters result line to reducable object
	 */
	function buildStart(distance, distanceQuantity, index, start) {		
		let last = _.last(start.times)
		let time = last[1]
		let points = (skaterService.parseTime(time, true) / distance * 500)	
		return {
			index,
			distance,
			time,
			points,
			id: start.name + ":" + start.category, 
			name: start.name,
			category: start.category,
			ok: distance == parseInt(last[0].replace('m', "")) || distanceQuantity !== 0,
		}
	}
	
	function sumPoints(starts) {
		return _.chain(starts)
			.filter(u => u.ok)
			.pluck("points")
			.reduce((s,n) => s+n, 0)
			.value();
	}
	
	/**
	 * Simplify ranking column data
	 */
	function simplifyCols(starts) {
		let simple = starts.map(s => _.pick(s, "index", "distance", "time", "ok"));
		return _.indexBy(simple, o => o.index + "");
	}
	
	/**
	 * Maps lists of distance results to rankings
	 */
	function buildRank(dists) {
		var rank = _.chain(dists)
		  // make distance result rows groupable 
			.map((dist, index) => dist.results.map(buildStart.bind(null, dist.value, dist.valueQuantity, index)))
			.flatten()
			.groupBy("id")
			.values()
			// create ranking row
			.map(starts => ({
				category: starts[0].category,
				cols: simplifyCols(starts),
				distances: starts.filter(s => s.ok).length,
				name: starts[0].name,
				points: sumPoints(starts),
			}))
			.value();
		rank.distances = _.chain(dists).pluck("value").pairs().value();
		rank.name = _.pluck(dists, "combinationName")[0];
		rank.id = _.pluck(dists, "combinationId")[0];
		rank.hasTotal = _.every(dists, d => d.valueQuantity === 0);
		return rank;
	}

	// Create a ranking per combination
	var ranks = _.chain(result)
		.groupBy("combinationId")
		.values()
		.sortBy(firstStart)
		.map(buildRank)
		.value();
	
	console.log("ranks", ranks)
	window.ranks = ranks;
	
	// Reload
	$scope.refresh = function() {
		console.log("Deleting cache of competition", competition);
		$scope.result = [];
		$scope.ranks = [];
		
		competition.$delete(competition).then(function(){
			console.log("Reloading competition", competition.id);
			$state.transitionTo($state.current, $stateParams, {
					reload: true,
					inherit: false,
					notify: true
			});
		});
	};

	$scope.ranks = ranks;	
	$scope.competition = competition;
});