if(typeof Array.prototype.flatMap != 'function')
Array.prototype.flatMap = function(selector) {
	return this.map(selector).reduce(function (memo, list) { 
		memo.push.apply(memo, list); 
		return memo;
	}, []);
};

app

.factory('SkatersFindResult', ['$resource', function($resource) {
	return $resource('/api/skaters/find', null, {
		get: { method: "GET", isArray: true }
	});
}])

.factory('RaceTime', function($resource) {
	return $resource('/api/skaters/:type/:code', null);
})

.factory('RaceService', function($q, RaceTime, $resource, Loader) {
	
	function scopedGet(input) {
		var loading = Loader("races")
		
		// !Scoped Functions!
	
		function combine(one, multiple) {
			return { 
				times: (one && one.times || []).concat(multiple.flatMap(s => s.times)), 
				errors: (one && one.errors || []).concat(multiple.flatMap(s => s.errors))
			};
		}
		
		function fetch(url) {
			return loading(() => $resource(url).get().$promise)
				.then(recurse, (error) => {
					return $q.resolve({ times: [], errors: [error.data] });
				});
		}
		
		function recurse(data) {
			var deferred = $q.defer();
			// If we have more
			if(Array.isArray(data.more)) {
				return $q
					.all(data.more.map(fetch))
					.then(subs => combine(data, subs));
			}
			// No more
			else {
				deferred.resolve({ times: data.times, errors: [] });
			}
			
			return deferred.promise;
		}
	
		// !Actual processing!
		
		function get(input) {
			// Skater
			if(input.ids) {
				return $q
					.all(input.ids.map(get))
					.then(list => combine(null, list));
			}
			
			if(!input.type || !input.code)
				return $q.reject(new Error(input, "is is not a linkable id"));
			
			// Linkable service
			return loading(() => RaceTime.get({ type: input.type, code: input.code }).$promise)
				.then(recurse);
		}
		
		// Wrap so this promise notifies progress
		return loading.wrap(get, input);
	}

	return {
		get: scopedGet
	};

});