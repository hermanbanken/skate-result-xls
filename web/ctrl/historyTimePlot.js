app.factory("historyTimePlot", function(skaterService) {

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
	
	return function(data, nodeSelector, labelSelector, titleText) {
		var xScale = new Plottable.Scales.Time();
		var yScale = new Plottable.Scales.Linear();
		var xAxis = new Plottable.Axes.Time(xScale, "bottom")
			.margin(5)
			.annotationsEnabled(true);
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
		
		var timeline = new Plottable.Plots.Scatter()
			.x(function(d) { return parseDate(d.date); }, xScale)
			.y(function(d) { return parseSkateTime(d.time); }, yScale)
			.size(10)
			.attr("opacity", 1)
			.attr("stroke-width", 1)
			.attr("fill", labelSelector, fillColorScale)
			.attr("stroke", "#ffffff")
			.autorangeMode("y")
		
		var guideline = new Plottable.Components.GuideLineLayer("vertical")
			.scale(xScale);
		
		var group = new Plottable.Components.Group([guideline, timeline, legend, title]);
		var table = new Plottable.Components.Table([[yAxis, group],
																								[null, xAxis]]);
		table.renderTo(nodeSelector);
		
		new Plottable.Interactions.PanZoom(xScale, null)
			.attachTo(timeline)
			.minDomainExtent(xScale, 1000 * 60 * 60 * 24 * 365)
			.maxDomainExtent(xScale, 1000 * 60 * 60 * 24 * 365 * 20);;
		
		new Plottable.Interactions.Pointer()
			.attachTo(table)
			.onPointerMove(function(p) {
				var entity = timeline.entityNearest(p);
				var date = parseDate(entity.datum.date);
				guideline.value(date);
				xAxis.annotatedTicks([date]);
				title.text(entity.datum.date + " " + entity.datum.time);
			})
			.onPointerExit(function() {
				guideline.pixelPosition(-10);
				xAxis.annotatedTicks([]);
				title.text("");
			});
		
		timeline.addDataset(new Plottable.Dataset(data));
	}
});