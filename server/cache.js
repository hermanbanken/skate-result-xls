var fs = require('fs');
var crypto = require('crypto');

function cache(key, options, get, callback){
	if(typeof options == 'function'){
		callback = get;
		get = options;
		options = {};
	}
	
	var hash = crypto.createHash('md5').update(key).digest('hex');
	var file = 'cache/'+(options.prefix || "")+hash+(options.postfix || "");
	fs.stat(file, function (err, stats) {
		if (!err && (typeof options.expired != 'function' || !options.expired(stats))) {
			fs.readFile(file, 'binary', callback);
		} else {
			get(function(err, data) {
				if(err)
					throw err;
				fs.writeFile(file, data, 'binary', function(err, success) {
					callback(err, Buffer.isBuffer(data) ? data.toString("binary") : data);
				});
			});
		}
	});
}

function maxAge(count, type) {
	var delta = 0;
	switch(type) {
		case 'd': delta = count * 1000 * 3600 * 24; break;
		case 'h': delta = count * 1000 * 3600; break;
		case 'm': delta = count * 1000 * 60; break;
		case 's': delta = count * 1000; break;
	}
	return (stats) => (new Date()).getTime() - stats.mtime.getTime() > delta;
}

cache.maxAge = maxAge;

module.exports = cache;