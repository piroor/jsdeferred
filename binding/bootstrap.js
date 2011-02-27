var EXPORTED_SYMBOLS = ["Deferred"];
var timers = [];

function setTimeout (f, i) {
	let timer = Components.classes["@mozilla.org/timer;1"]
					.createInstance(Components.interfaces.nsITimer);
	timer.initWithCallback(f, i, timer.TYPE_ONE_SHOT);
	timers.push(timer);
	return timer;
}

function clearTimeout (timer) {
	timers.splice(timers.indexOf(timer), 1);
	timer.cancel();
}

function shutdown()
{
	timers.forEach(clearTimeout);
	setTimeout = void(0);
	clearTimeout = void(0);
	timers = void(0);
}

/*include JSDeferred*/

exports = {};
Deferred.define(exports);
