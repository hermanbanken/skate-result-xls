app.factory("lapTimePlot", function(skaterService) {

	function parseDate(dateString) {
		return new Date(dateString);
	}
	function parseSkateTime(skateTime) {
		if(skateTime)
			return skaterService.parseTime(skateTime);
		return;
	}
	function formatSkateTime(millis) {
		return skaterService.formatTime(millis);
	}

	function lapDistances(distanceString) {
		var laps = [], d = parseInt(distanceString);
		while(d > 0)
			laps.unshift(d), d -= 400;
		return laps;		
	}

	return function(data, nodeSelector, labelSelector, titleText) {
		var xScale = new Plottable.Scales.Category();
		var yScale = new Plottable.Scales.Linear();
		var xAxis = new Plottable.Axes.Category(xScale, "bottom")
			.margin(5)
			.annotatedTicks(lapDistances(data[0].distance))
			.annotationsEnabled(false);
		var yAxis = new Plottable.Axes.Numeric(yScale, "left")
			.margin(5).formatter(formatSkateTime);

		var names = _.chain(data).groupBy(labelSelector).keys().value();

		var fillColorScale, legend;
		if(typeof labelSelector == 'function') {
			fillColorScale = new Plottable.Scales.Color().domain(names);
			legend = new Plottable.Components.Legend(fillColorScale);
		} else {
			fillColorScale = "#0052A5";
		}

		var title = new Plottable.Components.TitleLabel(titleText, 0)
			.yAlignment("top");

		var timeline = new Plottable.Components.Group();

		var guideline = new Plottable.Components.GuideLineLayer("vertical")
			.scale(xScale);

		var group = new Plottable.Components.Group([guideline, timeline, legend, title]);
		var table = new Plottable.Components.Table([[yAxis, group],
																								[null, xAxis]]);
		table.renderTo(nodeSelector);

		// var times = data.map(d => d.time).map(parseSkateTime).sort((a,b) => a-b);
		// // Filter times that are larger than 110% of the 90 percentile time,
		// // to filter races where the skater has fallen
		// var p_80f1_1 = data.filter((d, i) => parseSkateTime(d.time) < 1.1 * times[Math.floor(times.length * .8)]);

		var races = data
			.filter(race => race.laps)
			.filter(race => race.venue != "NY")
			.sort((a,b) => a.time.localeCompare(b.time))
			.slice(0, 10);
		
		var bounds = races.map(race => parseSkateTime(race.time)).sort();
		bounds.splice(1, bounds.length - 2);
		
		function opacity(d, i) {
			var t = parseSkateTime(d.time);
			var o = .2 + .8 * ((bounds[1] - t) / (bounds[1] - bounds[0]));
			return o;
		}

		races.forEach(race => {
			timeline.append(new Plottable.Plots.Line().addDataset(new Plottable.Dataset(race.laps.filter(l => l.lap_time).sort((a,b) => a.distance - b.distance)))
				.x(function(d) { return d.distance; }, xScale)
				.y(function(d) { return parseSkateTime(d.lap_time); }, yScale)
				//.size(10)
				.attr("opacity", opacity(race))
				.attr("stroke-width", 2)
				//.attr("fill", labelSelector, fillColorScale)
				.attr("stroke", fillColorScale.scale(0))
				// .autorangeMode("y")
			);
		})
	}
});