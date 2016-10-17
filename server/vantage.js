'use strict';

var rx = require('rx');
var moment = require('moment');
var oboe = require('oboe');

const Obs = rx.Observable;

// Consts:
const base = "https://inschrijven.schaatsen.nl/api/";
const vantage = "http://emandovantage.com/api/";
const excelPattern = vantage+"competitions/:id/reports/Results/5";

function oboeFail(report) {
	if(report.thrown && report.thrown != {}) {
		this.onError(report.thrown);
	}
	if(report.jsonBody) {
		this.onError(new Error(report.jsonBody));
	}
	if(report.body) {
		this.onError(new Error(report.body));
	}
	if(report.statusCode && (report.statusCode < 199 || report.statusCode >= 300)) {
		this.onError(report.statusCode);
	}
}

const Vantage = {
	competitions: function () {
		var subject = new rx.Subject();
		oboe(base+"competitions")
			.node("![*]", (c) => subject.onNext(c))
			.done(() => { subject.onCompleted(); })
			.fail(oboeFail.bind(subject))
		return subject;
	},
	competition: function (id) {
		var subject = new rx.Subject();
		oboe(base+"competitions/"+id)
			.node("!", (c) => subject.onNext(c))
			.done(() => { subject.onCompleted(); })
			.fail(oboeFail.bind(subject))
		return subject;
	},
	participants: function (id) {
		var subject = new rx.Subject();
		oboe(base+"competitions/"+id+"/competitors")
			.node("!", (c) => subject.onNext(c))
			.done((result) => { subject.onCompleted(); })
			.fail(oboeFail.bind(subject))
		return subject;
	},
	settings: function (id) {
		var subject = new rx.Subject();
		oboe(base+"competitions/"+id+"/distancecombinations")
			.node("!", (c) => subject.onNext(c))
			.done((result) => { subject.onCompleted(); })
			.fail(oboeFail.bind(subject))
		return subject;
	},
}

module.exports = Vantage;
