'use strict';

/**
 * Helper for Excel cells
 * 
 * Currently:
 * - Cell number (A1, B4, etc) conversion 
 *
 */

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Cell = function () {
	function Cell(id, value) {
		_classCallCheck(this, Cell);

		this.id = id;
		this._id = [[].filter.call(id, isNaN).join(""), parseInt([].filter.call(id, function (_) {
			return !isNaN(_);
		}).join(""))];
		this.value = value;
	}

	_createClass(Cell, [{
		key: "d",
		value: function d(dx, dy) {
			var _this = this;

			return function (sheet) {
				return sheet[Cell.move(_this._id, dx, dy).join("")];
			};
		}
	}], [{
		key: "move",
		value: function move(id, dx, dy) {
			if (dx == 0 && dy == 0) return id;
			if (dy != 0) return Cell.move([id[0], id[1] + dy], dx, 0);
			return [Cell.toRadix26(Cell.fromRadix26(id[0]) + dx), id[1]];
		}
	}, {
		key: "fromRadix26",
		value: function fromRadix26(str) {
			if (typeof str != "string") throw new Error(str + " is not a string");
			if (str.length == 0) return 0;
			var l = str.length - 1;
			var current = str[0].charCodeAt(0) - 'A'.charCodeAt(0) + 1;
			return 26 * Cell.fromRadix26(str.substr(0, str.length - 2)) + current;
		}
	}, {
		key: "toRadix26",
		value: function toRadix26(number) {
			if (number <= 0) return number == 0 ? "A" : "";
			var last = number % 26;
			var l = String.fromCharCode('A'.charCodeAt(0) + last - 1);
			return (number - last > 0 ? Cell.toRadix26((number - last) / 26) : '') + l;
		}
	}]);

	return Cell;
}();

module.exports = Cell;