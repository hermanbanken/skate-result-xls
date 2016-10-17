'use strict';

var rx = require('rx');
var moment = require('moment');
var oboe = require('oboe');

var Obs = rx.Observable;

// Consts:
var base = "https://inschrijven.schaatsen.nl/api/";
var vantage = "http://emandovantage.com/api/";
var excelPattern = vantage + "competitions/:id/reports/Results/5";

function oboeFail(report) {
	if (report.thrown && report.thrown != {}) {
		this.onError(report.thrown);
	}
	if (report.jsonBody) {
		this.onError(new Error(report.jsonBody));
	}
	if (report.body) {
		this.onError(new Error(report.body));
	}
	if (report.statusCode && (report.statusCode < 199 || report.statusCode >= 300)) {
		this.onError(report.statusCode);
	}
}

var Vantage = {
	competitions: function competitions() {
		var subject = new rx.Subject();
		oboe(base + "competitions").node("![*]", function (c) {
			return subject.onNext(c);
		}).done(function () {
			subject.onCompleted();
		}).fail(oboeFail.bind(subject));
		return subject;
	},
	competition: function competition(id) {
		var subject = new rx.Subject();
		oboe(base + "competitions/" + id).node("!", function (c) {
			return subject.onNext(c);
		}).done(function () {
			subject.onCompleted();
		}).fail(oboeFail.bind(subject));
		return subject;
	},
	participants: function participants(id) {
		var subject = new rx.Subject();
		oboe(base + "competitions/" + id + "/competitors").node("!", function (c) {
			return subject.onNext(c);
		}).done(function (result) {
			subject.onCompleted();
		}).fail(oboeFail.bind(subject));
		return subject;
	},
	settings: function settings(id) {
		var subject = new rx.Subject();
		oboe(base + "competitions/" + id + "/distancecombinations").node("!", function (c) {
			return subject.onNext(c);
		}).done(function (result) {
			subject.onCompleted();
		}).fail(oboeFail.bind(subject));
		return subject;
	}
};

module.exports = Vantage;