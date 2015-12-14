app.controller('SkatersCompareCtrl', function ($scope, $state, $stateParams, skaterService) {

//	$rootScope.compared = [];
	console.log("Compare now!");

});

app.filter('withIndexes', function() {
  return function(input, indexes) {
		return input.filter(function(v, k) {
			return indexes.indexOf(k) >= 0;
		});
  };
});