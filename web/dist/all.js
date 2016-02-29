'use strict';

angular.module('skateApp.services', []).factory('Competition', ['$resource', function ($resource) {
	return $resource('/api/competitions/:id', null);
}]).factory('CompetitionResult', ['$resource', function ($resource) {
	return $resource('/api/competitions/:id/result', null, {
		get: { method: "GET", isArray: true }
	});
}]);

var app = angular.module('skateApp', ['ngResource', 'ngRoute', 'ui.router', 'angular.filter', 'skateApp.services']).run(function ($rootScope, $state, $stateParams) {
	$rootScope.$on("$stateChangeError", console.log.bind(console));
	// It's very handy to add references to $state and $stateParams to the $rootScope
	// so that you can access them from any scope within your applications.
	$rootScope.$state = $state;
	$rootScope.$stateParams = $stateParams;
});

app.controller('appCtrl', ["$scope", "$rootScope", "$http", function ($scope, $rootScope, $http) {

	// Filtering
	$rootScope.filter = JSON.parse(localStorage.getItem("filter")) || { venue: null, discipline: null };
	$scope.doFilter = function () {
		var old = JSON.parse(localStorage.getItem("filter")) || {};
		if (old.discipline != $rootScope.filter.discipline) {
			$rootScope.filter.venue = null;
		}
		localStorage.setItem("filter", JSON.stringify($rootScope.filter));
	};
	$scope.doFilter();
}]);

app.config(function ($locationProvider, $stateProvider, $urlRouterProvider, $resourceProvider) {
	// Fancy HTML5 url's (no hashes).
	//$locationProvider.html5Mode( true );

	// Routes
	var root = $stateProvider;

	root.state('competitions', {
		abstract: true,
		url: "/competitions",
		template: "<ui-view />",
		resolve: {
			competitions: function competitions(Competition) {
				return Competition.query().$promise;
			}
		},
		onEnter: function onEnter($rootScope, competitions) {
			// Populate filter lists
			$rootScope.states = ["Nog niet bekend", "Voorlopig resultaat", "Resultaat beschikbaar"];
			$rootScope.venues = _.uniq(_.pluck(competitions, "venue"), "code").filter(function (a) {
				return a;
			});
		}
	});

	root.state('competitions.list', {
		url: "",
		templateUrl: 'partials/competitions.html',
		controller: 'CompetitionListCtrl'
	});

	root.state('competitions.detail', {
		url: '/:id',
		templateUrl: 'partials/competition.html',
		controller: 'CompetitionDetailCtrl',
		resolve: {
			competition: function competition(Competition, $stateParams) {
				return Competition.get({ id: $stateParams.id }).$promise;
			},
			result: function result(CompetitionResult, $stateParams) {
				return CompetitionResult.get({ id: $stateParams.id }).$promise;
			}
		}
	});

	$urlRouterProvider.otherwise("/competitions");

	// Don't strip trailing slashes from calculated URLs
	$resourceProvider.defaults.stripTrailingSlashes = false;
});

app.run(function ($rootScope) {
	$rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
		$(".page-loading .modal").modal('show');
	});
	$rootScope.$on('$stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
		$(".page-loading .modal").modal('hide');
	});
});

//$('<div class="progress"><div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 100%"></div></div>')

app.controller('CompetitionListCtrl', ["$scope", "$rootScope", "$http", "competitions", function ($scope, $rootScope, $http, competitions) {

	// Group by availability state
	$scope.competitions = _.map(_.groupBy(competitions, function (c) {
		if (new Date(c.ends) > new Date()) return 0;
		return c.resultsStatus;
	}), function (list, key) {
		return { state: key, value: list };
	});
}]);

app.controller('CompetitionDetailCtrl', function ($scope, $state, $stateParams, result, competition, skaterService) {
	$scope.jump = function (id) {
		$("#" + id)[0].scrollIntoView();
		document.body.scrollTop -= $(".navbar").height() + 10;
	};

	$scope.competition = competition;

	$scope.result = result.map(function (part) {
		// Find distinct list of passings distances available in this competition part
		part.passings = _.chain(part.results).pluck("times").map(function (ts) {
			return ts.map(function (t) {
				return t[0];
			});
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
		var last = _.last(start.times);
		var time = last[1];
		var points = skaterService.parseTime(time, true) / distance * 500;
		return {
			index: index,
			distance: distance,
			time: time,
			points: points,
			id: start.name + ":" + start.category,
			name: start.name,
			category: start.category,
			ok: distance == parseInt(last[0].replace('m', "")) || distanceQuantity !== 0
		};
	}

	function sumPoints(starts) {
		return _.chain(starts).filter(function (u) {
			return u.ok;
		}).pluck("points").reduce(function (s, n) {
			return s + n;
		}, 0).value();
	}

	/**
  * Simplify ranking column data
  */
	function simplifyCols(starts) {
		var simple = starts.map(function (s) {
			return _.pick(s, "index", "distance", "time", "ok");
		});
		return _.indexBy(simple, function (o) {
			return o.index + "";
		});
	}

	/**
  * Maps lists of distance results to rankings
  */
	function buildRank(dists) {
		var rank = _.chain(dists)
		// make distance result rows groupable
		.map(function (dist, index) {
			return dist.results.map(buildStart.bind(null, dist.value, dist.valueQuantity, index));
		}).flatten().groupBy("id").values()
		// create ranking row
		.map(function (starts) {
			return {
				category: starts[0].category,
				cols: simplifyCols(starts),
				distances: starts.filter(function (s) {
					return s.ok;
				}).length,
				name: starts[0].name,
				points: sumPoints(starts)
			};
		}).value();
		rank.distances = _.chain(dists).pluck("value").pairs().value();
		rank.name = _.pluck(dists, "combinationName")[0];
		rank.id = _.pluck(dists, "combinationId")[0];
		rank.hasTotal = _.every(dists, function (d) {
			return d.valueQuantity === 0;
		});
		return rank;
	}

	// Create a ranking per combination
	var ranks = _.chain(result).groupBy("combinationId").values().sortBy(firstStart).map(buildRank).value();

	console.log("ranks", ranks);
	window.ranks = ranks;

	// Reload
	$scope.refresh = function () {
		console.log("Deleting cache of competition", competition);
		$scope.result = [];
		$scope.ranks = [];

		competition.$delete(competition).then(function () {
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
"use strict";

app.factory("historyTimePlot", function (skaterService) {

	function parseDate(dateString) {
		return new Date(dateString);
	}
	function parseSkateTime(skateTime) {
		if (skateTime) return skaterService.parseTime(skateTime);
		return;
	}
	function formatSkateTime(millis) {
		return skaterService.formatTime(millis);
	}

	return function (data, nodeSelector, labelSelector, titleText) {
		var xScale = new Plottable.Scales.Time();
		var yScale = new Plottable.Scales.Linear();
		var xAxis = new Plottable.Axes.Time(xScale, "bottom").margin(5).annotationsEnabled(true);
		var yAxis = new Plottable.Axes.Numeric(yScale, "left").margin(5).formatter(formatSkateTime);

		var names = _.chain(data).groupBy(labelSelector).keys().value();

		var fillColorScale, legend;
		if (typeof labelSelector == 'function') {
			fillColorScale = new Plottable.Scales.Color().domain(names);
			legend = new Plottable.Components.Legend(fillColorScale);
		} else {
			fillColorScale = "#0052A5";
		}

		var title = new Plottable.Components.TitleLabel(titleText, 0).yAlignment("top");

		var timeline = new Plottable.Plots.Scatter().x(function (d) {
			return parseDate(d.date);
		}, xScale).y(function (d) {
			return parseSkateTime(d.time);
		}, yScale).size(10).attr("opacity", 1).attr("stroke-width", 1).attr("fill", labelSelector, fillColorScale).attr("stroke", "#ffffff").autorangeMode("y");

		var guideline = new Plottable.Components.GuideLineLayer("vertical").scale(xScale);

		var group = new Plottable.Components.Group([guideline, timeline, legend, title]);
		var table = new Plottable.Components.Table([[yAxis, group], [null, xAxis]]);
		table.renderTo(nodeSelector);

		new Plottable.Interactions.PanZoom(xScale, null).attachTo(timeline).minDomainExtent(xScale, 1000 * 60 * 60 * 24 * 365).maxDomainExtent(xScale, 1000 * 60 * 60 * 24 * 365 * 20);;

		new Plottable.Interactions.Pointer().attachTo(table).onPointerMove(function (p) {
			var entity = timeline.entityNearest(p);
			var date = parseDate(entity.datum.date);
			guideline.value(date);
			xAxis.annotatedTicks([date]);
			title.text(entity.datum.date + " " + entity.datum.time);
		}).onPointerExit(function () {
			guideline.pixelPosition(-10);
			xAxis.annotatedTicks([]);
			title.text("");
		});

		var times = data.map(function (d) {
			return d.time;
		}).map(parseSkateTime).sort(function (a, b) {
			return a - b;
		});
		// Filter times that are larger than 110% of the 90 percentile time,
		// to filter races where the skater has fallen
		var p_80f1_1 = data.filter(function (d, i) {
			return parseSkateTime(d.time) < 1.1 * times[Math.floor(times.length * .8)];
		});

		timeline.addDataset(new Plottable.Dataset(p_80f1_1));
	};
});
"use strict";

app.factory("lapTimePlot", function (skaterService) {

	function parseDate(dateString) {
		return new Date(dateString);
	}
	function parseSkateTime(skateTime) {
		if (skateTime) return skaterService.parseTime(skateTime);
		return;
	}
	function formatSkateTime(millis) {
		return skaterService.formatTime(millis);
	}

	function lapDistances(distanceString) {
		var laps = [],
		    d = parseInt(distanceString);
		while (d > 0) {
			laps.unshift(d), d -= 400;
		}return laps;
	}

	return function (data, nodeSelector, labelSelector, titleText) {
		var xScale = new Plottable.Scales.Category();
		var yScale = new Plottable.Scales.Linear();
		var xAxis = new Plottable.Axes.Category(xScale, "bottom").margin(5).annotatedTicks(lapDistances(data[0].distance)).annotationsEnabled(false);
		var yAxis = new Plottable.Axes.Numeric(yScale, "left").margin(5).formatter(formatSkateTime);

		var names = _.chain(data).groupBy(labelSelector).keys().value();

		var fillColorScale, legend;
		if (typeof labelSelector == 'function') {
			fillColorScale = new Plottable.Scales.Color().domain(names);
			legend = new Plottable.Components.Legend(fillColorScale);
		} else {
			fillColorScale = "#0052A5";
		}

		var title = new Plottable.Components.TitleLabel(titleText, 0).yAlignment("top");

		var timeline = new Plottable.Components.Group();

		var guideline = new Plottable.Components.GuideLineLayer("vertical").scale(xScale);

		var group = new Plottable.Components.Group([guideline, timeline, legend, title]);
		var table = new Plottable.Components.Table([[yAxis, group], [null, xAxis]]);
		table.renderTo(nodeSelector);

		// var times = data.map(d => d.time).map(parseSkateTime).sort((a,b) => a-b);
		// // Filter times that are larger than 110% of the 90 percentile time,
		// // to filter races where the skater has fallen
		// var p_80f1_1 = data.filter((d, i) => parseSkateTime(d.time) < 1.1 * times[Math.floor(times.length * .8)]);

		var races = data.filter(function (race) {
			return race.laps;
		}).filter(function (race) {
			return race.venue != "NY";
		}).sort(function (a, b) {
			return a.time.localeCompare(b.time);
		}).slice(0, 10);

		var bounds = races.map(function (race) {
			return parseSkateTime(race.time);
		}).sort();
		bounds.splice(1, bounds.length - 2);

		function opacity(d, i) {
			var t = parseSkateTime(d.time);
			var o = .2 + .8 * ((bounds[1] - t) / (bounds[1] - bounds[0]));
			return o;
		}

		races.forEach(function (race) {
			timeline.append(new Plottable.Plots.Line().addDataset(new Plottable.Dataset(race.laps.filter(function (l) {
				return l.lap_time;
			}).sort(function (a, b) {
				return a.distance - b.distance;
			}))).x(function (d) {
				return d.distance;
			}, xScale).y(function (d) {
				return parseSkateTime(d.lap_time);
			}, yScale)
			//.size(10)
			.attr("opacity", opacity(race)).attr("stroke-width", 2)
			//.attr("fill", labelSelector, fillColorScale)
			.attr("stroke", fillColorScale.scale(0))
			// .autorangeMode("y")
			);
		});
	};
});
'use strict';

app.factory('Loader', function ($q) {
	return function Loader(name) {
		var progress = $q.defer();

		function loading(fn) {
			var args = Array.prototype.slice.call(arguments, 1);
			function notify() {
				progress.notify({
					name: name,
					progress: (loading.total - loading.counter) / loading.total,
					count: loading.counter, total: loading.total,
					progress_success: (loading.total - loading.counter - loading.errors) / loading.total,
					progress_error: loading.errors / loading.total
				});
			}
			return $q.when().then(function () {
				loading.total++;
				loading.counter++;
				notify();
			}).then(function () {
				return fn.apply(null, args);
			}).catch(function (e) {
				loading.errors++;
				return e;
			}).finally(function () {
				loading.counter--;
				notify();
			});
		}

		loading.total = 0;
		loading.counter = 0;
		loading.errors = 0;
		loading.progress = progress.promise;

		loading.wrap = function (fn) {
			var args = Array.prototype.slice.call(arguments, 1);
			var d = $q.defer();
			fn.apply(null, args).then(function (v) {
				return d.resolve(v);
			}, function (e) {
				return d.reject(e);
			});
			loading.progress.then(null, null, function (n) {
				return d.notify(n);
			});
			return d.promise;
		};

		return loading;
	};
});
"use strict";

// minus 1 for stupid JavaScript dates
var MONTH_JUNE = 5;
var SEASON = new Date().getFullYear() + (new Date().getMonth() <= MONTH_JUNE ? -1 : 0);

if (!Function.identity) {
	Function.identity = function (id) {
		return id;
	};
}

function ageToCategory(age) {
	if (age < 7) return "PF";
	if (age < 13) return "P" + "FEDCBA"[age - 7];
	if (age < 19) return "CBA"[(age - 13) / 2] + ((age - 13) % 2 + 1);
	if (age < 23) return "N" + (age - 19 + 1);
	if (age < 30) return "SA";
	if (age < 39) return "SB";
	if (age < 69) return "" + (40 + Math.floor((age - 39) / 5) * 5);

	return "70";
}

function parseCategory(date, inSeason) {
	if (!date) return;
	if (!inSeason) inSeason = SEASON;

	var age = inSeason - date.getFullYear() - (date.getMonth() <= MONTH_JUNE ? 0 : 1);
	return ageToCategory(age);
}

/**
 * Parse date format to millis
 */
function parseTime(time, isEnglish) {
	var output = 0;
	var multipliers = [1, 1000, 1000 * 60, 1000 * 3600];
	var multi,
	    part,
	    parts = time.split(/[:,\.]/g);
	if (parts[parts.length - 1].length == 2) multipliers[0] = 10;
	do {
		part = parts.pop();
		multi = multipliers.shift();
		output += multi * parseInt(part);
	} while (parts.length && multipliers.length);
	return output;
}

function pad(num, size) {
	var s = num + "";
	while (s.length < size) {
		s = "0" + s;
	}return s;
}

function formatTime(millis) {
	var us = millis % 1000,
	    ss = (millis - us) / 1000 % 60,
	    ms = (millis - ss * 1000 - us) / 60000 % 60;
	return (ms > 0 ? ms + ":" : "") + pad(ss, 2) + "." + pad(us, 3).substr(0, 2);
}

app.factory('skaterService', function () {
	function Skater(data) {
		for (var key in data) {
			if (key in Skater.prototype) continue;
			if (!data.hasOwnProperty(key)) continue;
			this[key] = data[key];
		}
		if (this.birthdate) this.birthdate = new Date(this.birthdate);
	}

	Skater.prototype.category = function (season) {
		if (!season) season = SEASON;
		if (!this.birthdate) return "?";
		return parseCategory(new Date(this.birthdate), season);
	};

	Skater.prototype.href = function (link) {
		switch (link.type) {
			case "ssr":
				return "http://speedskatingresults.com/index.php?p=17&s=:id".replace(":id", link.code);
			case "osta":
				return "http://www.osta.nl/?pid=:id".replace(":id", link.code);
			case "knsb":
			default:
				return "";
		}
	};

	Skater.prototype.remove = function () {
		var i = service.skaters.indexOf(this);
		if (i >= 0) {
			service.skaters.splice(i, 1);
			service.save();
		}
	};

	Skater.prototype.equals = function (obj, ignoreBirthdate) {
		var equal = this.first_name == obj.first_name && this.last_name == obj.last_name && (ignoreBirthdate || (this.birthdate instanceof Date && this.birthdate.getTime()) == (obj.birthdate instanceof Date && obj.birthdate.getTime()));
		return equal;
	};

	var service = {
		skaters: (JSON.parse(localStorage.getItem("skaters")) || []).map(function (data) {
			return new Skater(data);
		}),
		save: function save() {
			localStorage.setItem("skaters", JSON.stringify(service.skaters));
		},
		add: function add(data) {
			service.skaters.push(new Skater(data));
		},
		parseTime: parseTime,
		formatTime: formatTime,
		ageToCategory: ageToCategory
	};

	service.save();
	return service;
});
'use strict';

app.config(function ($locationProvider, $stateProvider) {
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
	});

	router.state('skaters.link', {
		url: '/link?first_name&last_name&birthdate',
		views: {
			'modal@': {
				templateUrl: 'partials/skaters_link.html',
				controller: 'SkatersLinkCtrl',
				resolve: {
					findresult: function findresult(SkatersFindResult, $state, $stateParams) {
						return SkatersFindResult.get({
							first_name: $stateParams.first_name,
							last_name: $stateParams.last_name,
							birthdate: $stateParams.birthdate
						});
					}
				}
			}
		},
		onExit: function onExit() {
			$(".modal-backdrop").remove();
		}
	});
});

app.controller('SkatersCtrl', function ($scope, $rootScope, $stateParams, skaterService) {
	$scope.skaters = skaterService.skaters;
	$scope.add_skater = {};
	$scope.compare = [];
	$rootScope.compared = [];

	$scope.$watch("compare", function (value, old) {
		$scope.compared = value.map(function (v, i) {
			return [v, i];
		}).filter(function (v) {
			return v[0];
		}).map(function (v) {
			return v[1];
		});
	}, true);

	// Submit form
	$scope.addSkater = function (model) {
		if (model.birthdate) {
			model.birthdate = new Date(model.birthdate);
		}
		skaterService.add(model);
		$scope.add_skater = {};
		skaterService.save();
	};
});

app.controller('SkatersSingleCtrl', function ($scope, $rootScope, $stateParams, skaterService, RaceService, historyTimePlot, lapTimePlot) {
	$stateParams.birthdate = new Date($stateParams.birthdate);
	$scope.skater = skaterService.skaters.find(function (skater) {
		return skater.equals($stateParams, true);
	});

	$scope.progress = 0;
	$scope.times = RaceService.get($scope.skater).then(function (result) {
		window.result = result;
		[500, 1000, 1500, 3000, 5000, 10000].forEach(function (distance) {
			historyTimePlot(result.times.filter(function (m) {
				return m.distance == distance;
			}), ".graph[data-type='history'][data-distance='" + distance + "']", function (match) {
				return match.name;
			});
			if (distance != 500) lapTimePlot(result.times.filter(function (m) {
				return m.distance == distance;
			}), ".graph[data-type='laps'][data-distance='" + distance + "']", function (match) {
				return match.name;
			});
		});
		console.log("result", result);
	}, function (e) {
		console.log("error", e);
	}, function (n) {
		$scope.progress_success = n.progress_success;
		$scope.progress_error = n.progress_error;
	});
});

app.controller('SkatersLinkCtrl', function ($scope, $state, $stateParams, skaterService, findresult) {
	var birthdate = $stateParams.birthdate = new Date($stateParams.birthdate);

	$scope.skater = skaterService.skaters.find(function (skater) {
		return skater.equals($stateParams);
	});
	$scope.skaters = skaterService.skaters;

	// Fill checkboxes when category matches
	findresult.$promise.then(function (results) {
		$scope.results = results.map(function (result) {
			if (birthdate) {
				result.selected = result.categories.every(function (c) {
					return parseCategory(birthdate, c.season) == c.category.substring(1);
				});
			}
			return result;
		});
	});

	$scope.saveLinks = function () {
		var links = $scope.results.filter(function (r) {
			return r.selected;
		});
		var updated = skaterService.skaters.filter(function (skater) {
			return skater.equals($stateParams);
		});

		if (updated.length == 0 && (!$stateParams.birthdate || isNaN($stateParams.birthdate.getTime()))) {
			updated = skaterService.skaters.filter(function (skater) {
				return skater.equals($stateParams, true);
			});
		}

		updated.forEach(function (skater) {
			skater.ids = links;
		});
		skaterService.save();

		if (updated.length != 1) alert("Something unexpected happened. Sorry :(");else $state.go("^");
	};

	$('.page-modal .modal').modal({}).on('hidden.bs.modal', function (e) {
		$state.go('^');
	});
});
'use strict';

app.controller('SkatersCompareCtrl', function ($scope, $state, $stateParams, skaterService) {

	//	$rootScope.compared = [];
	console.log("Compare now!");
});

app.filter('withIndexes', function () {
	return function (input, indexes) {
		return input.filter(function (v, k) {
			return indexes.indexOf(k) >= 0;
		});
	};
});
'use strict';

if (typeof Array.prototype.flatMap != 'function') Array.prototype.flatMap = function (selector) {
	return this.map(selector).reduce(function (memo, list) {
		memo.push.apply(memo, list);
		return memo;
	}, []);
};

app.factory('SkatersFindResult', ['$resource', function ($resource) {
	return $resource('/api/skaters/find', null, {
		get: { method: "GET", isArray: true }
	});
}]).factory('RaceTime', function ($resource) {
	return $resource('/api/skaters/:type/:code', null);
}).factory('RaceService', function ($q, RaceTime, $resource, Loader) {

	function scopedGet(input) {
		var loading = Loader("races");

		// !Scoped Functions!

		function combine(one, multiple) {
			return {
				times: (one && one.times || []).concat(multiple.flatMap(function (s) {
					return s.times;
				})),
				errors: (one && one.errors || []).concat(multiple.flatMap(function (s) {
					return s.errors;
				}))
			};
		}

		function fetch(url) {
			return loading(function () {
				return $resource(url).get().$promise;
			}).then(recurse, function (error) {
				return $q.resolve({ times: [], errors: [error.data] });
			});
		}

		function recurse(data) {
			var deferred = $q.defer();
			// If we have more
			if (Array.isArray(data.more)) {
				return $q.all(data.more.map(fetch)).then(function (subs) {
					return combine(data, subs);
				});
			}
			// No more
			else {
					deferred.resolve({ times: data.times, errors: [] });
				}

			return deferred.promise;
		}

		function mergeSources(data) {
			data.times = _.chain(data.times)
			// Join by day - might be not good enough
			.groupBy(function (m) {
				return m.date + "|" + m.distance + "|" + m.time;
			})
			// Merge
			.map(function (t) {
				return _.extend.bind(_, {}).apply(_, t);
			}).sortBy(function (m) {
				return m.date;
			}).value();
			return data;
		}

		// !Actual processing!

		function get(input) {
			// Skater
			if (input.ids) {
				return $q.all(input.ids.map(get)).then(function (list) {
					return combine(null, list);
				}).then(mergeSources);
			}

			if (!input.type || !input.code) return $q.reject(new Error(input, "is is not a linkable id"));

			// Linkable service
			return loading(function () {
				return RaceTime.get({ type: input.type, code: input.code }).$promise;
			}).then(recurse);
		}

		// Wrap so this promise notifies progress
		return loading.wrap(get, input);
	}

	return {
		get: scopedGet
	};
});
//# sourceMappingURL=all.js.map
