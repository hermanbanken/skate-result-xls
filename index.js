// Run as root script
if(require.main === module) { 
	var fs = require("fs");
	var args = process.argv.slice(0);
	var node = args.shift();
	var script = args.shift();
	
	// Given some file names
	if(args.length > 0 && args[0] != "--") {
		// Recursively process all files in sequence
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
	} 
	// Reading std in
	else if(args[0] == "--") {
		require("./stdin")();
	} 
	// Print help
	else {
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
// Included as module
else {
	module.exports = {
		handle: require("./convert").handle,
		examples: require("./examples")
	};
}