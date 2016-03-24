'use strict';

app.config(function($locationProvider, $stateProvider) {
	// Router
	var router = $stateProvider;
	
	router.state('skaters', {
		url: '/skaters',
		views: {	
			'': {
				templateUrl: 'partials/skaters.html',
				controller: 'SkatersCtrl'
			},
			'compare@skaters': {
				templateUrl: 'partials/skaters_compare.html',
				controller: 'SkatersCompareCtrl',
				resolve: {}
			}
		}
	});
	
	router.state('skater_single', {
		url: '/skaters/single?first_name&last_name&birthdate',
		views: {
			'': {
				templateUrl: 'partials/skaters_single.html',
				controller: 'SkatersSingleCtrl',
				resolve: {}
			}
		}
	})
	
	router.state('skaters.link', {
		url: '/link?first_name&last_name&birthdate',
		views: {
			'modal@': {
				templateUrl: 'partials/skaters_link.html',
				controller: 'SkatersLinkCtrl',
				resolve: {
					findresult: function(SkatersFindResult, $state, $stateParams){
						return SkatersFindResult.get({
							first_name: $stateParams.first_name,
							last_name: $stateParams.last_name,
							birthdate: $stateParams.birthdate
						});
					}
				}
			}
		},
		onExit: function(){
			$(".modal-backdrop").remove();
		}
	});
	
});

app.controller('SkatersCtrl', function ($scope, $rootScope, $stateParams, skaterService) {
	$scope.skaters = skaterService.skaters;
	$scope.add_skater = {};
	$scope.compare = [];
	$rootScope.compared = [];
	
	$scope.$watch("compare", function(value, old) {
		$scope.compared = value.map((v,i) => [v,i]).filter(v => v[0]).map(v => v[1]);
	}, true);
	
	// Submit form
	$scope.addSkater = function(model){
		if(model.birthdate) {
			model.birthdate = new Date(model.birthdate);
		}
		skaterService.add(model);
		$scope.add_skater = {};
		skaterService.save();
	}
});

function seasonStart(date) {
	let $d = moment(date);
	if($d.get('month') + 1 <= 6)
		$d = $d.subtract(6, 'month');
	return $d.get('year');
}

app.controller('SkatersSingleCtrl', function ($scope, $rootScope, $stateParams, skaterService, RaceService, historyTimePlot, lapTimePlot) {
	$stateParams.birthdate = new Date($stateParams.birthdate);
	$scope.skater = skaterService.skaters.find(skater => skater.equals($stateParams, true));
	
	$scope.progress = 0;
	$scope.times = RaceService.get($scope.skater).then(result => {
		window.result = result;

		// Show Plots
		[500, 1000, 1500, 3000, 5000, 10000].forEach(distance => {
			historyTimePlot(result.times.filter(m => m.distance == distance), ".graph[data-type='history'][data-distance='"+distance+"']", match => match.name);
			if(distance != 500)
				lapTimePlot(result.times.filter(m => m.distance == distance), ".graph[data-type='laps'][data-distance='"+distance+"']", match => match.name);
		})
		
		// Show PRs
		var prs = _.chain(result.times)
			.groupBy("distance")
			.map(times => _.chain(times)
				.sortBy("date")
				.reduce((memo, time) => {
					let current = parseTime(time.time);
					if(memo.best == null || memo.best > current) {
						memo.prs.push(time);
						memo.best = current;
					}
					return memo;
				}, { best: null, prs: [] })
				.value())
			.pluck("prs")
			.flatten()
			.sortBy("date")
			.groupBy(t => seasonStart(t.date))
			.value();

		$scope.prs = window.prs = prs;
		console.log("window.result", result, "window.prs", prs);
	}, e => {
		console.log("error", e);
	}, n => {
		$scope.progress_success = n.progress_success;
		$scope.progress_error = n.progress_error;
	});
});

app.controller('SkatersLinkCtrl', function ($scope, $state, $stateParams, skaterService, findresult) {
	var birthdate = $stateParams.birthdate = new Date($stateParams.birthdate);
	
	$scope.skater = skaterService.skaters.find(skater => skater.equals($stateParams));
	$scope.skaters = skaterService.skaters;
	
	// Fill checkboxes when category matches
	findresult.$promise.then(results => {
		$scope.results = results.map(result => {
			if(birthdate) {
				result.selected = result.categories.every(c => parseCategory(birthdate, c.season) == c.category.substring(1));
			}
			return result;
		})
	});
	
	$scope.saveLinks = function(){
		var links = $scope.results.filter(r => r.selected);
		var updated = skaterService.skaters.filter(skater => skater.equals($stateParams));
		
		if(updated.length == 0 && (!$stateParams.birthdate || isNaN($stateParams.birthdate.getTime()))){
			updated = skaterService.skaters.filter(skater => skater.equals($stateParams, true));
		}
		
		updated.forEach(skater => { skater.ids = links; });
		skaterService.save();
		
		if(updated.length != 1)
			alert("Something unexpected happened. Sorry :(");
		else
			$state.go("^");
	};
	
	$('.page-modal .modal').modal({}).on('hidden.bs.modal', function (e) {
		$state.go('^');
	});
});