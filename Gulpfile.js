var gulp = require("gulp");
var sourcemaps = require("gulp-sourcemaps");
var babel = require("gulp-babel");
var concat = require("gulp-concat");
var shell = require('gulp-shell');
var watch = require('gulp-watch');

gulp.task("build", function () {
  return gulp.src(["web/angular.js", "web/ctrl/*.js"])
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(concat("all.js"))
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("web/dist"));
});

gulp.task("watch", function(cb){
	watch('web/*.js', ['build']).on('end', cb);
});

gulp.task("server", shell.task([
	'nodemon server.js'
]));

gulp.task("default", ['build']);
gulp.task('dev', gulp.parallel('build', 'server', 'watch'));

