"use strict";

var q = require("q");
var parseString = require('xml2js').parseString;
var Cell = require("./Cell");
var zip = require('node-zip');

/**
 * Namespace independent xml navigation 
 */
function x(self, name) {
	if (!name) return self;
	var p = name.split("."),
	    c = p[0];
	var down;
	if (/\[\d+\]/.test(c)) down = self[parseInt(c.replace(/\[|\]/, ''))];else down = self[c] || self["x:" + c];

	if (down) return x(down, p.slice(1).join('.'));
	return;
}

var distanceRegExp = new RegExp("^\\d+m$");

/**
 * Checks if cell represents a name cell that has lap times below itself.
 * @returns Either undefined or the name, inner/outer-lane, laptimes
 */
function toSkateTimes(indexed, cell, i) {
	// must contain name
	if (typeof cell.value != 'string') return;
	// cell above is empty
	if (typeof cell.d(0, -1)(indexed) != 'undefined') return;

	var isInner = cell._id[0].charCodeAt(0) < 'I'.charCodeAt(0);

	var category = (isInner ? cell.d(3, -3) : cell.d(-3, -2))(indexed);
	var pair = (isInner ? cell.d(-3, -3) : cell.d(-9, -3))(indexed);
	category = category && category.value;
	pair = pair && parseInt(pair.value);

	var i = 1,
	    below,
	    right1,
	    right2,
	    obj = {
		name: cell.value, category: category,
		pair: pair, lane: isInner ? "I" : "O",
		times: []
	};

	// Look below the name cell
	do {
		if (i > 1) {
			obj.times.push([below.value, right1, right2]);
		}

		// Distance
		below = cell.d(0, i)(indexed);
		// Passing Time
		right1 = cell.d(1, i)(indexed);
		right1 = right1 && right1.value;
		// Lap Time
		right2 = cell.d(2, i)(indexed) || cell.d(3, i)(indexed);
		right2 = parseFloat(right2 && right2.value).toFixed(3);

		i++;
	} while (below && distanceRegExp.test(below.value));

	if (obj.times.length) return obj;
}

/**
 * Handle JSZip bundle that is an XLSX file
 * @return Q.promise of laptimes per sheet
 */
function handleZip(zip) {

	// Read shared strings: Excel uses this to store all textual cells contents
	var sst = [],
	    sstPromise = q(true);
	if (zip.files["xl/sharedStrings.xml"]) {
		var sstXml = zip.files["xl/sharedStrings.xml"].asText();
		sstPromise = q.nfcall(parseString, sstXml).then(function (result) {
			var strings = x(result, "sst.si").map(function (si) {
				return x(si, "t")[0];
			});
			sst.push.apply(sst, strings);
		});
	}

	// Read sheet names
	var workbookPromise = q(true);
	if (zip.files["xl/workbook.xml"]) {
		// Read both files
		var xmls = ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"].map(function (file) {
			return zip.files[file].asText();
		}).map(function (xmlString) {
			return q.nfcall(parseString, xmlString);
		});
		// Link sheetnames with filenames
		workbookPromise = q.all(xmls).spread(function (result, relations) {
			var rels = x(relations, "Relationships.Relationship").map(function (r) {
				return [r.$.Id, r.$.Target];
			});
			return x(result, "workbook.sheets.[0].sheet").map(function (s) {
				var resourceId = s.$["r:id"];
				var filename = rels.find(function (r) {
					return r[0] == resourceId;
				})[1].replace(/^\/?/, "");
				return { name: s.$.name, id: s.$.sheetId, resourceId: resourceId, filename: filename };
			});
		});
	}

	// Extract xml cell structure
	function xmlCell(cell) {
		// Shared string cell: value == the id in shared strings index
		if (cell.$.t == "s") return new Cell(cell.$.r, sst[parseInt(x(cell, "v.[0]"))]);
		// Normal numeric cell
		return new Cell(cell.$.r, x(cell, "v.[0]"));
	}

	// Extract xml worksheet structure
	function xmlSheetToList(worksheet) {
		var cells = [];
		x(worksheet, "sheetData.[0].row").map(function (row) {
			return x(row, "c").filter(function (cell) {
				return x(cell, "v");
			}).map(xmlCell).filter(function (cell) {
				return cell.value;
			});
		}).forEach(function (row) {
			return cells.push.apply(cells, row);
		});
		return cells;
	}

	// All relevant sheets
	var sheets = Object.keys(zip.files).filter(function (f) {
		return f.indexOf("xl/worksheets/") == 0;
	}).filter(function (f) {
		return f.indexOf("_rels") == -1;
	});

	// Convert sheets: lists of raw cells
	var sheetCellPromises = sheets.map(function (n) {
		return { filename: n.replace(/^\/?/, ""), "file": zip.files[n] };
	}).map(function (sheet) {
		return sstPromise // wait for sst
		.then(function (_) {
			return q.nfcall(parseString, sheet.file.asText());
		}).then(function (xmlroot) {
			return x(xmlroot, "worksheet");
		}).then(xmlSheetToList).then(function (cells) {
			return { filename: sheet.filename, "cells": cells };
		});
	});

	// Convert cells: find lap times
	var timesPromises = sheetCellPromises.map(function (p) {
		return p.then(function (sheet) {
			try {
				var indexed = {};
				sheet.cells.forEach(function (c) {
					return indexed[c.id] = c;
				});
				sheet.results = sheet.cells.map(toSkateTimes.bind(null, indexed)).filter(function (c) {
					return !!c;
				});
				delete sheet.cells;
				return sheet;
			} catch (e) {
				console.error("Error in", sheet.name, e);
			}
		});
	});

	// Link original sheet names
	var worksheetPromises = q.all([workbookPromise, q.all(timesPromises)]).spread(function (workbooks, sheets) {
		return sheets.map(function (s) {
			return {
				name: workbooks.find(function (w) {
					return s.filename == w.filename;
				}).name,
				results: s.results
			};
		});
	});

	// Filter sheets without lap times
	return worksheetPromises.then(function (sheets) {
		return sheets.filter(function (s) {
			return s.results.length;
		});
	}).fail(function (e) {
		return console.error(e);
	});
}

module.exports = {
	handle: function handle(data, options, callback) {
		if (typeof options == 'function') {
			callback = options;
			options = {};
		}
		try {
			handleZip(zip(data, options)).then(function (result) {
				return callback(null, result);
			}).fail(function (error) {
				return callback(error, null);
			});
		} catch (e) {
			callback(e, null);
		}
	}
};