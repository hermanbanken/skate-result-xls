'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var q = require('q');
var fs = require('fs');
var crypto = require('crypto');
var debugF = require('debug')('cache');

function cache(key, options, get, callback) {
	if (typeof options == 'function') {
		callback = get;
		get = options;
		options = {};
	}

	var encoding = options.encoding || 'utf8';

	var hash = crypto.createHash('md5').update(key).digest('hex');
	var file = 'cache/' + (options.prefix || "") + hash + (options.postfix || "");

	function writeBack(value) {
		return q.nfcall(fs.writeFile, file, value, encoding).then(function (_) {
			return Buffer.isBuffer(value) ? value.toString(encoding) : value;
		});
	}

	function debug(msg) {
		return function (v) {
			return debugF(key.substr(0, 15), { msg: msg, value: { length: v.length, type: typeof v === 'undefined' ? 'undefined' : _typeof(v) } });
		};
	}

	return q.nfcall(fs.stat, file).then(function (stats) {
		return typeof options.expired != 'function' || !options.expired(stats) ? q(true) : q.reject("expired cache").tap(debug("cache expired"));
	}).then(function (_) {
		return q.nfcall(fs.readFile, file, encoding).tap(debug("using cache"));
	}).fail(function (e) {
		return assumePromise(get).then(writeBack);
	}).nodeify(callback);
}

/**
 * Savely assume the function returns a promise, 
 * otherwise catch the callback and resolve the promise that way.
 */
function assumePromise(f) {
	var deferred = q.defer();

	// f might return a promise
	var maybePromise = f(function (e, r) {
		if (q.isPromise(maybePromise)) return console.warn("The function is both a function and called this callback. Preventing duplicate callback now.");
		// Callback style
		else e ? deferred.reject(e) : deferred.resolve(r);
	});

	// Forward	
	if (q.isPromise(maybePromise)) maybePromise.then(deferred.resolve, deferred.reject, deferred.notify);

	return deferred.promise;
}

function maxAge(count, type) {
	var delta = 0;
	switch (type) {
		case 'd':
			delta = count * 1000 * 3600 * 24;break;
		case 'h':
			delta = count * 1000 * 3600;break;
		case 'm':
			delta = count * 1000 * 60;break;
		case 's':
			delta = count * 1000;break;
	}
	return function (stats) {
		return new Date().getTime() - stats.mtime.getTime() > delta;
	};
}

cache.maxAge = maxAge;

cache.delete = function (key, options) {
	if (!options) options = {};

	var hash = crypto.createHash('md5').update(key).digest('hex');
	var file = 'cache/' + (options.prefix || "") + hash + (options.postfix || "");

	return q.nfcall(fs.unlink, file);
};

module.exports = cache;