'use strict';

/**
 * Helper for Excel cells
 * 
 * Currently:
 * - Cell number (A1, B4, etc) conversion 
 *
 */
class Cell {
	constructor(id, value) {
		this.id = id;
		this._id = [
			[].filter.call(id, isNaN).join(""), 
			parseInt([].filter.call(id, _ => !isNaN(_)).join(""))
		];
		this.value = value;
	}
	
	d(dx, dy) {
		return (sheet) => sheet[Cell.move(this._id, dx, dy).join("")];
	}
	
	static move(id, dx, dy) {
		if(dx == 0 && dy == 0)
			return id;
		if(dy != 0)
			return Cell.move([id[0], id[1] + dy], dx, 0);
		return [Cell.toRadix26(Cell.fromRadix26(id[0]) + dx), id[1]];
	}
	
	static fromRadix26(str) {
		if(typeof str != "string")
			throw new Error(str+" is not a string");
		if(str.length == 0)
			return 0;
		var l = str.length - 1;
		var current = str[0].charCodeAt(0) - 'A'.charCodeAt(0) + 1;
		return 26 * Cell.fromRadix26(str.substr(0, str.length - 2)) + current;
	}
	
	static toRadix26(number) {
		if(number <= 0)
			return number == 0 ? "A" : "";
		var last = number % 26;
		var l = String.fromCharCode('A'.charCodeAt(0) + last - 1);
		return (number - last > 0 ? Cell.toRadix26((number - last) / 26) : '') + l;
	}
}

module.exports = Cell;