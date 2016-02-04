var gulp = require("gulp");
var sourcemaps = require("gulp-sourcemaps");
var babel = require("gulp-babel");
var concat = require("gulp-concat");
var shell = require('gulp-shell');
var watch = require('gulp-watch');
var es = require('event-stream');

gulp.task("build", function () {
  return gulp.src(["web/angular.js", "web/ctrl/*.js"])
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(concat("all.js"))
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("web/dist"));
});

gulp.task("build-module", function() {
	var root = gulp.src([
		"index.js",
		"convert.js",
		"Cell.js",
		"stdin.js", 
		"server.js",
		"examples.js",
		"module-api.js",
		])
    .pipe(babel())
    .pipe(gulp.dest("dist"));
		
	var server = gulp.src([	"server/*.js" ])
		.pipe(babel())
		.pipe(gulp.dest("dist/server"));

	return es.concat(root, server);
})

gulp.task("watch", function(cb){
	watch('web/*.js', ['build']).on('end', cb);
});

gulp.task("server", shell.task([
	'nodemon server.js'
]));

gulp.task("default", ['build']);
gulp.task('dev', ['build', 'server', 'watch']);

