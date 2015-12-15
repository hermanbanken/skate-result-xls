app

.factory('Loader', function($q) {
	return function Loader(name) {
		var progress = $q.defer();

		function loading(fn) {
			var args = Array.prototype.slice.call(arguments,1);
			function notify() {
				progress.notify({
					name,
					progress: (loading.total - loading.counter) / loading.total, 
					count: loading.counter, total: loading.total,
					progress_success: (loading.total - loading.counter - loading.errors) / loading.total,
					progress_error: loading.errors / loading.total,
				});
			}
			return $q.when().then(function(){
					loading.total++;
					loading.counter++;
					notify();
			}).then(function(){
					return fn.apply(null, args);
			}).catch(function(e){
				loading.errors++;
				return e;
			}).finally(function(){
				loading.counter--;
				notify();
			});
		}

		loading.total = 0;
		loading.counter = 0;
		loading.errors = 0;
		loading.progress = progress.promise;
		
		loading.wrap = function(fn) {
			var args = Array.prototype.slice.call(arguments,1);
			var d = $q.defer();
			fn.apply(null, args).then(v => d.resolve(v), e => d.reject(e));
			loading.progress.then(null, null, n => d.notify(n));
			return d.promise;
		}

		return loading;
	}
})