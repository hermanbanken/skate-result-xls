'use strict';

var handle = require("./convert").handle;
var data = [],
    dataLen = 0;

module.exports = function () {
	var callback = function callback() {};

	process.stdin.on('readable', function () {
		var chunk = process.stdin.read();
		if (chunk !== null) {
			data.push(chunk);
		}
	});
	process.stdin.on('end', function () {
		if (data) {
			var zipBuffer = Buffer.concat(data);
			handle(zipBuffer.toString("base64"), { base64: true }, function (err, result) {
				if (err) process.stderr.write(err.toString() + "\n");else process.stdout.write(JSON.stringify(result) + "\n");
				process.exit(typeof err == 'undefined' ? 0 : 1);
			});
		} else {
			callback();
		}
	});

	return {
		"else": function _else(cb) {
			callback = cb;
		}
	};
};