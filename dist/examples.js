"use strict";

var handle = require("./convert").handle;

var http = require("http");
function fromUrl(xlsxURL, callback) {
	http.get(xlsxURL, function (res) {
		res.setEncoding('binary');
		var data = "";
		res.on('data', function (chunk) {
			return data += chunk;
		});
		res.on('end', function () {
			handle(data, callback);
		});
		res.on('error', function (err) {
			console.error("Error during HTTP request");
			callback(err, null);
		});
	});
}

var fs = require("fs");
function fromFile(xlsxFile, callback) {
	fs.readFile(xlsxFile, function (err, data) {
		handle(data, callback);
	});
}

module.exports = { fromUrl: fromUrl, fromFile: fromFile };