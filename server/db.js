var Rx = require("rx");
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('test.db');
db.run("CREATE TABLE if not exists Competitions (id TEXT, starts INTEGER, ends INTEGER, venue TEXT, name TEXT, full BLOB);");
db.close();

Rx.Observable.prototype.cached = function (db, config) {
    this.startWith();
}

const date = {
    from: (date) => (date instanceof Date ? date : new Date(date)).getTime(),
    to: (millis) => new Date(millis)
};

Observable.of([{ id: "a", id: "b" }]).cached(db, {
    schema: "CREATE TABLE if not exists Competitions (id TEXT, starts INTEGER, ends INTEGER, venue TEXT, name TEXT, full BLOB);",
    write: function(elements) {
        list.forEach(comp => db.run(
            "INSERT INTO Competitions VALUES (?, ?, ?, ?, ?, ?)", 
            comp.id, date.from(comp.starts), date.from(comp.ends), 
            comp.venue && comp.venue.code || comp.venue, comp.name, 
            JSON.stringify(comp)
        ));
    },
    read: function() {
        var results = [];
        db.each("SELECT id, starts, ends, venue, name, full FROM Competitions", function(err, row) {
            results.push(Object.extend(JSON.parse(row.full) || {}, row));
            console.log(row.id + ": " + row.info);
        });
        return results;
    }
})


