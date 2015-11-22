if(require.main === module) { 
	const fs = require("fs");
	
	var args = process.argv.slice(0);
	var node = args.shift();
	var script = args.shift();
	if(args.length > 0 && args[0] != "--") {
		function check(files, callback, prevFiles) {
			if(files.length == 0) {
				callback(null, prevFiles);
			}
			var file = files[0];
			fs.stat(file, function(err, stat) {
				if(err == null) {
					require("./examples").fromFile(file, function(err, result){
						if(result)
							process.stdout.write(JSON.stringify(result)+"\n");
						check(files.slice(1), callback, (prevFiles || 0)+1);
					});
				} else if(err.code == 'ENOENT') {
					// Argument is non existing file
					console.log("non existing");
					check(files.slice(1), callback, (prevFiles || 0)+1);
				} else {
					process.stderr.write("Some other error: "+err.code+"\n");
					callback(err, prevFiles);
				}
			});
		}
		check(args.slice(0), function(err, count) {
			process.stderr.write(`Converted ${count} files\n`);
			process.exit(err ? 1 : 0);
		});
	} else if(args[0] == "--") {
		require("./stdin")();
	} else {
		console.log("XLSX to Lap Times converter")
		console.log("Usage:")
		console.log("");
		console.log(" - provide one or more arguments to convert the xlsx files to json.")
		console.log("");
		console.log("    $ node index.js [file1] [file2] [files...]");
		console.log("");
		console.log(" - via stdin which will be threated as a xlsx-file.");
		console.log("");
		console.log("    $ node index.js --");
		console.log("");
		process.exit(0);
	}
}
else {
	module.exports = {
		handle: require("./convert").handle,
		examples: require("./examples")
	};
}